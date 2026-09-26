"""Curate ~500 greatest public-domain books available as English EPUBs on Project Gutenberg.

Canon = titles named in Wikipedia's canonical lists (Bokklubben World Library, BBC Big Read,
Great Books of the Western World, Harvard Classics, Le Monde 100, Western canon).
Each canon title is matched to the Gutenberg catalog (English, same title, author surname in the
list line when available). Remaining slots are filled from Gutenberg's top-1000 by 30-day downloads,
restricted to literature / philosophy shelves.

Writes greatest.json (copy it to data/greatest-500.json). Run it in a scratch folder holding:
  pg_catalog.csv  https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv
  top1000.html    https://www.gutenberg.org/browse/scores/top1000.php
  wk_<Page>.txt   https://en.wikipedia.org/w/index.php?title=<Page>&action=raw for each page in LISTS
"""
import csv, html, json, re, sys, unicodedata
from collections import defaultdict

csv.field_size_limit(sys.maxsize)
LISTS = {
    "bokklubben": "wk_Bokklubben_World_Library.txt",
    "big-read": "wk_The_Big_Read.txt",
    "great-books": "wk_Great_Books_of_the_Western_World.txt",
    "harvard-classics": "wk_Harvard_Classics.txt",
    "le-monde": "wk_Le_Monde%27s_100_Books_of_the_Century.txt",
    "western-canon": "wk_Western_canon.txt",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"^(the|a|an)\s+", "", s.strip())
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# --- Gutenberg catalog -------------------------------------------------------
catalog = {}
by_title = defaultdict(list)
for row in csv.DictReader(open("pg_catalog.csv", encoding="utf-8")):
    if row["Type"] != "Text" or row["Language"] != "en":
        continue
    gid = int(row["Text#"])
    title = row["Title"].split("\n")[0].strip()
    main = re.split(r"[:;]| or,? ", title)[0]
    book = {
        "id": gid,
        "title": title.replace("\n", " ").replace("\r", ""),
        "author": row["Authors"].split(";")[0].strip(),
        "shelves": row["Bookshelves"],
        "subjects": row["Subjects"],
    }
    catalog[gid] = book
    for key in {norm(title), norm(main)}:
        if key:
            by_title[key].append(book)

# --- popularity ---------------------------------------------------------------
top = open("top1000.html", encoding="utf-8").read()
section = top[top.index('id="books-last30"') : top.index('id="authors-last30"')]
rank = {}
for i, gid in enumerate(re.findall(r'href="/ebooks/(\d+)"', section)):
    rank.setdefault(int(gid), i)


def surname(author):
    return norm(author.split(",")[0]) if author else ""


def pick(title, author_hint):
    cands = by_title.get(norm(title), [])
    if author_hint:
        hint = norm(author_hint)
        cands = [c for c in cands if surname(c["author"]) and surname(c["author"]) in hint]
    if not cands:
        return None
    # Prefer the most downloaded edition, then the oldest id (usually the canonical one).
    return min(cands, key=lambda c: (rank.get(c["id"], 10_000), c["id"]))


canon = defaultdict(set)
for name, path in LISTS.items():
    text = open(path, encoding="utf-8").read()
    for gid in re.findall(r"gutenberg\.org/ebooks/(\d+)", text):
        if int(gid) in catalog:
            canon[int(gid)].add(name)
    lines = text.splitlines()
    names = [" ".join(re.findall(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", l)) + " " + l for l in lines]
    for i, line in enumerate(lines):
        near = " ".join(names[max(0, i - 12) : i + 4])
        for target, label in re.findall(r"''\[\[([^\]|]+)(?:\|([^\]]+))?\]\]''", line):
            for title in {label or target, target}:
                book = pick(title, names[i]) or pick(title, near)
                if book:
                    canon[book["id"]].add(name)
                    break

for book in catalog.values():
    if "Best Books Ever Listings" in book["shelves"]:
        canon[book["id"]].add("gutenberg-best-books-ever")
    if "Harvard Classics" in book["shelves"]:
        canon[book["id"]].add("harvard-classics")

LIT = re.compile(r"Novels|Literature|Fiction|Poetry|Plays|Drama|Philosophy|Short Stories|Classics|Mythology|Adventure|Science-Fiction|Horror|Gothic|Humor|Children|Romance", re.I)
JUNK = re.compile(r"Vol\.|Volume|\(of \d|Part \d|Complete Project Gutenberg|Works of|Selected Works|Library of|Home Book|Minute Mysteries|Cookbook|Cooking|Dictionar|Index of|Encyclop|Grammar|Handbook|Manual|Complete Works of|Catalog|Bible|Sheet Music|Tarot|Magazine|Periodical", re.I)


def ok(book):
    return not JUNK.search(book["title"] + " " + book["subjects"] + " " + book["shelves"])


chosen, seen = [], set()


def key(book):
    words = norm(re.split(r"[:;,]| into | or ", book["title"])[0]).split()
    return (" ".join(words[:4]), surname(book["author"]))


extra = defaultdict(int)
STOP = {"of", "the", "and", "a", "in", "to"}


def add(book, sources, fill=False):
    k = key(book)
    words = set(k[0].split()) - STOP
    if k in seen or not ok(book) or not words:
        return
    if any(a == k[1] and (words <= set(t.split()) | {a} or set(t.split()) - STOP <= words | set(book["author"].lower().replace(",", " ").split())) for t, a in seen):
        return
    if fill and extra[k[1]] >= 4:
        return
    extra[k[1]] += fill
    seen.add(k)
    chosen.append({
        "gutenberg": book["id"],
        "title": re.sub(r"\s+", " ", book["title"]).strip(),
        "author": book["author"],
        "lists": sorted(sources),
        "downloadsRank": rank.get(book["id"]),
    })


for gid, sources in sorted(canon.items(), key=lambda kv: (-len(kv[1]), rank.get(kv[0], 10_000))):
    add(catalog[gid], sources)
canon_count = len(chosen)
canon_authors = {catalog[g]["author"] for g in canon} - {"Anonymous", "Unknown", "Various"}
popular = [catalog[g] for g, _ in sorted(rank.items(), key=lambda kv: kv[1]) if g in catalog]
lit = lambda b: LIT.search(b["shelves"] + " " + b["subjects"])
passes = [
    [b for b in popular if b["author"] in canon_authors and lit(b)],
    [b for b in popular if "Classics of Literature" in b["shelves"]],
    [b for b in sorted(catalog.values(), key=lambda b: b["id"]) if b["author"] in canon_authors and "Category: Novels" in b["shelves"]],
]
for group in passes:
    for book in group:
        if len(chosen) >= 500:
            break
        add(book, {"canon-author" if group is not passes[1] else "gutenberg-top-downloads"}, fill=True)
chosen = chosen[:500]
json.dump({
    "about": "500 greatest public-domain books with English EPUBs on Project Gutenberg. Canon: titles named in Wikipedia lists (Bokklubben World Library, BBC Big Read, Great Books of the Western World, Harvard Classics, Le Monde 100, Western canon) and Gutenberg's Best Books Ever shelf, ranked by how many lists name them. Remaining slots: other works by canon authors and popular Classics of Literature.",
    "books": [{"rank": i + 1, **b} for i, b in enumerate(chosen)],
}, open("greatest.json", "w"), ensure_ascii=False, indent=1)
print("canon", canon_count, "total", len(chosen))
for b in chosen[:40]:
    print(b["gutenberg"], len(b["lists"]), b["title"][:50], "|", b["author"][:30])
print("...")
for b in chosen[canon_count - 10 : canon_count + 10]:
    print(b["gutenberg"], b["lists"], b["title"][:50], "|", b["author"][:30])
