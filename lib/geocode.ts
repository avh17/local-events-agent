export interface GeocodeResult {
  lat: number;
  lng: number;
  display: string;
}

/**
 * Geocode a free-text location via Nominatim (OpenStreetMap).
 * Called once at onboarding per user — well within the usage policy, which
 * requires an identifying User-Agent.
 */
export async function geocode(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetchFn(url, {
      headers: { "User-Agent": "local-events-concierge/0.1 (events concierge web app)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      lat: Number.parseFloat(data[0].lat),
      lng: Number.parseFloat(data[0].lon),
      display: data[0].display_name,
    };
  } catch {
    return null;
  }
}
