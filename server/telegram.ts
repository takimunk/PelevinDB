// Forwards readers' messages to the owner on Telegram (Bot API sendMessage). Optional: without TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID nothing is sent and messages stay in messages.db only. Never throws; content never goes to the log.
import type { MessageInput } from "./messages.ts";

const MAX = 4000; // Telegram allows 4096 characters per message.

export type Notice = MessageInput & { id: number; verdict?: string; emotion?: string | null };

/** Plain text, no parse mode: readers' text needs no escaping and cannot inject formatting. */
export function noticeText(m: Notice) {
  const head = m.kind === "river" ? `River note #${m.id}` : `Message #${m.id}`;
  const lines = [head];
  if (m.name) lines.push(`from: ${m.name}`);
  if (m.contact) lines.push(`reply to: ${m.contact}`);
  if (m.verdict) lines.push(`jev: ${m.verdict}${m.emotion ? ` · ${m.emotion}` : ""}`);
  lines.push("", m.text);
  if (m.kind === "river") lines.push("", `npm run messages -- --approve ${m.id}  |  --reject ${m.id}`);
  const out = lines.join("\n");
  return out.length > MAX ? `${out.slice(0, MAX - 1)}…` : out;
}

export async function notifyTelegram(m: Notice, { env = process.env, fetcher = fetch }: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return "skipped" as const;
  const body = JSON.stringify({ chat_id: chat, text: noticeText(m), disable_web_page_preview: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) return "sent" as const;
      if (r.status < 500 && r.status !== 429) break; // A bad token or chat will not fix itself.
    } catch {
      /* network: retry once */
    }
  }
  console.warn(`Telegram: could not forward message #${m.id}.`);
  return "failed" as const;
}
