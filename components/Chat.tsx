"use client";

import { useEffect, useRef, useState } from "react";
import type { EventCard } from "@/lib/types";
import { EventCards } from "./EventCards";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: EventCard[];
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hey — I'm your events concierge. Tell me where you're based and what kind of nights out you love, and I'll start finding things worth booking. Or just ask: \"what should I do this weekend?\"",
};

export function Chat({ userId, userEmail }: { userId: string; userEmail: string }) {
  const storageKey = `weekender-chat-${userId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // Corrupt local history — start fresh.
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (loaded) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-60)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loaded, storageKey]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply, events: data.events ?? [] },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Hit a snag: ${err instanceof Error ? err.message : "unknown error"}. Try again?`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Week<em>ender</em>
        </div>
        <div className="who">
          <span>{userEmail}</span>
          <form action="/auth/signout" method="post">
            <button type="submit">sign out</button>
          </form>
        </div>
      </header>

      <div className="thread">
        {messages.map((m, i) => (
          <MessageView key={i} message={m} />
        ))}
        {busy && <div className="msg assistant thinking">Checking listings…</div>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <form onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Try "live music this Friday under $40"'
            disabled={busy}
            autoFocus
          />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </main>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  return (
    <>
      {message.content && <div className={`msg ${message.role}`}>{message.content}</div>}
      {message.events && message.events.length > 0 && <EventCards events={message.events} />}
    </>
  );
}
