export function isTicketmasterUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ticketmaster.com" || hostname.endsWith(".ticketmaster.com");
  } catch {
    return false;
  }
}

const LIVE_PRICE_NOTE =
  "The event feed did not include a price. Check the live listing against your budget.";

export function displayBudgetNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  return note.toLowerCase().includes("price unlisted") ? LIVE_PRICE_NOTE : note;
}
