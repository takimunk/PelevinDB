"""First computational look at the semantics of Pelevin's books: public/blog/eda.json + public/blog/eda-freq.json.

Reads data/pelevin.json and the plain texts cached by `npm run pelevin:ingest` (node_modules/.cache/pelevin/).
Every statistic is computed over the complete text of every work: no page sampling, no truncation, no token caps.

Setup (once):  python3 -m venv .venv-eda && .venv-eda/bin/pip install pymorphy3 numpy scikit-learn scipy
Run:           .venv-eda/bin/python scripts/eda-pelevin.py      (or `npm run pelevin:eda` with that python first on PATH)
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pymorphy3
from sklearn.decomposition import NMF, PCA, TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.manifold import TSNE
from sklearn.preprocessing import normalize as l2

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "data" / "pelevin.json"
CACHE = ROOT / "node_modules" / ".cache" / "pelevin"
OUT = ROOT / "public" / "blog"

MATTR_WINDOW = 500
CHUNK_WORDS = 2000
TOPICS = 10
FREQ_VOCAB = 4000
DISTINCTIVE = 30

# Same token definition as scripts/pelevin-lib.ts `words()` ([\p{L}\p{N}]+), so `words` matches data/pelevin.json.
COUNT_WORD = re.compile(r"[^\W_]+")
# Lemmatisation keeps hyphenated words whole ("что-то", "кое-как").
WORD = re.compile(r"[a-zа-яё]+(?:-[a-zа-яё]+)*", re.IGNORECASE)
SENTENCE_END = re.compile(r"(?<=[.!?…])[»\"”)]*\s+(?=[«\"„(—–\-A-ZА-ЯЁ0-9])")
DIALOGUE = re.compile(r"^\s*(?:[—–]|-\s)")

# Russian function words (NLTK's list plus pronoun, particle and filler lemmas), compared after lemmatisation.
STOPWORDS = set(
    """
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет
о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего
ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот
того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при
наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо
свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между весь свой мочь сказать это оно
такой который свое наш ваш их кой некоторый каждый любой самый сам сей оный никто ничто нечто некто кое-что что-то
что-нибудь кто-то где-то как-то когда-то почему-то какой-то чей чей-то тот-то вон вроде ибо либо зато причем притом
пусть пускай ах ох эх ой ага угу ого бы же ли мол дескать де-то итак также затем поэтому однако хотя словно точно
именно вообще просто очень весьма слишком довольно тоже там-то тут-то сюда туда оттуда отсюда здесь-то стать
""".split()
)
CONTENT_POS = {"NOUN", "ADJF", "ADJS", "COMP", "VERB", "INFN", "PRTF", "PRTS", "GRND", "ADVB", "PRED"}
NAME_TAGS = {"Name", "Surn", "Patr"}
EN_STOP = set("the a an of to in and or is are be it i you he she we they that this for on with as at by from not no yes my your".split())

# Hand-curated semantic fields (lemmas as pymorphy3 gives them, ё → е).
FIELDS = [
    ("void", "Emptiness & Buddhism", "Пустота и буддизм",
     "пустота пустой ничто небытие будда буддизм буддийский буддист дзен дзэн нирвана сансара карма медитация медитировать просветление "
     "просветлеть сатори дхарма мантра лама монах бодхисаттва иллюзия иллюзорный майя освобождение джана випассана самадхи коан тибет "
     "тибетский йога йог гуру абсолют дао даосизм шуньята архат ступа будда-поле пробуждение пробудиться"),
    ("money", "Money & marketing", "Деньги и маркетинг",
     "деньги денежный доллар рубль бакс бизнес бизнесмен банк банкир кредит прибыль рынок рыночный маркетинг маркетолог реклама рекламный "
     "бренд брендинг слоган копирайтер криэйтор товар потребитель потребление продажа продать продавать купить покупать покупатель цена "
     "стоить капитал капитализм офшор инвестор инвестиция миллион миллиард олигарх корпорация корпоративный компания клиент фирма "
     "валюта финансовый бюджет биржа контракт пиар гламур дискурс баблос бабло"),
    ("power", "Power & secret services", "Власть и спецслужбы",
     "власть государство государственный чекист кгб фсб спецслужба генерал полковник майор офицер начальник президент кремль министр "
     "министерство чиновник режим политика политический партия выборы депутат милиция милиционер полиция полицейский следователь агент "
     "разведка контрразведка шпион империя имперский император царь диктатура тоталитарный оппозиция либерал либеральный революция "
     "приказ секретный лубянка силовик прокурор суд тюрьма лагерь зона масон масонский заговор конспирология"),
    ("tech", "Technology & AI", "Технологии и ИИ",
     "компьютер компьютерный программа программист алгоритм сеть сетевой интернет сайт сервер код файл экран монитор клавиатура "
     "виртуальный цифровой робот андроид нейросеть нейросетевой имплант процессор гаджет смартфон айфон телефон хакер данные технология "
     "технологический киберпанк дрон чип интерфейс пользователь аккаунт онлайн симуляция симулятор матрица интеллект алгоритмический "
     "мозговой баночный сингулярность трансгуманизм"),
    ("drugs", "Drugs & psychedelics", "Вещества и психоделики",
     "наркотик наркоман наркотический кокаин героин лсд мухомор гриб марихуана анаша конопля гашиш мескалин мескалито пейот кетамин "
     "экстази амфетамин таблетка доза кайф трип галлюцинация галлюциноген психоделический психоделик вштырить штырить укурка "
     "укуриться шприц косяк нюхнуть кислота торчать приход дурь"),
    ("animals", "Insects & animals", "Насекомые и звери",
     "насекомое муха комар муравей жук таракан бабочка мотылек пчела оса скарабей навозник стрекоза цикада клоп вошь червь паук "
     "гусеница личинка кокон крыло волк лиса лис собака пес кошка кот крыса мышь курица цыпленок бройлер птица ворона свинья корова бык "
     "конь лошадь обезьяна зверь животное змея крокодил хомяк"),
    ("supernatural", "Vampires & werewolves", "Вампиры и оборотни",
     "вампир вампирский оборотень верволк упырь укус клык дракула ведьма колдун колдовство демон бес черт призрак привидение магия "
     "магический маг заклинание мертвец зомби нежить халдей мистический оккультный сверхъестественный волшебный волшебство чудовище "
     "монстр кровосос вурдалак"),
    ("religion", "Religion & God", "Религия и Бог",
     "бог господь божий божественный христос иисус церковь храм молитва молиться вера верить священник поп батюшка ангел рай ад грех "
     "душа святой библия евангелие апостол пророк аллах ислам мусульманин мечеть коран христианство христианский православный "
     "православие крест спаситель творец демиург дьявол сатана жрец культ мистерия религия религиозный"),
    ("death", "Death", "Смерть",
     "смерть умереть умирать мертвый покойник покойный труп гроб могила кладбище похороны хоронить гибель погибнуть гибнуть смертный "
     "бессмертие бессмертный загробный посмертный скелет череп агония предсмертный кончина морг самоубийство суицид покойница"),
    ("soviet", "The Soviet past", "Советское прошлое",
     "советский ссср коммунизм коммунист коммунистический социализм социалистический ленин сталин брежнев партийный комсомол комсомолец "
     "комсомольский пионер пионерский райком горком обком цк кпсс совок колхоз колхозный пятилетка госплан товарищ космонавт луноход "
     "гагарин перестройка горбачев агитация лозунг плакат съезд генсек политрук замполит красноармеец большевик ленинский "
     "советский-союз"),
    ("body", "Sex & body", "Секс и тело",
     "секс сексуальный эротический эротика оргазм любовник любовница проститутка шлюха грудь член пенис вагина тело голый обнаженный "
     "поцелуй целовать постель раздеться возбуждение страсть кожа губа бедро порно порнография фаллос фаллический мастурбация минет "
     "трахаться ебать хуй пизда жопа сперма эрекция либидо интимный дилдо"),
    ("war", "War & violence", "Война и насилие",
     "война воевать солдат армия армейский бой битва сражение фронт враг оружие автомат пистолет винтовка пулемет пуля выстрел "
     "стрелять снаряд бомба взрыв взорвать танк ракета убить убийство убийца кровь насилие драка удар ударить нож меч сабля атака "
     "штурм террорист терроризм джихад окоп ранение раненый расстрелять"),
    ("mind", "Consciousness, mind & dream", "Сознание, ум и сон",
     "сознание ум разум мысль мышление восприятие воспринимать реальность сон сниться сновидение психика психический психология "
     "психолог психиатр психиатрический мозг субъект объект личность наблюдатель внимание осознать осознание осознанный солипсизм "
     "феномен трансцендентный метафизика метафизический философия философский философ нейрон бред безумие безумный сумасшедший "
     "психбольница шизофрения галлюцинировать"),
]

# Readable names for NMF topics, matched by anchor lemmas among each topic's top terms (first match wins).
TOPIC_NAMES = [
    ({"вампир", "халдей", "баблос", "баблосый", "баблоса"}, "Vampire economics", "Вампирская экономика"),
    ({"баночный", "имплант", "баночник"}, "Brains in jars", "Мозги в банках"),
    ({"корпорация", "симуляция", "нейросеть"}, "Corporations & simulations", "Корпорации и симуляции"),
    ({"ангел", "медиум", "призрак"}, "Angels, mediums & ghosts", "Ангелы, медиумы, призраки"),
    ({"император", "римский", "жрец", "храм"}, "Rome, gods & empire", "Рим, боги, империя"),
    ({"ум", "сознание", "реальность"}, "Mind & emptiness", "Ум и пустота"),
    ({"российский", "читатель", "информация", "являться"}, "Russia, media & essay voice", "Россия, медиа, эссеистика"),
    ({"женщина", "мужчина", "нравиться", "любовь"}, "Men, women & desire", "Мужчины, женщины, желание"),
    ({"дверь", "коридор", "стакан", "бутылка"}, "Rooms, bottles & corridors", "Комнаты, бутылки, коридоры"),
    ({"земля", "небо", "лететь", "крыло"}, "Earth, sky & flight", "Земля, небо, полёт"),
    ({"насекомое", "муха", "комар", "муравей"}, "Insects", "Насекомые"),
    ({"реклама", "бренд", "слоган"}, "Advertising & brands", "Реклама и бренды"),
]


def load():
    meta = json.loads(LIST.read_text(encoding="utf-8"))
    works = sorted(meta["works"], key=lambda w: (w["year"], ["novel", "novella", "story", "essay", "interview"].index(w["kind"]), w["title"]))
    texts = {}
    for w in works:
        path = CACHE / f"{w['id']}.txt"
        if not path.exists():
            sys.exit(f"missing {path}: run `npm run pelevin:ingest` first")
        texts[w["id"]] = path.read_text(encoding="utf-8")
    return works, texts


class Lemmatizer:
    def __init__(self):
        self.morph = pymorphy3.MorphAnalyzer()
        self.cache: dict[str, tuple[str, str, bool]] = {}

    def __call__(self, word: str):
        hit = self.cache.get(word)
        if hit is None:
            p = self.morph.parse(word)[0]
            pos = "LATN" if "LATN" in p.tag else (str(p.tag.POS) if p.tag.POS else "")
            lemma = p.normal_form.replace("ё", "е")
            name = any(t in p.tag for t in NAME_TAGS)
            hit = (lemma, pos, name)
            self.cache[word] = hit
        return hit


def mattr(tokens: list[str], window=MATTR_WINDOW) -> float:
    n = len(tokens)
    if n <= window:
        return len(set(tokens)) / max(1, n)
    counts = Counter(tokens[:window])
    total = len(counts)
    acc = total
    for i in range(window, n):
        out, inc = tokens[i - window], tokens[i]
        counts[out] -= 1
        if counts[out] == 0:
            total -= 1
            del counts[out]
        if counts[inc] == 0:
            total += 1
        counts[inc] += 1
        acc += total
    return acc / (n - window + 1) / window


def is_content(lemma: str, pos: str) -> bool:
    if pos == "LATN":
        return len(lemma) >= 3 and lemma not in EN_STOP
    return pos in CONTENT_POS and len(lemma) >= 2 and lemma not in STOPWORDS


def analyse(text: str, lem: Lemmatizer):
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    low = text.lower()
    words = len(COUNT_WORD.findall(low))
    raw = WORD.findall(text.replace("ё", "е").replace("Ё", "Е"))
    forms = [r.lower() for r in raw]
    lemmas, content, tagged_names = [], [], set()
    caps = Counter()  # lemma → capitalised occurrences, to spot proper names pymorphy does not tag
    for r, f in zip(raw, forms):
        lemma, pos, name = lem(f)
        lemmas.append(lemma)
        if is_content(lemma, pos):
            content.append(lemma)
            if name:
                tagged_names.add(lemma)
            if r[0].isupper():
                caps[lemma] += 1
    sentence_lengths, questions, exclaims = [], 0, 0
    for p in paragraphs:
        for s in SENTENCE_END.split(p):
            n = len(WORD.findall(s.lower()))
            if not n:
                continue
            sentence_lengths.append(n)
            tail = s.rstrip(" »\"”)")
            questions += tail.endswith("?") or tail.endswith("?!") or tail.endswith("?..")
            exclaims += tail.endswith("!") or tail.endswith("!..")
    counts = Counter(lemmas)
    return {
        "words": words,
        "forms": forms,
        "lemmas": lemmas,
        "content": content,
        "taggedNames": tagged_names,
        "caps": caps,
        "counts": counts,
        "sentences": len(sentence_lengths),
        "sentenceLen": float(np.mean(sentence_lengths)) if sentence_lengths else 0.0,
        "sentenceLenP90": float(np.percentile(sentence_lengths, 90)) if sentence_lengths else 0.0,
        "questionShare": questions / max(1, len(sentence_lengths)),
        "exclaimShare": exclaims / max(1, len(sentence_lengths)),
        "dialogueShare": sum(bool(DIALOGUE.match(p)) for p in paragraphs) / max(1, len(paragraphs)),
        "wordLen": float(np.mean([len(f) for f in forms])) if forms else 0.0,
    }


def log_odds(book: Counter, rest: Counter, prior: Counter, prior_total: float, top=DISTINCTIVE):
    """Weighted log-odds ratio with an informative Dirichlet prior (Monroe, Colaresi & Quinn 2008), as z-scores."""
    n_i, n_j = sum(book.values()), sum(rest.values())
    out = []
    for w, y_i in book.items():
        if y_i < 3:
            continue
        a = prior[w]
        y_j = rest.get(w, 0)
        d = math.log((y_i + a) / (n_i + prior_total - y_i - a)) - math.log((y_j + a) / (n_j + prior_total - y_j - a))
        z = d / math.sqrt(1 / (y_i + a) + 1 / (y_j + a))
        out.append((w, z))
    out.sort(key=lambda x: -x[1])
    return [[w, round(z, 2)] for w, z in out[:top]]


def spearman(x, y):
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def main():
    works, texts = load()
    lem = Lemmatizer()
    stats = {}
    for w in works:
        stats[w["id"]] = analyse(texts[w["id"]], lem)
        if stats[w["id"]]["words"] != w["words"]:
            sys.exit(f"word count mismatch for {w['id']}: eda {stats[w['id']]['words']} vs data/pelevin.json {w['words']}")
    ids = [w["id"] for w in works]
    fiction = [i for i, w in enumerate(works) if w["kind"] != "interview"]

    # Proper names: tagged by pymorphy3, or capitalised in at least 70% of 3+ occurrences (catches invented names
    # such as "Грым" or "Ломас" that pymorphy lemmatises as common words).
    occurrences, capitalised, names = Counter(), Counter(), set()
    for i in ids:
        occurrences.update(stats[i]["content"])
        capitalised.update(stats[i]["caps"])
        names |= stats[i]["taggedNames"]
    names |= {l for l, n in occurrences.items() if n >= 3 and capitalised[l] / n >= 0.7}
    # Lemmas concentrated in one work (≥ 70% of their occurrences) are mostly invented words and names: they are
    # kept for `distinctive` but left out of the shared map and topics, which should compare themes, not casts.
    per_book_counts = {i: Counter(stats[i]["content"]) for i in ids}
    concentrated = {l for l, n in occurrences.items() if n >= 5 and max(per_book_counts[i][l] for i in ids) / n >= 0.7}
    for i in ids:
        stats[i]["contentNoNames"] = [l for l in stats[i]["content"] if l not in names]
        stats[i]["thematic"] = [l for l in stats[i]["contentNoNames"] if l not in concentrated]

    # ---------- per-book stylometry ----------
    books = []
    for w in works:
        s = stats[w["id"]]
        c = s["counts"]
        types = len(c)
        books.append({
            "id": w["id"], "title": w["title"], "titleEn": w["titleEn"], "year": w["year"], "kind": w["kind"],
            "words": s["words"], "sentences": s["sentences"], "lemmas": types,
            "mattr": round(mattr(s["forms"]), 4),
            "sentenceLen": round(s["sentenceLen"], 2), "sentenceLenP90": round(s["sentenceLenP90"], 1),
            "wordLen": round(s["wordLen"], 3),
            "dialogueShare": round(s["dialogueShare"], 4), "questionShare": round(s["questionShare"], 4), "exclaimShare": round(s["exclaimShare"], 4),
            "hapaxShare": round(sum(1 for v in c.values() if v == 1) / max(1, types), 4),
            "pronounI": round(c["я"] / s["words"] * 1000, 2), "pronounWe": round(c["мы"] / s["words"] * 1000, 2),
        })

    # ---------- distinctive words ----------
    content_counts = per_book_counts
    no_name_counts = {i: Counter(stats[i]["contentNoNames"]) for i in ids}

    def distinctive_all(counts):
        total = Counter()
        for c in counts.values():
            total.update(c)
        prior_total = float(sum(total.values()))
        return {i: log_odds(counts[i], total - counts[i], total, prior_total) for i in ids}

    distinctive = distinctive_all(content_counts)
    distinctive_common = distinctive_all(no_name_counts)

    # ---------- semantic fields ----------
    fields = []
    for key, en, ru, lemmas in FIELDS:
        lemmas = sorted(set(lemmas.split()))
        per_book = [round(sum(stats[i]["counts"][l] for l in lemmas) / stats[i]["words"] * 1e4, 2) for i in ids]
        used = [l for l in lemmas if any(stats[i]["counts"][l] for i in ids)]
        fields.append({"key": key, "en": en, "ru": ru, "lemmas": lemmas, "used": len(used), "perBook": per_book})

    # ---------- equal-length chunks that cover every text end to end ----------
    # Whole-book TF-IDF vectors put every short story in a corner of the map just for being short (sparse),
    # so the map, the similarities and the topics all start from ~2,000-running-word chunks.
    chunk_docs, chunk_book = [], []
    for b, i in enumerate(ids):
        toks = stats[i]["thematic"]
        n = max(1, round(stats[i]["words"] / CHUNK_WORDS))
        bounds = np.linspace(0, len(toks), n + 1).astype(int)
        for a, z in zip(bounds[:-1], bounds[1:]):
            chunk_docs.append(" ".join(toks[a:z]))
            chunk_book.append(b)
    chunk_book = np.array(chunk_book)
    assert sum(len(d.split()) for d in chunk_docs) == sum(len(stats[i]["thematic"]) for i in ids)
    fit_rows = np.isin(chunk_book, fiction)
    tv = TfidfVectorizer(analyzer=str.split, sublinear_tf=True, min_df=5, max_df=0.5)
    tv.fit([d for d, f in zip(chunk_docs, fit_rows) if f])
    C = tv.transform(chunk_docs)  # rows are L2-normalised
    tvocab = np.array(tv.get_feature_names_out())
    lengths = np.array([len(d.split()) for d in chunk_docs], dtype=float)

    def per_book(M):
        """Length-weighted mean of a book's chunk rows."""
        return np.vstack([np.asarray((M[chunk_book == b].T @ lengths[chunk_book == b]) / lengths[chunk_book == b].sum()).ravel() for b in range(len(ids))])

    # ---------- similarity and LSA map ----------
    B = l2(per_book(C))
    sim = B @ B.T
    svd = TruncatedSVD(n_components=50, random_state=0).fit(C[fit_rows])
    Z = l2(per_book(svd.transform(C)))
    pca = PCA(n_components=2, random_state=0).fit(Z[fiction])
    xy = pca.transform(Z)
    loadings = svd.components_.T @ pca.components_.T  # vocab × 2
    components = []
    for k in range(2):
        order = np.argsort(loadings[:, k])
        components.append({"positive": tvocab[order[::-1][:15]].tolist(), "negative": tvocab[order[:15]].tolist(), "explained": round(float(pca.explained_variance_ratio_[k]), 3)})
    tsne = TSNE(n_components=2, perplexity=min(15, len(ids) - 1), metric="cosine", init="pca", random_state=0).fit_transform(Z)

    # ---------- NMF topics ----------
    nmf = NMF(n_components=TOPICS, init="nndsvda", random_state=0, max_iter=2000, tol=1e-5).fit(C[fit_rows])
    W = nmf.transform(C)
    W = W / np.maximum(W.sum(axis=1, keepdims=True), 1e-12)
    topics, used_names = [], set()
    for t in range(TOPICS):
        terms = tvocab[np.argsort(nmf.components_[t])[::-1][:12]].tolist()
        name = next(((en, ru) for anchors, en, ru in TOPIC_NAMES if anchors & set(terms[:8]) and en not in used_names), None)
        if name:
            used_names.add(name[0])
        per_book = []
        for b in range(len(ids)):
            m = chunk_book == b
            per_book.append(round(float((W[m, t] * lengths[m]).sum() / lengths[m].sum()), 4))
        topics.append({"id": t, "en": name[0] if name else " · ".join(terms[:3]), "ru": name[1] if name else " · ".join(terms[:3]), "terms": terms, "perBook": per_book})

    # ---------- frequency table ----------
    total = Counter()
    for i in ids:
        total.update(content_counts[i])
    freq_vocab = [w for w, _ in total.most_common(FREQ_VOCAB)]
    freq = {
        "vocab": freq_vocab,
        "perBook": [[round(content_counts[i][w] / stats[i]["words"] * 1e4, 2) for w in freq_vocab] for i in ids],
        "totals": [total[w] for w in freq_vocab],
        "books": ids,
    }

    method = {
        "tokenizer": "regex words ([\\p{L}\\p{N}]+ for counts, hyphenated Cyrillic/Latin words for lemmas); sentences split after . ! ? … before a capital, quote or dash",
        "lemmatizer": f"pymorphy3 {pymorphy3.__version__} (first parse, ё→е)",
        "stopwords": len(STOPWORDS),
        "vocabSize": int(len(tvocab)),
        "chunks": int(len(chunk_docs)),
        "properNames": len(names),
        "concentratedLemmas": len(concentrated),
        "notes": [
            "Every statistic covers the complete text of every work: no page sampling, no truncation, no caps on lemmatisation or TF-IDF.",
            "Per-book `words` equals data/pelevin.json (same [\\p{L}\\p{N}]+ tokeniser); the script aborts if they differ.",
            f"NMF (k={TOPICS}) is fitted on the same chunks; a book's topic share is the length-weighted mean of its chunks' normalised topic weights.",
            "Texts: one edition per work, deduplicated by content from the EPUB folder (scripts/ingest-pelevin.ts); front matter, publisher imprints and footnote bodies removed.",
            "Content lemmas: nouns, adjectives, verbs, participles, gerunds, adverbs and predicatives (plus Latin words of 3+ letters) minus the stopword list.",
            "`mattr`: moving-average type/token ratio over word forms, window 500 (plain TTR for texts shorter than the window).",
            "`hapaxShare`: lemmas that occur once in the book / distinct lemmas; it grows as texts get shorter.",
            "`dialogueShare`: paragraphs that open with a dash (—, – or a spaced hyphen); `questionShare`/`exclaimShare`: sentences ending in ? / !.",
            "`distinctive`: weighted log-odds with an informative Dirichlet prior (Monroe et al. 2008), book vs the rest of the corpus, prior = whole-corpus counts; z-scores, lemmas seen at least 3 times in the book. `distinctiveCommon` repeats it without proper names.",
            "`fields`: occurrences of the listed lemmas per 10,000 words; `used` counts lemmas that occur at least once.",
            "Proper names = lemmas tagged Name/Surn/Patr by pymorphy3 or capitalised in ≥70% of their 3+ occurrences (catches invented names).",
            "Map, similarity and topics compare themes, not casts: they drop proper names and lemmas with ≥70% of their occurrences in a single work (invented words); `distinctive` keeps both.",
            f"Map, similarity and topics start from consecutive ~{CHUNK_WORDS:,}-running-word chunks that together cover every text end to end (a text shorter than that is one chunk), so that length alone does not separate short stories from novels.",
            "`map.lsa`: chunk TF-IDF (sublinear tf, L2, min_df 5, max_df 0.5) → TruncatedSVD 50D → length-weighted mean per book → L2 → PCA 2D; `map.tsne` is t-SNE (cosine, perplexity 15) of the same 50D book vectors; `components` list the lemmas with the largest loadings on each PCA axis.",
            "Interviews are included and flagged by `kind`; the TF-IDF vocabulary, SVD, PCA and NMF are fitted on the fiction and essays only, and interviews are projected afterwards.",
            "`similarity`: cosine of book TF-IDF vectors (length-weighted mean of the book's L2-normalised chunk vectors).",
        ],
    }
    eda = {
        "version": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": method,
        "books": books,
        "distinctive": distinctive,
        "distinctiveCommon": distinctive_common,
        "fields": fields,
        "map": {
            "lsa": [[round(float(a), 4), round(float(b), 4)] for a, b in xy],
            "tsne": [[round(float(a), 3), round(float(b), 3)] for a, b in tsne],
            "components": components,
        },
        "similarity": [[round(float(v), 3) for v in row] for row in sim],
        "topics": topics,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "eda.json").write_text(json.dumps(eda, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "eda-freq.json").write_text(json.dumps(freq, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for f in ("eda.json", "eda-freq.json"):
        print(f"{f}: {(OUT / f).stat().st_size / 1024:.0f} KB")

    if "--report" in sys.argv:
        report(works, books, fields, topics, components, sim, distinctive_common, xy)


def report(works, books, fields, topics, components, sim, distinctive, xy):
    """Plain numbers for writing up findings."""
    ids = [b["id"] for b in books]
    novels = [k for k, b in enumerate(books) if b["kind"] == "novel"]
    fic = [k for k, b in enumerate(books) if b["kind"] != "interview"]
    years = np.array([b["year"] for b in books])
    print("\nnovels:")
    for k in novels:
        b = books[k]
        print(f"  {b['year']} {b['title'][:34]:34} {b['words']:>7} w  mattr {b['mattr']:.3f}  sent {b['sentenceLen']:5.1f}/{b['sentenceLenP90']:4.0f}  dlg {b['dialogueShare']:.2f}  ?{b['questionShare']:.3f} !{b['exclaimShare']:.3f}  я {b['pronounI']:5.1f} мы {b['pronounWe']:4.1f}  lsa {xy[k][0]:+.2f},{xy[k][1]:+.2f}")
    for key in ("mattr", "sentenceLen", "dialogueShare", "questionShare", "pronounI", "wordLen"):
        v = np.array([books[k][key] for k in novels])
        print(f"  spearman(year, {key}) over novels = {spearman(years[novels], v):+.2f}; by decade:", {d: round(float(np.mean([books[k][key] for k in novels if books[k]['year'] // 10 * 10 == d])), 3) for d in (1990, 2000, 2010, 2020)})
    print("\nfields (per 10k words, novels by decade; spearman with year over fiction):")
    for f in fields:
        dec = {d: round(float(np.mean([f["perBook"][k] for k in novels if books[k]['year'] // 10 * 10 == d])), 1) for d in (1990, 2000, 2010, 2020)}
        top = sorted(fic, key=lambda k: -f["perBook"][k])[:3]
        print(f"  {f['key']:12} used {f['used']}/{len(f['lemmas'])}  {dec}  rho {spearman(years[fic], np.array(f['perBook'])[fic]):+.2f}  top: {[books[k]['title'][:20] + ' ' + str(f['perBook'][k]) for k in top]}")
    print("\ntopics:")
    for t in topics:
        top = sorted(range(len(books)), key=lambda k: -t["perBook"][k])[:4]
        print(f"  {t['id']} {t['en']:28} {' '.join(t['terms'])}  ← {[books[k]['title'][:18] + ' ' + str(round(t['perBook'][k], 2)) for k in top]}")
    print("\nLSA axes:", json.dumps(components, ensure_ascii=False))
    logw = np.log([b["words"] for b in books])
    print("spearman(log words, lsa x) =", round(spearman(logw, xy[:, 0]), 2), " (log words, lsa y) =", round(spearman(logw, xy[:, 1]), 2), " (year, lsa x/y over novels) =", round(spearman(years[novels], xy[novels, 0]), 2), round(spearman(years[novels], xy[novels, 1]), 2))
    pairs = sorted(((sim[a][b], a, b) for a in fic for b in fic if a < b), reverse=True)
    print("\nmost similar pairs:", [(books[a]["title"][:22], books[b]["title"][:22], round(float(s), 3)) for s, a, b in pairs[:12]])
    nov_pairs = sorted(((sim[a][b], a, b) for a in novels for b in novels if a < b), reverse=True)
    print("most similar novel pairs:", [(books[a]["title"][:22], books[b]["title"][:22], round(float(s), 3)) for s, a, b in nov_pairs[:10]])
    print("least similar novel pairs:", [(books[a]["title"][:22], books[b]["title"][:22], round(float(s), 3)) for s, a, b in nov_pairs[-5:]])
    print("\ndistinctive (no names), novels:")
    for k in novels:
        print(f"  {books[k]['title'][:30]:30} {', '.join(w for w, _ in distinctive[ids[k]][:12])}")
    by_len = sorted(books, key=lambda b: -b["words"])
    print("\nlongest:", [(b["title"], b["words"]) for b in by_len[:5]], "shortest:", [(b["title"], b["words"]) for b in by_len[-5:]])


if __name__ == "__main__":
    main()
