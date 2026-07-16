"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const params = useSearchParams();
  const linkError = params.get("error") === "link";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="hero">
      <h1>
        Sign in to <em>Weekender</em>
      </h1>
      <p>No passwords — we&apos;ll email you a magic link.</p>
      <form className="login-form" onSubmit={sendLink}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send link"}
        </button>
      </form>
      {status === "sent" && <p className="notice">Check your inbox — the link signs you straight in.</p>}
      {status === "error" && <p className="notice error">Couldn&apos;t send the link. Try again?</p>}
      {linkError && status === "idle" && (
        <p className="notice error">That link expired or was already used. Request a fresh one.</p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="shell">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
