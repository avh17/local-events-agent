import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_SIGNALS = new Set(["up", "down", "booked"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.event_id === "string" ? body.event_id : null;
  const eventName = typeof body?.event_name === "string" ? body.event_name : null;
  const signal = typeof body?.signal === "string" ? body.signal : null;
  if (!eventId || !eventName || !signal || !VALID_SIGNALS.has(signal)) {
    return NextResponse.json(
      { error: "event_id, event_name, and signal (up|down|booked) are required" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    event_id: eventId,
    event_name: eventName,
    signal,
  });
  if (error) {
    console.error("feedback insert failed", error);
    return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
