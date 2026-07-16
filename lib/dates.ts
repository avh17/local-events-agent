/**
 * The weekend a request made on `from` should target, UTC-based:
 * Friday 00:00:00 UTC through Sunday 23:59:59 UTC. Mid-week dates target the
 * coming weekend; Fri/Sat/Sun dates target the weekend already in progress.
 */
export function upcomingWeekend(from: Date): { start: Date; end: Date } {
  const day = from.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  let deltaDays = (5 - day + 7) % 7; // days until Friday
  if (day === 6) deltaDays = -1; // Saturday -> yesterday's Friday
  if (day === 0) deltaDays = -2; // Sunday -> that weekend's Friday
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + deltaDays),
  );
  const end = new Date(start.getTime() + 2 * 86_400_000 + 86_399_000); // Sunday 23:59:59
  return { start, end };
}

/** Ticketmaster requires UTC ISO timestamps without milliseconds. */
export function toTicketmasterDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
