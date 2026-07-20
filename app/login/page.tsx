"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [status, setStatus] = useState<"idle" | "sending" | "verifying" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const linkError = params.get("error") === "link";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) {
      setErrorMessage(
        error.status === 429
          ? "Too many code requests. Wait at least 60 seconds and try again."
          : "Couldn't send a code. Try again.",
      );
      setStatus("error");
      return;
    }

    setStep("code");
    setStatus("idle");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setErrorMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      setErrorMessage("That code is invalid or expired. Check the code and try again.");
      setStatus("error");
      return;
    }

    router.replace("/chat");
    router.refresh();
  }

  return (
    <div className="hero">
      <h1>
        Sign in to <em>Weekender</em>
      </h1>
      <p>
        {step === "email"
          ? "No passwords — we'll email you an eight-digit code."
          : `Enter the code sent to ${email}.`}
      </p>
      {step === "email" ? (
        <form className="login-form" onSubmit={sendCode}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form className="login-form" onSubmit={verifyCode}>
          <input
            type="text"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{8}"
            maxLength={8}
            aria-label="Eight-digit verification code"
            placeholder="12345678"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
          <button className="btn" type="submit" disabled={status === "verifying" || token.length !== 8}>
            {status === "verifying" ? "Verifying…" : "Verify code"}
          </button>
        </form>
      )}
      {step === "code" && status !== "verifying" && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setStep("email");
            setToken("");
            setStatus("idle");
            setErrorMessage("");
          }}
        >
          Use a different email
        </button>
      )}
      {status === "error" && <p className="notice error">{errorMessage}</p>}
      {linkError && step === "email" && status === "idle" && (
        <p className="notice error">That link expired or was already used. Request a code instead.</p>
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
