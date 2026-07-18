import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <div className="hero">
        <h1>
          Your <em>weekend</em>, curated.
        </h1>
        <p>
          Weekender is a concierge that learns your taste, respects your budget and travel range,
          and hands you a booking link for events actually worth leaving the house for.
        </p>
        <Link className="btn" href="/login">
          Sign in with email
        </Link>
      </div>
    </main>
  );
}
