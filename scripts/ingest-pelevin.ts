// Builds the Pelevin corpus from a folder of EPUBs: splits collections into works, deduplicates by content,
// writes the curated list to data/pelevin.json, plain texts to node_modules/.cache/pelevin/ and the books to the store.
// Usage: npm run pelevin:ingest -- [--dir=/path/to/epubs] [--no-store] [--verbose]
//
// Dedup is by content, never by title: every candidate section is turned into hashed word 8-gram shingles and
// compared with the works already kept (containment = share of the candidate's shingles found in kept works).
// Candidates are visited in preference order: standalone files, then single-author collections, then omnibus
// volumes and anthologies; within a tier, longer texts first, so a fragment never displaces its whole.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openStore } from "../server/store.ts";
import { normalize, PAGE_CHARS, segmentText } from "../src/domain/text.ts";
import { args as readArgs } from "./lib.ts";
import { blocksText, CACHE, containment, DEFAULT_DIR, LIST, flatToc, readEpub, shingles, tocIndex, words, type Block, type TocEntry } from "./pelevin-lib.ts";


const DUPLICATE = 0.8; // containment at or above which a candidate repeats kept text
const PARTIAL = 0.3; // between PARTIAL and DUPLICATE a candidate needs a human look
const MIN_WORDS = 300;

type Kind = "novel" | "novella" | "story" | "essay" | "interview";
type Work = { id: string; title: string; titleEn: string; year: number; kind: Kind; source: { file: string; section?: string }; chars: number; words: number };
type Excluded = { file: string; section?: string; reason: string; duplicateOf?: string };

// ---------- bibliography ----------
// [id, Russian title, English title, first publication, kind, ...aliases]. English titles follow published
// translations where they exist (Andrew Bromfield's for the 1990s–2000s books), otherwise a literal rendering.
// Years are first publication (magazine or book). For about fifteen short stories and essays whose magazine
// history is unclear the year is approximate: the first collection that printed them or the events they describe.
const BIBLIOGRAPHY: [string, string, string, number, Kind, ...string[]][] = [
  // novels
  ["pv-omon-ra", "Омон Ра", "Omon Ra", 1992, "novel"],
  ["pv-zhizn-nasekomyh", "Жизнь насекомых", "The Life of Insects", 1993, "novel"],
  ["pv-chapaev-i-pustota", "Чапаев и Пустота", "Chapaev and Void", 1996, "novel"],
  ["pv-generation-p", "Generation «П»", "Generation P", 1999, "novel", "Generation П", "Generation Р", "Поколение П"],
  ["pv-chisla", "Числа", "Numbers", 2003, "novel"],
  ["pv-svyashchennaya-kniga-oborotnya", "Священная книга оборотня", "The Sacred Book of the Werewolf", 2004, "novel"],
  ["pv-shlem-uzhasa", "Шлем ужаса", "The Helmet of Horror", 2005, "novel"],
  ["pv-empire-v", "Empire V", "Empire V", 2006, "novel", "Ампир «В»", "Ампир В", "Виктор Пелевин EMPIRE V (Ампир В)"],
  ["pv-t", "t", "t", 2009, "novel"],
  ["pv-snuff", "S.N.U.F.F.", "S.N.U.F.F.", 2011, "novel", "S.N.U.F.F"],
  ["pv-betman-apollo", "Бэтман Аполло", "Batman Apollo", 2013, "novel"],
  ["pv-lyubov-k-trem-tsukerbrinam", "Любовь к трем цукербринам", "Love for Three Zuckerbrins", 2014, "novel"],
  ["pv-orden-zheltogo-flaga", "Смотритель. Орден желтого флага", "The Watcher. The Order of the Yellow Flag", 2015, "novel", "Орден желтого флага", "Смотритель. Том 1. Орден желтого флага"],
  ["pv-zheleznaya-bezdna", "Смотритель. Железная бездна", "The Watcher. The Iron Abyss", 2015, "novel", "Железная бездна", "Смотритель. Книга 2. Железная бездна"],
  ["pv-lampa-mafusaila", "Лампа Мафусаила, или Крайняя битва чекистов с масонами", "Methuselah's Lamp, or The Final Battle of the Chekists and the Masons", 2016, "novel"],
  ["pv-iphuck-10", "iPhuck 10", "iPhuck 10", 2017, "novel"],
  ["pv-tainye-vidy-na-goru-fudzi", "Тайные виды на гору Фудзи", "Secret Views of Mount Fuji", 2018, "novel"],
  ["pv-nepobedimoe-solntse", "Непобедимое солнце", "Invincible Sun", 2020, "novel"],
  ["pv-transhumanism-inc", "Transhumanism Inc.", "Transhumanism Inc.", 2021, "novel", "TRANSHUMANISM INC"],
  ["pv-kgbt", "KGBT+", "KGBT+", 2022, "novel", "KGBT+ (КГБТ+)", "КГБТ+"],
  ["pv-puteshestvie-v-elevsin", "Путешествие в Элевсин", "Journey to Eleusis", 2023, "novel"],
  ["pv-krut", "Круть", "Krut", 2024, "novel"],
  ["pv-a-sinistra", "A Sinistra", "A Sinistra", 2025, "novel", "A Sinistra — А Синистра — Левый Путь", "A Sinistra | А Синистра | Левый Путь"],
  ["pv-vozvrashchenie-sinei-borody", "Возвращение Синей Бороды", "The Return of Bluebeard", 2026, "novel"],
  // novellas
  ["pv-zatvornik-i-shestipalyi", "Затворник и Шестипалый", "The Hermit and Six-Toes", 1990, "novella"],
  ["pv-prints-gosplana", "Принц Госплана", "The Prince of Gosplan", 1991, "novella"],
  ["pv-zheltaya-strela", "Желтая стрела", "The Yellow Arrow", 1993, "novella"],
  ["pv-makedonskaya-kritika", "Македонская критика французской мысли", "The Macedonian Critique of French Thought", 2003, "novella"],
  ["pv-zal-poyushchih-kariatid", "Зал поющих кариатид", "The Hall of the Singing Caryatids", 2008, "novella"],
  ["pv-operatsiya-burning-bush", "Операция «Burning Bush»", "Operation Burning Bush", 2010, "novella", "Операция Burning Вush"],
  ["pv-zenitnye-kodeksy", "Зенитные кодексы Аль-Эфесби", "The Anti-Aircraft Codices of Al-Efesbi", 2010, "novella"],
  ["pv-sozertsatel-teni", "Созерцатель тени", "The Shadow Watcher", 2010, "novella"],
  ["pv-iakinf", "Иакинф", "Iakinf", 2019, "novella"],
  ["pv-iskusstvo-legkih-kasanii", "Искусство легких касаний", "The Art of Light Touches", 2019, "novella"],
  // stories
  ["pv-koldun-ignat-i-lyudi", "Колдун Игнат и люди", "Ignat the Sorcerer and the People", 1989, "story"],
  ["pv-otkrovenie-kregera", "Откровение Крегера", "Kreger's Revelation", 1990, "story"],
  ["pv-oruzhie-vozmezdiya", "Оружие возмездия", "The Weapon of Retribution", 1990, "story"],
  ["pv-rekonstruktor", "Реконструктор", "The Reconstructor", 1990, "story"],
  ["pv-spi", "Спи", "Sleep", 1991, "story"],
  ["pv-vesti-iz-nepala", "Вести из Непала", "News from Nepal", 1991, "story"],
  ["pv-devyatyi-son-very-pavlovny", "Девятый сон Веры Павловны", "Vera Pavlovna's Ninth Dream", 1991, "story"],
  ["pv-sinii-fonar", "Синий фонарь", "The Blue Lantern", 1991, "story"],
  ["pv-sssr-taishou-chzhuan", "СССР Тайшоу Чжуань", "USSR Taishou Zhuan", 1991, "story"],
  ["pv-mardongi", "Мардонги", "Mardongs", 1991, "story"],
  ["pv-sarai-nomer-xii", "Жизнь и приключения сарая номер XII", "The Life and Adventures of Shed Number XII", 1991, "story"],
  ["pv-ontologiya-detstva", "Онтология детства", "The Ontology of Childhood", 1991, "story"],
  ["pv-vstroennyi-napominatel", "Встроенный напоминатель", "The Built-In Reminder", 1991, "story"],
  ["pv-vodonapornaya-bashnya", "Водонапорная башня", "The Water Tower", 1991, "story"],
  ["pv-mittelshpil", "Миттельшпиль", "Mid-Game", 1991, "story"],
  ["pv-uhryab", "Ухряб", "Ukhryab", 1991, "story"],
  ["pv-muzyka-so-stolba", "Музыка со столба", "Music from a Pole", 1991, "story"],
  ["pv-hrustalnyi-mir", "Хрустальный мир", "Crystal World", 1991, "story"],
  ["pv-problema-verwolka", "Проблема верволка в средней полосе", "A Werewolf Problem in Central Russia", 1991, "story", "Верволки средней полосы"],
  ["pv-den-buldozerista", "День бульдозериста", "Bulldozer Driver's Day", 1991, "story"],
  ["pv-nika", "Ника", "Nika", 1992, "story"],
  ["pv-proishozhdenie-vidov", "Происхождение видов", "The Origin of Species", 1992, "story"],
  ["pv-buben-verhnego-mira", "Бубен верхнего мира", "The Tambourine of the Upper World", 1993, "story"],
  ["pv-ivan-kublahanov", "Иван Кублаханов", "Ivan Kublakhanov", 1993, "story"],
  ["pv-tarzanka", "Тарзанка", "Tarzanka", 1993, "story"],
  ["pv-zigmund-v-kafe", "Зигмунд в кафе", "Sigmund in a Café", 1993, "story"],
  ["pv-buben-nizhnego-mira", "Бубен нижнего мира", "The Tambourine of the Lower World", 1996, "story", "Бубен нижнего мира (Зеленая коробочка)"],
  ["pv-nizhnyaya-tundra", "Нижняя тундра", "The Lower Tundra", 1996, "story"],
  ["pv-svyatochnyi-kiberpank", "Святочный киберпанк, или Рождественская ночь-117.DIR", "Christmas Cyberpunk, or Christmas Night-117.DIR", 1996, "story", "Святочный киберпанк 117.dir"],
  ["pv-kratkaya-istoriya-peintbola", "Краткая история пэйнтбола в Москве", "A Short History of Paintball in Moscow", 1996, "story"],
  ["pv-zapis-o-poiske-vetra", "Запись о поиске ветра", "A Record of the Search for the Wind", 1997, "story"],
  ["pv-time-out", "Time Out, или Вечерняя Москва", "Time Out, or Evening Moscow", 1997, "story", "Time out", "Timeout, или Вечерняя Москва"],
  ["pv-grecheskii-variant", "Греческий вариант", "The Greek Version", 1999, "story"],
  ["pv-svet-gorizonta", "Свет горизонта", "The Light of the Horizon", 2001, "story"],
  ["pv-akiko", "Акико", "Akiko", 2003, "story"],
  ["pv-fokus-gruppa", "Фокус-группа", "Focus Group", 2003, "story"],
  ["pv-gost-na-prazdnike-bon", "Гость на празднике Бон", "A Guest at the Bon Festival", 2003, "story"],
  ["pv-odin-vog", "Один вог", "One Vogue", 2003, "story"],
  ["pv-who-by-fire", "Who by Fire", "Who by Fire", 2005, "story"],
  ["pv-papahi-na-bashnyah", "Папахи на башнях", "Papakhas on the Towers", 2005, "story"],
  ["pv-kormlenie-krokodila-hufu", "Кормление крокодила Хуфу", "Feeding the Crocodile Khufu", 2008, "story"],
  ["pv-nekroment", "Некромент", "Necroment", 2008, "story"],
  ["pv-prostranstvo-fridmana", "Пространство Фридмана", "Friedman Space", 2008, "story"],
  ["pv-assasin", "Ассасин", "Assassin", 2008, "story", "Ассасин (суфийская легенда)"],
  ["pv-thagi", "Тхаги", "Thugs", 2010, "story"],
  ["pv-otel-horoshih-voploshchenii", "Отель хороших воплощений", "The Hotel of Good Incarnations", 2010, "story", "Отель хороших воплощений Святочный рассказ"],
  ["pv-stolypin", "Столыпин", "Stolypin", 2019, "story"],
  // essays
  ["pv-zombifikatsiya", "Зомбификация. Опыт сравнительной антропологии", "Zombification: An Essay in Comparative Anthropology", 1990, "essay", "Зомбификация Опыт сравнительной антропологии"],
  ["pv-gkchp-kak-tetragrammaton", "ГКЧП как тетраграмматон", "The State Emergency Committee as Tetragrammaton", 1993, "essay"],
  ["pv-dzhon-faulz", "Джон Фаулз и трагедия русского либерализма", "John Fowles and the Tragedy of Russian Liberalism", 1993, "essay"],
  ["pv-podzemnoe-nebo", "Подземное небо", "The Underground Sky", 1994, "essay"],
  ["pv-ikstlan-petushki", "Икстлан – Петушки", "Ixtlan – Petushki", 1996, "essay"],
  ["pv-ultima-tuleev", "Ultima Тулеев, или Дао выборов", "Ultima Tuleev, or the Tao of Elections", 2000, "essay"],
  ["pv-moi-meskalitovyi-trip", "Мой мескалитовый трип", "My Mescalito Trip", 1996, "essay"],
  ["pv-kod-mira", "Код Мира", "The Mir Code", 2001, "essay"],
  ["pv-poslednyaya-shutka-voina", "Последняя шутка воина", "The Warrior's Last Joke", 1998, "essay"],
  ["pv-most-kotoryi-ya-hotel-pereiti", "Мост, который я хотел перейти", "The Bridge I Wanted to Cross", 1998, "essay"],
  ["pv-imena-oligarhov", "Имена олигархов на карте Родины", "The Names of Oligarchs on the Map of the Motherland", 1998, "essay"],
  ["pv-sprashivaet-prov", "Виктор Пелевин спрашивает PRов", "Viktor Pelevin Questions the PR Men", 1999, "essay"],
  // interviews
  ["pv-46-intervyu", "46 интервью с Пелевиным", "46 Interviews with Pelevin", 2012, "interview", "46 интервью с Пелевиным. 46 интервью с писателем, который никогда не дает интервью"],
];

// ---------- how each file is read ----------
type Rule =
  | { mode: "whole" } // one work (the default)
  | { mode: "split"; tier: 1 | 2; atomic?: RegExp; descend?: RegExp; skip?: [RegExp, string] } // collection of Pelevin's own works
  | { mode: "anthology"; note: string } // mostly other authors: keep only sections labelled "Пелевин", scan the rest
  | { mode: "exclude"; reason: string };

// `atomic` is tested against the TOC path ("Parent/Label"), `descend` against the label; both override the default
// (atomic wins):
// an entry is one work unless it has children that look like titled works rather than chapters.
const RULES: Record<string, Rule> = {
  "Relics. Раннее и неизданное": { mode: "split", tier: 1 },
  "Все повести и эссе": { mode: "split", tier: 1, atomic: /Зомбификация/ },
  "Все рассказы": { mode: "split", tier: 1 },
  "Вся вселенная TRANSHUMANISM INC. —  комплект из 4 книг": { mode: "split", tier: 1, atomic: /^(TRANSHUMANISM INC\.|KGBT\+|Путешествие в Элевсин|Круть)$/ },
  "Желтая стрела": { mode: "split", tier: 1 },
  "Диалектика Переходного Периода из Ниоткуда в Никуда": { mode: "split", tier: 1, atomic: /\/Числа$/ },
  "Искусство легких касаний": { mode: "split", tier: 1 },
  "Македонская критика французской мысли": { mode: "split", tier: 1 },
  "Пелевин  Виктор": { mode: "split", tier: 2, atomic: /^(GENERATION Р|ОМОН РА.*|ПРИНЦ ГОСПЛАНА)$/ },
  "Синий фонарь": { mode: "split", tier: 1, descend: /^Виктор Пелевин Синий фонарь$/ },
  "Сочинения в двух томах. Том первый": { mode: "split", tier: 1 },
  "Сочинения в двух томах. Том второй": { mode: "split", tier: 1 },
  "Сумасшедший по фамилии Пустота": { mode: "split", tier: 1 },
  "Фокус-группа": { mode: "split", tier: 1, atomic: /Зомбификация/ },
  "Эссе, статьи": { mode: "split", tier: 1, skip: [/Ральфа Блума/, "translation of Ralph Blum's The Book of Runes, not Pelevin's own work"] },
  "П5 —  Прощальные песни политических пигмеев Пиндостана": { mode: "split", tier: 1, atomic: /Ассасин/ },
  "Ананасная вода для прекрасной дамы": { mode: "split", tier: 1, descend: /^Виктор Пелевин Ананасная вода/ },
  "Empire V. Бэтман Аполло": { mode: "split", tier: 1, atomic: /^Виктор Пелевин (EMPIRE V|Бэтман Аполло)/ },
  "Рассказы-Повести-Романы": { mode: "split", tier: 2, atomic: /^Романы\/|Ассасин|Зомбификация|\/Числа$/, descend: / by / },
  "«Химия и жизнь». Фантастика и детектив. 1985-1994": { mode: "anthology", note: "magazine anthology, 1985–1994" },
  "НФ —  Альманах научной фантастики. Выпуск 35": { mode: "anthology", note: "science-fiction almanac" },
  "Фантастический альманах «Завтра».  Выпуск 2": { mode: "anthology", note: "almanac" },
  "Фантастический альманах «Завтра».  Выпуск 4": { mode: "anthology", note: "almanac" },
  "Детский мир": { mode: "anthology", note: "anthology compiled by L. Petrushevskaya" },
  "Жужукины дети, или Притча о недостойном соседе": { mode: "anthology", note: "anthology of short prose" },
  "Русские цветы зла": { mode: "anthology", note: "anthology compiled by V. Erofeyev" },
  "Свой путь": { mode: "anthology", note: "anthology" },
  "Семнадцать о Семнадцатом": { mode: "anthology", note: "anthology" },
  "Гадание на рунах или рунический оракул Ральфа Блума": { mode: "exclude", reason: "translation of Ralph Blum's The Book of Runes, not Pelevin's own work" },
  "Бэйсуортский отшельник": { mode: "exclude", reason: "translation of Arthur Machen's story, not Pelevin's own work" },
};

// ---------- cleaning ----------
const JUNK = /^(©|ISBN|Все права защищены|Taken: ,|Художник |Ответственный редактор|Литературный редактор|Младший редактор|Художественный редактор|Корректор|Разработка серии|Иллюстрации (на|в) |18\+$|Мнение автора книги может не совпадать|Единственный и неповторимый\. Виктор Пелевин|Источник — http)/;
const NOTES = /^(Примечания|Комментарии|Сноски|Notes)$/;
// The FB2→EPUB converter behind these files puts footnote bodies in ch2*.xhtml, sometimes without a heading.
const NOTES_FILE = /(^|\/)ch2([-_][^/]*)?\.xhtml$/;
const AUTHOR = /^(Виктор (Олегович )?Пелевин|Пелевин Виктор|Виктор ПЕЛЕВИН)$/i;

/** Marks front and back matter: notes files, imprint lines, bare author/title pages. */
function keepMask(blocks: Block[]) {
  const keep = blocks.map((b) => Boolean(b.text));
  let notesFile: string | null = null;
  blocks.forEach((b, i) => {
    if (NOTES.test(b.text)) notesFile = b.file;
    else if (notesFile && b.file !== notesFile) notesFile = null;
    if (notesFile || NOTES_FILE.test(b.file) || JUNK.test(b.text) || AUTHOR.test(b.text)) keep[i] = false;
  });
  return keep;
}

// ---------- candidates ----------
type Candidate = { file: string; section?: string; tier: number; text: string; words: number; label: string };

const CHAPTER = /^(\d+[.)]?(\s|$)|[IVXLC]+\.?(\s|$)|часть\b|ч\.\s*\d|глава\b|level\b|loading|game paused|autoexec|пролог|эпилог|предисловие|приложение|комментарий|:-|\d+\.\d+|мема\s+\d|элегия|_+$|$)/i;

function sectionsOf(toc: TocEntry[], rule: Extract<Rule, { mode: "split" }>, path = ""): { entry: TocEntry; path: string }[] {
  const out: { entry: TocEntry; path: string }[] = [];
  for (const e of toc) {
    const p = path ? `${path}/${e.label}` : e.label;
    const titledChildren = e.children.some((c) => !CHAPTER.test(c.label.trim()));
    const descend = e.children.length > 0 && !rule.atomic?.test(p) && (rule.descend?.test(e.label) || titledChildren);
    if (descend) out.push(...sectionsOf(e.children, rule, p));
    else out.push({ entry: e, path: p });
  }
  return out;
}

/** Block range of a TOC entry: from its target to the next entry that is not inside it. */
function rangeOf(blocks: Block[], flat: TocEntry[], entry: TocEntry) {
  const start = tocIndex(blocks, entry);
  const inside = new Set(flatToc([entry]));
  const k = flat.indexOf(entry);
  let end = blocks.length;
  for (const next of flat.slice(k + 1)) {
    if (inside.has(next)) continue;
    const i = tocIndex(blocks, next);
    if (i > start) {
      end = i;
      break;
    }
  }
  return [start, end] as const;
}

const textOf = (blocks: Block[], keep: boolean[], from = 0, to = blocks.length) => normalize(blocksText(blocks.slice(from, to).filter((_, i) => keep[from + i])));

// ---------- registry lookup ----------
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ by .*$/, "")
    .replace(/^виктор (олегович )?пелевин\.?\s*/, "")
    .replace(/[«»"'“”„()[\].,:;!?–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const REGISTRY = new Map<string, (typeof BIBLIOGRAPHY)[number]>();
for (const row of BIBLIOGRAPHY) for (const name of [row[1], ...row.slice(5)] as string[]) REGISTRY.set(norm(name), row);
function lookup(label: string) {
  const n = norm(label);
  if (REGISTRY.has(n)) return REGISTRY.get(n)!;
  const bare = norm(label.replace(/\(.*?\)/g, ""));
  if (REGISTRY.has(bare)) return REGISTRY.get(bare)!;
  // "Откровение Крегера (комплект документации)", "Отель хороших воплощений Святочный рассказ"
  return [...REGISTRY.entries()].filter(([k]) => k.length >= 4 && (n.startsWith(k + " ") || bare.startsWith(k + " "))).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? null;
}

// ---------- main ----------
async function main() {
  const args = readArgs();
  const dir = args.dir ?? DEFAULT_DIR;
  const verbose = args.verbose === "true";
  const files = (await readdir(dir)).filter((f) => f.endsWith(".epub")).sort((a, b) => a.localeCompare(b, "ru"));
  const candidates: Candidate[] = [];
  const excluded: Excluded[] = [];
  const scans: { file: string; blocks: Block[]; keep: boolean[]; flat: TocEntry[] }[] = [];

  for (const file of files) {
    const name = file.replace(/\.epub$/, "");
    const rule: Rule = RULES[name] ?? { mode: "whole" };
    if (rule.mode === "exclude") {
      excluded.push({ file, reason: rule.reason });
      continue;
    }
    const epub = await readEpub(await readFile(join(dir, file)));
    const keep = keepMask(epub.blocks);
    const flat = flatToc(epub.toc);
    if (rule.mode === "whole") {
      const text = textOf(epub.blocks, keep);
      candidates.push({ file, tier: 0, text, words: words(text).length, label: name });
    } else if (rule.mode === "split") {
      for (const { entry, path } of sectionsOf(epub.toc, rule)) {
        if (rule.skip?.[0].test(entry.label)) {
          excluded.push({ file, section: path, reason: rule.skip[1] });
          continue;
        }
        const [a, b] = rangeOf(epub.blocks, flat, entry);
        if (a < 0) continue;
        const text = textOf(epub.blocks, keep, a, b);
        candidates.push({ file, section: path, tier: rule.tier, text, words: words(text).length, label: entry.label });
      }
    } else {
      excluded.push({ file, reason: `anthology (${rule.note}): works by other authors skipped` });
      for (const entry of flat.filter((e) => /пелевин/i.test(e.label))) {
        const [a, b] = rangeOf(epub.blocks, flat, entry);
        const text = textOf(epub.blocks, keep, a, b);
        const label = entry.label.replace(/^Виктор\s+ПЕЛЕВИН\s*/i, "").trim() || entry.children[0]?.label || entry.label;
        candidates.push({ file, section: entry.label, tier: 3, text, words: words(text).length, label });
      }
      scans.push({ file, blocks: epub.blocks, keep, flat });
    }
  }

  // Preference: standalone files, collections, omnibus volumes, anthologies; longer first within a tier.
  candidates.sort((a, b) => a.tier - b.tier || b.words - a.words);
  type Kept = Candidate & { id: string; shingles: Set<number> };
  const kept: Kept[] = [];
  const owner = new Map<number, string>(); // shingle → kept work id
  const review: string[] = [];

  for (const c of candidates) {
    const where = c.section ? `${c.file} › ${c.section}` : c.file;
    if (c.words < MIN_WORDS) {
      excluded.push({ file: c.file, section: c.section, reason: c.words ? `too short (${c.words} words): poem, epigraph or section title` : "empty section" });
      continue;
    }
    const sh = shingles(c.text);
    const hits = new Map<string, number>();
    let covered = 0;
    for (const x of sh) {
      const id = owner.get(x);
      if (id) {
        covered++;
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
    }
    const coverage = sh.size ? covered / sh.size : 0;
    const best = [...hits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (coverage >= DUPLICATE) {
      excluded.push({ file: c.file, section: c.section, reason: `duplicate (${(coverage * 100).toFixed(0)}% of its 8-grams already kept)`, duplicateOf: best });
      continue;
    }
    const meta = lookup(c.label) ?? lookup(c.file.replace(/\.epub$/, ""));
    if (coverage >= PARTIAL) review.push(`partial ${(coverage * 100).toFixed(0)}% ${where} (${c.words}w) mostly in ${best}`);
    if (!meta) {
      review.push(`UNKNOWN work, not kept: ${where} (${c.words}w, ${(coverage * 100).toFixed(0)}% known)`);
      excluded.push({ file: c.file, section: c.section, reason: "not identified as a Pelevin work" });
      continue;
    }
    if (kept.some((k) => k.id === meta[0])) {
      // Same title, different text: an alternate edition or a mis-cut section. Keep the preferred one.
      const other = kept.find((k) => k.id === meta[0])!;
      const reverse = containment(other.shingles, sh);
      review.push(`same id ${meta[0]}: ${where} (${c.words}w) vs kept ${other.file} (${other.words}w): coverage ${(coverage * 100).toFixed(0)}%, reverse ${(reverse * 100).toFixed(0)}%`);
      excluded.push({ file: c.file, section: c.section, reason: `alternate edition or overlapping cut (${(coverage * 100).toFixed(0)}% shared)`, duplicateOf: meta[0] });
      continue;
    }
    kept.push({ ...c, id: meta[0], shingles: sh });
    for (const x of sh) if (!owner.has(x)) owner.set(x, meta[0]);
  }

  // Anthology sections without an author label: report which of them repeat kept works.
  for (const s of scans) {
    for (const entry of s.flat.filter((e) => e.children.length === 0)) {
      const [a, b] = rangeOf(s.blocks, s.flat, entry);
      const text = textOf(s.blocks, s.keep, a, b);
      const sh = shingles(text);
      if (sh.size < 200) continue;
      const hits = new Map<string, number>();
      for (const x of sh) {
        const id = owner.get(x);
        if (id) hits.set(id, (hits.get(id) ?? 0) + 1);
      }
      const [id, n] = [...hits.entries()].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
      if (n / sh.size >= 0.5 && !excluded.some((e) => e.file === s.file && e.duplicateOf === id))
        excluded.push({ file: s.file, section: entry.label, reason: `duplicate (${((n / sh.size) * 100).toFixed(0)}% of its 8-grams already kept)`, duplicateOf: id });
    }
  }

  const byId = new Map(BIBLIOGRAPHY.map((r) => [r[0], r]));
  const works: Work[] = kept
    .map((k) => {
      const [id, title, titleEn, year, kind] = byId.get(k.id)!;
      return { id, title, titleEn, year, kind, source: k.section ? { file: k.file, section: k.section } : { file: k.file }, chars: k.text.length, words: k.words };
    })
    .sort((a, b) => a.year - b.year || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, "ru"));
  const missing = BIBLIOGRAPHY.filter((r) => !kept.some((k) => k.id === r[0])).map((r) => r[1]);

  await mkdir(CACHE, { recursive: true });
  for (const k of kept) await writeFile(join(CACHE, `${k.id}.txt`), k.text);
  excluded.sort((a, b) => a.file.localeCompare(b.file, "ru") || (a.section ?? "").localeCompare(b.section ?? "", "ru"));
  await writeFile(LIST, JSON.stringify({ about: "Viktor Pelevin's works, deduplicated by content from a folder of EPUBs by scripts/ingest-pelevin.ts. Texts are not stored in the repository.", generated: new Date().toISOString().slice(0, 10), works, excluded }, null, 1) + "\n");

  // console report
  const pad = (s: string | number, n: number) => String(s).slice(0, n).padEnd(n);
  for (const w of works) console.log(`${w.year} ${pad(w.kind, 9)} ${pad(w.words.toLocaleString("en"), 8)} ${pad(w.id, 34)} ${pad(w.title, 44)} ← ${w.source.file}${w.source.section ? ` › ${w.source.section}` : ""}`);
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`\n${works.length} works (${count(works.map((w) => w.kind))}), ${works.reduce((s, w) => s + w.words, 0).toLocaleString("en")} words`);
  console.log(`${excluded.length} excluded (${count(excluded.map((e) => e.reason.replace(/ \(.*$/, "").replace(/:.*$/, "")))})`);
  if (missing.length) console.log(`bibliography entries not found: ${missing.join("; ")}`);
  if (review.length) console.log(`\nreview:\n  ${review.join("\n  ")}`);
  if (verbose) for (const e of excluded) console.log(`  x ${e.file}${e.section ? ` › ${e.section}` : ""}: ${e.reason}${e.duplicateOf ? ` → ${e.duplicateOf}` : ""}`);

  if (args["no-store"] !== "true") storeWorks(works, new Map(kept.map((k) => [k.id, k.text])));
}

const KIND_ORDER: Kind[] = ["novel", "novella", "story", "essay", "interview"];

/** Replaces the store's books with the Pelevin works. Unchanged texts keep their stored answers. */
function storeWorks(works: Work[], texts: Map<string, string>) {
  const store = openStore();
  const removed = store.deleteBooks((b) => b.source !== "pelevin" || !texts.has(b.id));
  let added = 0,
    kept = 0,
    replaced = 0;
  works.forEach((w, i) => {
    const text = texts.get(w.id)!;
    const hash = createHash("sha1").update(text).digest("hex").slice(0, 16);
    const existing = store.book(w.id);
    if (existing && existing.sourceRef === hash) {
      store.updateBookMeta(w.id, { title: w.title, titleEn: w.titleEn, year: w.year, kind: w.kind, rank: i + 1 });
      kept++;
      return;
    }
    if (existing) {
      store.deleteBooks((b) => b.id === w.id);
      replaced++;
    } else added++;
    const segments = segmentText(text, "pages");
    store.addBook(
      { id: w.id, source: "pelevin", sourceRef: hash, title: w.title, author: "Виктор Пелевин", rank: i + 1, chars: text.length, pageChars: PAGE_CHARS, pages: segments.length, year: w.year, kind: w.kind, titleEn: w.titleEn },
      text,
      segments,
    );
  });
  const pages = store.progress("").reduce((s, b) => s + b.pages, 0);
  console.log(`\nstore: ${added} added, ${replaced} replaced (text changed), ${kept} unchanged, ${removed} removed · ${pages.toLocaleString("en")} pages`);
  store.close();
}

await main();
