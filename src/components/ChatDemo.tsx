"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { orbKeystroke, orbThinking, orbSpeaking, orbWordBeat } from "@/lib/orb-signal";

type Message = { id: number; role: "user" | "nova"; text: string };

const SUGGESTIONS = ["Summarise yesterday's standup", "Where's our refund policy?", "Draft a reply to Lina"];

const REPLIES: { match: RegExp; text: string }[] = [
  {
    match: /standup|stand-up|yesterday|meeting|summar/i,
    text: "Yesterday's standup, in three lines: checkout bug fixed and shipped (Omar), the onboarding copy review slips to Thursday (Mei), and design needs one more day on pricing. Source: #standup, 09:32.",
  },
  {
    match: /refund|policy|money back|return/i,
    text: "Customers can request a full refund within 30 days, no questions asked; after that, credit only. It lives in Policies → Billing → Refunds, last edited by Dana on 3 March.",
  },
  {
    match: /draft|reply|lina|email|write/i,
    text: "Here's a draft: “Hi Lina — thanks for flagging the export issue. We've reproduced it and a fix ships Tuesday. I'll confirm the moment it's live.” Want it warmer or shorter?",
  },
  {
    match: /hello|hi\b|hey|who are you/i,
    text: "Hi! I'm Nova. In a real workspace I'd know your docs, meetings and tickets. Here I'm a demo — but I'm listening. Try a suggestion below.",
  },
];

const FALLBACK =
  "Good question. In a real workspace I'd search your docs, chats and tickets and answer with links. In this demo I'm a little orb of light — try one of the suggestions.";

const THINK_MS = 1100;
const WORD_MS = 70;

export default function ChatDemo() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "nova", text: "Hi — I'm Nova. Ask me about your team's work, or tap a suggestion." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"idle" | "thinking" | "speaking">("idle");
  const [announce, setAnnounce] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const list = timers.current;
    return () => {
      list.forEach((t) => window.clearTimeout(t));
      orbThinking(false);
      orbSpeaking(false);
    };
  }, []);

  // keep the newest message in view (scrolls the log only, never the page)
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, busy]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy !== "idle") return;
    const reply = REPLIES.find((r) => r.match.test(q))?.text ?? FALLBACK;
    const userId = nextId.current++;
    const novaId = nextId.current++;
    setMessages((m) => [...m, { id: userId, role: "user", text: q }]);
    setDraft("");
    setBusy("thinking");
    setAnnounce("");
    orbThinking(true);

    later(() => {
      orbThinking(false);
      orbSpeaking(true);
      setBusy("speaking");
      setMessages((m) => [...m, { id: novaId, role: "nova", text: "" }]);
      const words = reply.split(" ");
      words.forEach((_, i) => {
        later(() => {
          orbWordBeat();
          const shown = words.slice(0, i + 1).join(" ");
          setMessages((m) => m.map((msg) => (msg.id === novaId ? { ...msg, text: shown } : msg)));
          if (i === words.length - 1) {
            orbSpeaking(false);
            setBusy("idle");
            setAnnounce(reply);
          }
        }, i * WORD_MS);
      });
    }, THINK_MS);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  // driven by the value (not keydown) so phone keyboards ripple the orb too
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (next.length > draft.length) orbKeystroke(next.charCodeAt(next.length - 1) || 32);
    else if (next.length < draft.length) orbKeystroke(8);
    setDraft(next);
  }

  return (
    <div className="chat">
      <div className="chat__bar">
        <span className="chat__dot" data-state={busy} aria-hidden="true" />
        <span className="chat__title">Nova</span>
        <span className="chat__status">
          {busy === "thinking" ? "thinking…" : busy === "speaking" ? "answering" : "listening"}
        </span>
      </div>

      <div ref={logRef} className="chat__log" aria-label="Conversation" role="region" tabIndex={0}>
        {messages.map((m) => (
          <p key={m.id} className={`bubble bubble--${m.role}`}>
            <span className="sr-only">{m.role === "nova" ? "Nova: " : "You: "}</span>
            {m.text}
          </p>
        ))}
        {busy === "thinking" && (
          <p className="bubble bubble--nova bubble--typing" aria-hidden="true">
            <span />
            <span />
            <span />
          </p>
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        {busy === "thinking" ? "Nova is thinking." : announce ? `Nova: ${announce}` : ""}
      </div>

      <div className="chat__chips" aria-label="Suggested questions" role="group">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy !== "idle"}>
            {s}
          </button>
        ))}
      </div>

      <form className="chat__form" onSubmit={onSubmit}>
        <label htmlFor="nova-input" className="sr-only">
          Message Nova
        </label>
        <input
          id="nova-input"
          className="chat__input"
          value={draft}
          onChange={onChange}
          placeholder="Ask Nova anything…"
          autoComplete="off"
          maxLength={200}
        />
        <button type="submit" className="btn btn--primary chat__send" disabled={busy !== "idle" || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
