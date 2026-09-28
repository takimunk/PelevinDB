// Messages readers leave through the contact form and the paper by the towel in the Ural scene.
//
//   npm run messages                      the latest 50 messages, newest first
//   npm run messages -- --kind=river      only notes to the river (or --kind=contact)
//   npm run messages -- --limit=200
//   npm run messages -- --approve=12      put river note 12 on the public river (overrides Jev)
//   npm run messages -- --reject=12       keep it off the river for good (Jev will not approve it later)
//   npm run messages -- --unapprove=12    back to waiting, as if never decided
//   npm run messages -- --score           ask Jev to read the river notes it has not read yet
//   npm run messages -- --costs           Jev calls and tokens spent on river notes, per day
//
// Messages are never deleted: the file keeps the full history. A river note is shown on the river only
// until it expires (RIVER_TTL_HOURS after it was sent, 24 by default).
//
// River notes are public text. Each one is read by Jev after it is saved (one request: the eight Plutchik
// emotions, mood and the nineteen themes, worded as for the corpus, plus a moderation Choice). A note goes on
// the river only when moderation says "ok" with probability ≥ 0.7, or when approved here. Jev calls go through
// the spending ledger (data/spending.db) and are capped per day by RIVER_JEV_DAILY_LIMIT (default 200).
//
// The file is messages.db beside XBOOK_DB (data/ locally), or XBOOK_MESSAGES_DB if set. On the server, run
// the script inside the container so it opens the file on the persistent volume.
import { jevCost, MessageStore, messagesPath, scoreRiverNote, type MessageKind } from "../server/messages.ts";
import { EMOTIONS } from "../shared/catalog.ts";
import { args } from "./lib.ts";

const a = args();
// Accept both `--approve=12` and `--approve 12`.
const raw = process.argv.slice(2);
const value = (key: string) => {
  const v = a[key];
  if (v && v !== "true") return v;
  const i = raw.indexOf(`--${key}`);
  return i >= 0 ? raw[i + 1] : undefined;
};

const file = messagesPath();
const store = new MessageStore(file);
const id = (key: string) => {
  const n = Number(value(key));
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${key} needs a message id.`);
    process.exit(1);
  }
  return n;
};
const done = (ok: boolean, what: string, n: number) => console.log(ok ? `${what} ${n}.` : `No message ${n}.`);

if (a.approve) done(store.approve(id("approve"), 1), "Approved", id("approve"));
else if (a.reject) done(store.approve(id("reject"), -1), "Rejected", id("reject"));
else if (a.unapprove) done(store.approve(id("unapprove"), 0), "Waiting again:", id("unapprove"));
else if (a.score) {
  if (!process.env.TYPESAFE_API_KEY) console.error("TYPESAFE_API_KEY is not set; nothing to do.");
  else {
    const notes = store.unscored(Number(value("limit")) || 50);
    console.log(`${notes.length} unread river note${notes.length === 1 ? "" : "s"}.`);
    for (const note of notes) {
      const outcome = await scoreRiverNote(store, note.id, note.text);
      const tokens = store.get(note.id)?.score?.tokens;
      console.log(`#${note.id}: ${outcome}${tokens ? ` · ${tokens} tokens · $${jevCost(tokens).toFixed(6)}` : ""}`);
      if (outcome === "capped" || outcome === "skipped") break;
    }
  }
} else if (a.costs) {
  for (const d of store.jevDays(Number(value("limit")) || 14))
    console.log(`${d.day}  ${d.calls} call${d.calls === 1 ? "" : "s"}  ${d.tokens} tokens  $${jevCost(d.tokens).toFixed(5)}`);
} else {
  const kind = value("kind") as MessageKind | undefined;
  const rows = store.list({ kind: kind === "river" || kind === "contact" ? kind : undefined, limit: Number(value("limit")) || 50 });
  console.log(`${file}: ${rows.length} message${rows.length === 1 ? "" : "s"}`);
  for (const m of rows) {
    const who = [m.name, m.contact].filter(Boolean).join(" · ") || "anonymous";
    let flag = "";
    if (m.kind === "river") {
      const expired = !!m.expiresAt && m.expiresAt <= new Date().toISOString();
      const state = `${m.approved ? "approved" : m.rejected ? "rejected" : "waiting"}${expired ? ", expired" : ""}`;
      const s = m.score;
      const lead = s ? EMOTIONS.reduce((b, e) => (s.emotions[e.id] > s.emotions[b.id] ? e : b), EMOTIONS[0]) : null;
      const jev = s
        ? ` · Jev: ${s.moderation.choice} ${s.moderation.probabilities[s.moderation.choice].toFixed(2)}, ${lead!.id} ${s.emotions[lead!.id].toFixed(2)}${s.tokens ? `, $${jevCost(s.tokens).toFixed(6)}` : ""}`
        : " · not read by Jev";
      flag = ` [river, ${state}${jev}]`;
    }
    console.log(`\n#${m.id}  ${m.createdAt}  ${who}${flag}\n${m.text}`);
  }
}
store.close();
