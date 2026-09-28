import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useT } from "../i18n/index.ts";
import "./contact.css";

// Writing to the author (POST /api/contact, server/messages.ts). Two forms of one dialog: "contact" asks for a
// return address and a message; "river" (the paper by the towel in the Ural scene) asks for a short note and,
// optionally, a name and an address, and hands the text back so the scene can let it drift downstream.

export type ContactVariant = "contact" | "river";

/** Longest note the river form accepts (the server allows the same); the river shows up to 140 characters. */
export const RIVER_MAX = 280;
const TEXT_MAX = 4000;

const T = {
  en: {
    button: "Contact",
    buttonTitle: "Write to the author",
    title: { contact: "Write to the author", river: "A note to the river" },
    intro: {
      contact: "A question, a correction, an idea for the project. The reply comes to the address you leave.",
    },
    contact: "Where to reply",
    contactHint: "Email, Telegram @handle or phone",
    message: "Message",
    note: "Note",
    notePlaceholder: "A few words for the river",
    send: { contact: "Send", river: "let it go" },
    sending: "Sending",
    close: "Close",
    sent: "Your message has been received. The reply will come to the address you left.",
    sentRiver: "The note has gone downstream.",
    again: "Write another",
    badContact: "This does not look like an email, a Telegram @handle or a phone number.",
    empty: "Write a message first.",
    tooMany: "Too many messages from here. Try again later.",
    failed: "The message could not be sent. Try again later.",
    left: (n: number) => `${n} left`,
  },
  ru: {
    button: "Написать",
    buttonTitle: "Написать автору",
    title: { contact: "Написать автору", river: "Записка реке" },
    intro: {
      contact: "Вопрос, поправка, мысль о проекте. Ответ придёт на указанный адрес.",
    },
    contact: "Куда ответить",
    contactHint: "Почта, @ник в Telegram или телефон",
    message: "Сообщение",
    note: "Записка",
    notePlaceholder: "Несколько слов для реки",
    send: { contact: "Отправить", river: "отпустить" },
    sending: "Отправляем",
    close: "Закрыть",
    sent: "Сообщение получено. Ответ придёт на указанный адрес.",
    sentRiver: "Записка ушла вниз по течению.",
    again: "Написать ещё",
    badContact: "Это не похоже на почту, @ник в Telegram или номер телефона.",
    empty: "Сначала напишите сообщение.",
    tooMany: "Слишком много сообщений отсюда. Попробуйте позже.",
    failed: "Не удалось отправить. Попробуйте позже.",
    left: (n: number) => `осталось ${n}`,
  },
};

// Keep in step with looksLikeContact in server/messages.ts, which has the tests.
export function looksLikeContact(s: string) {
  const v = s.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || /^@[A-Za-z0-9_]{4,32}$/.test(v) || /^(?:https?:\/\/)?t\.me\/[A-Za-z0-9_]{4,32}\/?$/i.test(v)) return true;
  const digits = v.replace(/\D/g, "").length;
  return /^\+?[\d\s().-]{7,20}$/.test(v) && digits >= 7 && digits <= 15;
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Motes that gather from `from` (the paper in the scene) into the dialog's frame while it fades in: the note
 * form arrives as the scene's particles rather than popping up. Drawn once, about a second, then removed.
 */
function gather(canvas: HTMLCanvasElement, target: HTMLElement, from: { x: number; y: number }) {
  const g = canvas.getContext("2d");
  if (!g) return () => {};
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  g.scale(dpr, dpr);
  const r = target.getBoundingClientRect();
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#141413";
  const N = 180;
  const motes = Array.from({ length: N }, (_, i) => {
    // targets: the frame's outline, with a few inside
    const onEdge = i < N * 0.8;
    let tx: number, ty: number;
    if (onEdge) {
      const p = Math.random() * 2 * (r.width + r.height);
      if (p < r.width) (tx = r.left + p), (ty = r.top);
      else if (p < r.width + r.height) (tx = r.right), (ty = r.top + p - r.width);
      else if (p < 2 * r.width + r.height) (tx = r.right - (p - r.width - r.height)), (ty = r.bottom);
      else (tx = r.left), (ty = r.bottom - (p - 2 * r.width - r.height));
    } else (tx = r.left + Math.random() * r.width), (ty = r.top + Math.random() * r.height);
    const a = Math.random() * Math.PI * 2;
    const s = 8 + Math.random() * 40;
    return { sx: from.x + Math.cos(a) * s, sy: from.y + Math.sin(a) * s, tx, ty, delay: Math.random() * 0.35, curl: (Math.random() - 0.5) * 120, size: 0.8 + Math.random() * 1.2 };
  });
  const start = performance.now();
  const DUR = 1.25;
  let raf = 0;
  const frame = (now: number) => {
    const t = (now - start) / 1000;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.fillStyle = ink;
    for (const m of motes) {
      const k = Math.min(1, Math.max(0, (t - m.delay) / (DUR - 0.35)));
      const e = 1 - Math.pow(1 - k, 3);
      const x = m.sx + (m.tx - m.sx) * e + Math.sin(e * Math.PI) * m.curl;
      const y = m.sy + (m.ty - m.sy) * e - Math.sin(e * Math.PI) * m.curl * 0.4;
      g.globalAlpha = Math.sin(Math.PI * Math.min(1, k * 1.05)) * 0.7 * (k > 0 ? 1 : 0);
      g.fillRect(x, y, m.size, m.size);
    }
    if (t < DUR + 0.1) raf = requestAnimationFrame(frame);
    else g.clearRect(0, 0, innerWidth, innerHeight);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  variant?: ContactVariant;
  /** Where the river form gathers from (the paper on screen), in client pixels. */
  from?: { x: number; y: number } | null;
  /** Called with the text once the server has stored it. */
  onSent?: (text: string, reply: { token?: string; expiresAt?: string }) => void;
};

export function ContactDialog({ open, onClose, variant = "contact", from, onSent }: DialogProps) {
  const t = useT(T);
  const river = variant === "river";
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const motes = useRef<HTMLCanvasElement>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<{ field?: "contact" | "text"; message: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const max = river ? RIVER_MAX : TEXT_MAX;

  // Open and close the native modal dialog (the rest of the page becomes inert while it is open).
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setClosing(false);
      setState("idle");
      setError(null);
      d.showModal();
      requestAnimationFrame(() => first.current?.focus());
      if (river && from && motes.current && panel.current && !reducedMotion()) return gather(motes.current, panel.current, from);
    } else if (!open && d.open) d.close();
  }, [open, river, from]);

  // Once sent, the form is gone: focus moves to the confirmation's Close.
  useEffect(() => {
    if (state === "sent" && !river) done.current?.focus();
  }, [state, river]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(
      () => {
        setClosing(false);
        onClose();
      },
      reducedMotion() ? 0 : river ? 420 : 160,
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    const body = text.trim();
    if (!body) return setError({ field: "text", message: t.empty });
    if (!river && !looksLikeContact(contact)) return setError({ field: "contact", message: t.badContact });
    setError(null);
    setState("sending");
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(river ? { kind: variant, text: body, website: trap } : { kind: variant, text: body, contact: contact.trim(), website: trap }),
      });
      if (!r.ok) {
        setState("idle");
        return setError({ message: r.status === 429 ? t.tooMany : t.failed });
      }
      const reply = (await r.json().catch(() => ({}))) as { token?: string; expiresAt?: string };
      setText("");
      setState("sent");
      if (river) {
        onSent?.(body, { token: reply.token, expiresAt: reply.expiresAt });
        close();
      }
    } catch {
      setState("idle");
      setError({ message: t.failed });
    }
  };

  // Tab stays inside the dialog (showModal already makes the page inert; this keeps focus from leaving to
  // the browser chrome and wraps it around).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const [a, b] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === a) (e.preventDefault(), b.focus());
    else if (!e.shiftKey && document.activeElement === b) (e.preventDefault(), a.focus());
  };

  const titleId = `${ids}-title`;
  const introId = `${ids}-intro`;
  const errId = `${ids}-err`;
  return (
    <>
      <dialog
        ref={ref}
        className={`contact-dialog${river ? " river" : ""}${closing ? " closing" : ""}`}
        aria-labelledby={titleId}
        aria-describedby={river ? undefined : introId}
        onCancel={(e) => {
          e.preventDefault(); // Esc: close with the same fade
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // the backdrop
        }}
        onKeyDown={onKeyDown}
      >
        <div className="contact-panel" ref={panel}>
          <header className={river ? "contact-head bare" : "contact-head"}>
            <h2 id={titleId} className={river ? "visually-hidden" : undefined}>
              {t.title[variant]}
            </h2>
            <button type="button" className="contact-close" onClick={close} aria-label={t.close} title={t.close}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          </header>
          {state === "sent" && !river ? (
            <div className="contact-sent">
              <p>{t.sent}</p>
              <div className="contact-actions">
                <button type="button" className="contact-text-button" onClick={() => setState("idle")}>
                  {t.again}
                </button>
                <button type="button" className="btn primary" ref={done} onClick={close}>
                  {t.close}
                </button>
              </div>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit} noValidate>
              {!river && (
                <p className="contact-intro" id={introId}>
                  {t.intro.contact}
                </p>
              )}
              <label className="contact-field">
                <span className={river ? "visually-hidden" : "contact-label"}>
                  {river ? t.note : t.message}
                  {!river && (
                    <span className="contact-count" aria-hidden="true">
                      {text.length > max * 0.6 ? t.left(max - text.length) : ""}
                    </span>
                  )}
                </span>
                <textarea
                  ref={first}
                  name="message"
                  rows={river ? 3 : 6}
                  maxLength={max}
                  required
                  placeholder={river ? t.notePlaceholder : undefined}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-invalid={error?.field === "text" || undefined}
                  aria-describedby={error?.field === "text" ? errId : undefined}
                />
              </label>
              {!river && (
                <label className="contact-field">
                  <span className="contact-label">{t.contact}</span>
                  <input
                    name="contact"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={120}
                    required
                    placeholder={t.contactHint}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    aria-invalid={error?.field === "contact" || undefined}
                    aria-describedby={error?.field === "contact" ? errId : undefined}
                  />
                </label>
              )}
              {/* For bots only: people never see or reach this field. */}
              <div className="contact-trap" aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
                </label>
              </div>
              <div className="contact-actions">
                <p className="contact-status" id={errId}>
                  {state === "sending" ? `${t.sending}…` : error?.message ?? ""}
                </p>
                <button type="submit" className="btn primary" disabled={state === "sending"}>
                  {t.send[variant]}
                </button>
              </div>
            </form>
          )}
          <p className="visually-hidden" role="status" aria-live="polite">
            {state === "sending" ? t.sending : state === "sent" && !river ? t.sent : error?.message ?? ""}
          </p>
        </div>
        <canvas ref={motes} className="contact-motes" aria-hidden="true" />
      </dialog>
      {river && (
        <p className="visually-hidden" role="status" aria-live="polite">
          {state === "sent" && !open ? t.sentRiver : ""}
        </p>
      )}
    </>
  );
}

/** An envelope drawn with the same thin line as the other icons. */
export const MailMark = () => (
  <svg className="social-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5.5" width="17" height="13" rx="1" />
    <path d="M4 6.5l8 6 8-6" />
  </svg>
);

/** "Contact" / "Написать": a text link with a mark (the home hero) or an icon button (the top bar). */
export function ContactButton({ variant = "link", className }: { variant?: "link" | "icon"; className?: string }) {
  const t = useT(T);
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <button type="button" className={className ?? "btn icon"} aria-label={t.buttonTitle} title={t.buttonTitle} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <MailMark />
        </button>
      ) : (
        <button type="button" className={className ?? "hero-link contact-link"} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <MailMark />
          {t.button}
        </button>
      )}
      <ContactDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
