"use client";

import { useState } from "react";
import type { EventCard } from "@/lib/types";

export function EventCards({ events }: { events: EventCard[] }) {
  return (
    <div className="cards">
      {events.map((ev) => (
        <Card key={ev.id} event={ev} />
      ))}
    </div>
  );
}

function priceLabel(ev: EventCard): string | null {
  if (ev.price_min == null) return null;
  if (ev.price_max != null && ev.price_max !== ev.price_min) {
    return `$${ev.price_min}–$${ev.price_max}`;
  }
  return `from $${ev.price_min}`;
}

function Card({ event }: { event: EventCard }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  async function sendFeedback(signal: "up" | "down" | "booked") {
    if (signal !== "booked") setVote(signal);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, event_name: event.name, signal }),
      });
    } catch {
      // Feedback is best-effort; never block the user on it.
    }
  }

  const price = priceLabel(event);

  return (
    <div className="card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {event.image_url && <img src={event.image_url} alt="" />}
      <div className="body">
        <h3>{event.name}</h3>
        <div className="meta">
          {event.date} · {event.venue}, {event.city}
          {event.distance_miles != null && <> · ~{event.distance_miles} mi</>}
          {price && <> · {price}</>}
        </div>
        <div className="reason">{event.reason}</div>
        {event.budget_note && <div className="budget-note">⚠ {event.budget_note}</div>}
        <div className="actions">
          <a
            className="book"
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sendFeedback("booked")}
          >
            Book it ↗
          </a>
          <button
            className={`thumb ${vote === "up" ? "active" : ""}`}
            onClick={() => sendFeedback("up")}
            title="More like this"
          >
            👍
          </button>
          <button
            className={`thumb ${vote === "down" ? "active" : ""}`}
            onClick={() => sendFeedback("down")}
            title="Less like this"
          >
            👎
          </button>
        </div>
      </div>
    </div>
  );
}
