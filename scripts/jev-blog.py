#!/usr/bin/env python3
"""Dataset for the blog post "From image to idea" (public/blog/jev.json), computed from the corpus store.

Every number in the post comes from this file. Statistics are done with numpy alone:
- the unit of analysis is the work (a page is not an independent observation of the author);
- trends are Spearman's rho with the year, with a permutation p-value, a bootstrap 95% CI (resampling works),
  the range over leave-one-work-out refits, and Benjamini-Hochberg q-values across all dimensions;
- sentence-level rates use only the hash-drawn random sample (the ranked candidates are biased by design).

Usage: python3 scripts/jev-blog.py  [--db=data/xbook.db] [--out=public/blog/jev.json]
"""
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone

import numpy as np

ARGS = dict(a.lstrip("-").split("=", 1) for a in sys.argv[1:] if "=" in a)
DB = ARGS.get("db", "data/xbook.db")
OUT = ARGS.get("out", "public/blog/jev.json")
RUBRIC, FOCUS_RUBRIC, SENTENCE_RUBRIC = "xbook-rubric-v2", "xbook-focus-v1", "xbook-sentence-v1"
SAMPLE = 5000  # the random sample drawn by `npm run sentences -- --sample=5000`
rng = np.random.default_rng(1996)

E = ["joy", "trust", "fear", "surprise", "sadness", "disgust", "anger", "anticipation"]
TX = ["pace", "tension", "interiority", "imagery", "ideas", "humor", "valence"]
TH = ["love", "family", "friendship", "death", "war", "power", "money", "crime", "faith", "nature", "journey", "home", "memory", "loneliness", "identity", "freedom", "art", "science", "supernatural"]
MO = ["meditative", "idyllic", "melancholic", "tender", "playful", "mysterious", "suspenseful", "kinetic", "grim", "solemn", "everyday"]
MD = ["action", "dialogue", "description", "introspection", "exposition", "essay", "document", "verse"]
DIMS = [("emotion", e) for e in E] + [("texture", t) for t in TX] + [("theme", t) for t in TH] + [("mood", m) for m in MO] + [("mode", m) for m in MD]
KEYS = [f"{g}:{i}" for g, i in DIMS]
SCORES = E + TX
FLAGS = ["aphorism", "punchline", "wordplay", "allusion", "illusion", "market", "turn"]
SCALES = ["valence", "arousal", "irony", "abstraction", "imagery"]
ACTS = ["narration", "speech", "thought", "comment", "quotation"]
PROFILE = ["realism", "scope", "worldview", "drive", "complexity", "audience"]
ARC_BINS = 20
ARC_DIMS = ["valence", "tension", "ideas", "humor", "fear", "joy", "sadness", "pace", "interiority", "imagery"]

db = sqlite3.connect(DB)


# ───────── statistics ─────────
def rank(x):
    x = np.asarray(x, float)
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    xs = x[order]
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] == xs[i]:
            j += 1
        r[order[i : j + 1]] = (i + j) / 2
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = rank(x), rank(y)
    if rx.std() == 0 or ry.std() == 0:
        return 0.0
    return float(np.corrcoef(rx, ry)[0, 1])


def perm_p(x, y, n=5000):
    rx, ry = rank(x), rank(y)
    if rx.std() == 0 or ry.std() == 0:
        return 1.0
    r0 = abs(np.corrcoef(rx, ry)[0, 1])
    hits = sum(abs(np.corrcoef(rx, rng.permutation(ry))[0, 1]) >= r0 - 1e-12 for _ in range(n))
    return (hits + 1) / (n + 1)


def boot_ci(x, y, n=2000):
    x, y = np.asarray(x), np.asarray(y)
    rs = []
    for _ in range(n):
        i = rng.integers(0, len(x), len(x))
        rs.append(spearman(x[i], y[i]))
    return [float(np.percentile(rs, 2.5)), float(np.percentile(rs, 97.5))]


def mean_ci(v, n=4000):
    v = np.asarray(v, float)
    bs = [v[rng.integers(0, len(v), len(v))].mean() for _ in range(n)]
    return [float(v.mean()), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]


def bh(ps):
    ps = np.asarray(ps, float)
    m = len(ps)
    order = np.argsort(ps)
    q = np.empty(m)
    prev = 1.0
    for k in range(m - 1, -1, -1):
        i = order[k]
        prev = min(prev, ps[i] * m / (k + 1))
        q[i] = prev
    return q


r3 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 3)
r4 = lambda v: round(float(v), 4)  # p- and q-values: the permutation floor is 1/5001


# ───────── data ─────────
books = {}
for bid, title, year, kind, title_en, n_pages in db.execute("SELECT id, title, year, kind, title_en, pages FROM books WHERE source = 'pelevin'"):
    books[bid] = dict(id=bid, title=title, titleEn=title_en or title, year=year, kind=kind, pages=n_pages)

pages, page_idx = {}, {}
for bid, idx, answer in db.execute("SELECT book_id, idx, answer FROM analyses WHERE rubric = ? ORDER BY book_id, idx", (RUBRIC,)):
    if bid not in books:
        continue
    a = json.loads(answer)
    if a["mode"]["paratext"] > 0.5:
        continue
    row = [a["emotions"][e] for e in E] + [a["texture"][t] for t in TX] + [a["themes"][t] for t in TH] + [a["mood"][m] for m in MO] + [a["mode"][m] for m in MD]
    pages.setdefault(bid, []).append(row)
    page_idx.setdefault(bid, []).append(idx)
pages = {b: np.array(v) for b, v in pages.items()}
col = {k: i for i, k in enumerate(KEYS)}
score = lambda b, s: pages[b][:, col[("emotion:" if s in E else "texture:") + s]]

fiction = sorted([b for b in pages if books[b]["kind"] in ("novel", "novella", "story")], key=lambda b: (books[b]["year"], b))
novels = [b for b in fiction if books[b]["kind"] == "novel"]
print(f"{len(fiction)} works of fiction, {len(novels)} novels, {sum(len(pages[b]) for b in fiction)} story pages", file=sys.stderr)

texts = {b: db.execute("SELECT text FROM books WHERE id = ?", (b,)).fetchone()[0] for b in books}
sentences = {}
for bid, page, idx, start, end in db.execute("SELECT book_id, page, idx, start, end FROM sentences ORDER BY book_id, page, idx"):
    sentences.setdefault(bid, {}).setdefault(page, []).append((start, end))
focus = {}
for bid, idx, answer in db.execute("SELECT book_id, idx, answer FROM analyses WHERE rubric = ?", (FOCUS_RUBRIC,)):
    focus.setdefault(bid, {})[idx] = json.loads(answer)
reads = {(b, p, i): json.loads(a) for b, p, i, a in db.execute("SELECT book_id, page, idx, answer FROM sentence_analyses WHERE rubric = ?", (SENTENCE_RUBRIC,))}


def peak(f, dim):
    p = f["focus"][dim]
    best = int(np.argmax(p))
    return best if p[best] > f["none"][dim] else None


def quote(b, page, i, limit=260):
    s, e = sentences[b][page][i]
    t = " ".join(texts[b][s:e].split())
    if len(t) > limit:
        t = t[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:—–-") + "…"
    return t


def ref(b, page, i, extra=None):
    out = dict(id=b, page=page + 1, s=i + 1, text=quote(b, page, i))
    if extra:
        out.update(extra)
    return out


# ───────── 1. what changed: trends with the year ─────────
def trends(ids):
    yrs = np.array([books[b]["year"] for b in ids], float)
    M = np.array([pages[b].mean(0) for b in ids])
    rows = []
    for j, key in enumerate(KEYS):
        v = M[:, j]
        loo = [spearman(np.delete(yrs, i), np.delete(v, i)) for i in range(len(v))]
        rows.append(dict(key=key, rho=spearman(yrs, v), p=perm_p(yrs, v), ci=boot_ci(yrs, v), loo=[min(loo), max(loo)]))
    for r, q in zip(rows, bh([r["p"] for r in rows])):
        r["q"] = float(q)
    return [{k: (r4(v) if k in ("p", "q") else r3(v) if isinstance(v, float) else [r3(x) for x in v] if isinstance(v, list) else v) for k, v in r.items()} for r in rows]


# Robustness of the headline: narration-only pages (dialogue probability < 0.3).
def narration_rho(ids, key):
    yrs, vals = [], []
    for b in ids:
        P = pages[b]
        sel = P[P[:, col["mode:dialogue"]] < 0.3]
        if len(sel):
            yrs.append(books[b]["year"])
            vals.append(sel[:, col[key]].mean())
    return r3(spearman(yrs, vals))


# ───────── 2. page couplings within a book ─────────
Z = np.vstack([pages[b][:, : len(SCORES)] - pages[b][:, : len(SCORES)].mean(0) for b in fiction])
coupling = np.corrcoef(Z.T)


# ───────── 3. the shape of a novel ─────────
def binned(v, n=ARC_BINS):
    edges = np.linspace(0, len(v), n + 1).astype(int)
    return np.array([v[edges[i] : edges[i + 1]].mean() for i in range(n)])


arcs = {}
for d in ARC_DIMS:
    B = np.array([binned(score(b, d)) for b in novels])
    band = [mean_ci(B[:, i], 1500) for i in range(ARC_BINS)]
    tail = B[:, -2:].mean(1) - B[:, :-2].mean(1)  # last tenth against the rest
    arcs[d] = dict(mean=[r3(x[0]) for x in band], lo=[r3(x[1]) for x in band], hi=[r3(x[2]) for x in band], perBook=[[r3(x) for x in row] for row in B], ending=[r3(x) for x in mean_ci(tail)], endingUp=int((tail > 0).sum()))
climax = [int(np.argmax(binned(0.7 * score(b, "tension") + 0.3 * score(b, "pace"), 10))) for b in novels]


# ───────── 4. comic metaphysics: pages both very funny and very philosophical ─────────
def comic(b):
    return np.mean((score(b, "humor") >= 0.75) & (score(b, "ideas") >= 0.75))


comic_share = {b: float(comic(b)) for b in fiction}
yrs_f = np.array([books[b]["year"] for b in fiction], float)
cv = np.array([comic_share[b] for b in fiction])
comic_stats = dict(rho=r3(spearman(yrs_f, cv)), p=r4(perm_p(yrs_f, cv)), decades={str(d): r3(cv[(yrs_f >= d) & (yrs_f < d + 10)].mean()) for d in (1990, 2000, 2010, 2020)})
candidates = []
for b in fiction:
    for k, idx in enumerate(page_idx[b]):
        h, i = score(b, "humor")[k], score(b, "ideas")[k]
        f = focus.get(b, {}).get(idx)
        if h >= 0.75 and i >= 0.75 and f:
            s = peak(f, "quotable")
            if s is not None and 50 <= len(quote(b, idx, s, 999)) <= 220:
                candidates.append((min(h, i) + f["focus"]["quotable"][s] * 0.25, b, idx, s))
candidates.sort(reverse=True)
comic_examples, seen = [], set()
for _, b, idx, s in candidates:
    if b in seen:
        continue
    seen.add(b)
    comic_examples.append(ref(b, idx, s))
    if len(comic_examples) == 6:
        break


# Image and idea, one sentence each: the most vivid page of the 1990s novels and the most idea-laden of the 2020s.
def best_page(ids, key, dim):
    best = None
    for b in ids:
        for k, idx in enumerate(page_idx[b]):
            v = pages[b][k, col[key]]
            f = focus.get(b, {}).get(idx)
            if not f:
                continue
            s = peak(f, dim)
            if s is None or not (60 <= len(quote(b, idx, s, 999)) <= 240):
                continue
            w = v * f["focus"][dim][s]
            if best is None or w > best[0]:
                best = (w, b, idx, s)
    return ref(best[1], best[2], best[3])


pair = dict(image=best_page([b for b in novels if books[b]["year"] < 2000], "texture:imagery", "imagery"), idea=best_page([b for b in novels if books[b]["year"] >= 2020], "texture:ideas", "ideas"))


# ───────── 5. sentences ─────────
def h01(s):
    return int.from_bytes(hashlib.sha1(s.encode()).digest()[:4], "big") / 2**32


story_pages = {b: set(page_idx[b]) for b in page_idx}
units = sum(len(l) for b in sentences if b in story_pages for p, l in sentences[b].items() if p in story_pages[b])
rate = min(1.0, SAMPLE / units)
sample = []
for b in fiction:
    for p, l in sentences.get(b, {}).items():
        if p not in story_pages[b]:
            continue
        for i in range(len(l)):
            a = reads.get((b, p, i))
            if a and h01(f"{b}:{p}:{i}") < rate:
                sample.append((b, p, i, a))
argmax = lambda d: max(d, key=d.get)
by_book = {}
for row in sample:
    by_book.setdefault(row[0], []).append(row)
sample_books = [b for b in fiction if len(by_book.get(b, [])) >= 25]
yb = np.array([books[b]["year"] for b in sample_books], float)


def book_rate(fn):
    v = np.array([np.mean([fn(a) for (_, _, _, a) in by_book[b]]) for b in sample_books])
    return v, dict(rho=r3(spearman(yb, v)), p=r4(perm_p(yb, v)), ci=[r3(x) for x in boot_ci(yb, v)], first=r3(v[yb < 2000].mean()), last=r3(v[yb >= 2020].mean()))


comment_v, comment_trend = book_rate(lambda a: argmax(a["act"]) == "comment")
aphorism_v, aphorism_trend = book_rate(lambda a: a["flags"]["aphorism"] >= 0.5)
abstraction_v, abstraction_trend = book_rate(lambda a: a["scales"]["abstraction"])
voices = []
for act in ACTS:
    g = [a for (_, _, _, a) in sample if argmax(a["act"]) == act]
    ap = np.array([a["flags"]["aphorism"] >= 0.5 for a in g], float)
    m, lo, hi = mean_ci(ap)
    voices.append(dict(act=act, n=len(g), aphorism=[r3(m), r3(lo), r3(hi)], irony=r3(np.mean([a["scales"]["irony"] for a in g])), illusion=r3(np.mean([a["flags"]["illusion"] >= 0.5 for a in g]))))
maxims = []
for b, p, i, a in sorted(sample, key=lambda r: -r[3]["flags"]["aphorism"]):
    if argmax(a["act"]) == "comment" and a["flags"]["aphorism"] >= 0.8 and 40 <= len(quote(b, p, i, 999)) <= 200 and all(m_["id"] != b for m_ in maxims):
        maxims.append(ref(b, p, i, dict(year=books[b]["year"])))
maxims = sorted(maxims[:8], key=lambda m_: m_["year"])

# Where the joke lands: the funniest sentence of a page, and whether it closes its paragraph.
ends, expect, per_book_end = 0, 0.0, {}
for b in fiction:
    for idx in page_idx[b]:
        f = focus.get(b, {}).get(idx)
        l = sentences.get(b, {}).get(idx)
        if not f or not l or len(l) < 4 or f["sentences"] != len(l):
            continue
        h = peak(f, "humor")
        if h is None:
            continue
        closes = [i == len(l) - 1 or "\n" in texts[b][l[i][1] : l[i + 1][0]] for i in range(len(l))]
        ends += closes[h]
        expect += sum(closes) / len(l)
        per_book_end.setdefault(b, []).append(closes[h] - sum(closes) / len(l))
n_humor = sum(len(v) for v in per_book_end.values())
lift = mean_ci([np.mean(v) for v in per_book_end.values() if len(v) >= 10])
punchline = dict(n=n_humor, observed=r3(ends / n_humor), expected=r3(expect / n_humor), bookLift=[r3(x) for x in lift], books=sum(1 for v in per_book_end.values() if len(v) >= 10))

# ───────── 6. whole-book profile ─────────
profile = {}
for b in novels:
    r = db.execute("SELECT answer FROM profiles WHERE book_id = ? AND rubric = ?", (b, RUBRIC)).fetchone()
    if r:
        profile[b] = json.loads(r[0])["scales"]
yp = np.array([books[b]["year"] for b in profile], float)
profile_trends = {s: dict(rho=r3(spearman(yp, [profile[b][s] for b in profile])), p=r4(perm_p(yp, [profile[b][s] for b in profile]))) for s in PROFILE}

# ───────── output ─────────
work_rows = []
for b in fiction:
    means = pages[b].mean(0)
    row = dict(id=b, title=books[b]["title"], titleEn=books[b]["titleEn"], year=books[b]["year"], kind=books[b]["kind"], pages=len(pages[b]), v=[r3(x) for x in means], comic=r3(comic_share[b]))
    if b in by_book and len(by_book[b]) >= 25:
        k = sample_books.index(b)
        row.update(sampled=len(by_book[b]), comment=r3(comment_v[k]), aphorism=r3(aphorism_v[k]), abstraction=r3(abstraction_v[k]))
    if b in profile:
        row["profile"] = {s: r3(profile[b][s]) for s in PROFILE}
    work_rows.append(row)

out = dict(
    version=1,
    generated=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    keys=KEYS,
    scores=SCORES,
    works=work_rows,
    novels=novels,
    trends=dict(novels=trends(novels), fiction=trends(fiction)),
    robust={k: dict(narrationOnly=narration_rho(novels, k)) for k in ["texture:imagery", "texture:ideas", "texture:pace", "theme:faith", "theme:loneliness"]},
    coupling=[[r3(x) for x in row] for row in coupling],
    arcs=dict(bins=ARC_BINS, dims=arcs, climax=np.bincount(climax, minlength=10).tolist()),
    comic=dict(**comic_stats, examples=comic_examples),
    pair=pair,
    sentences=dict(sample=len(sample), rate=r3(rate), books=len(sample_books), comment=comment_trend, aphorism=aphorism_trend, abstraction=abstraction_trend, voices=voices, maxims=maxims, punchline=punchline),
    profile=profile_trends,
    corpus=dict(works=len(fiction), novels=len(novels), pages=int(sum(len(pages[b]) for b in fiction)), allPages=int(db.execute("SELECT COUNT(*) FROM analyses WHERE rubric = ?", (RUBRIC,)).fetchone()[0]), sentences=int(db.execute("SELECT COUNT(*) FROM sentences").fetchone()[0]), sentenceReads=len(reads), focusPages=int(db.execute("SELECT COUNT(*) FROM analyses WHERE rubric = ?", (FOCUS_RUBRIC,)).fetchone()[0])),
)
with open(OUT, "w") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print(f"wrote {OUT}", file=sys.stderr)
