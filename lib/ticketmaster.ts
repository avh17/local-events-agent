export interface TMSearchParams {
  keyword?: string;
  city?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  startDateTime?: string; // "YYYY-MM-DDTHH:mm:ssZ"
  endDateTime?: string;
  category?: string; // Ticketmaster classificationName, e.g. "Music"
  size?: number;
}

export interface TMEvent {
  id: string;
  name: string;
  url: string;
  date: string; // ISO dateTime when known, else localDate
  venue: string;
  city: string;
  state?: string;
  lat?: number;
  lng?: number;
  priceMin?: number;
  priceMax?: number;
  imageUrl?: string;
  category?: string;
}

const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

export function buildSearchUrl(params: TMSearchParams, apiKey: string): string {
  const sp = new URLSearchParams();
  sp.set("apikey", apiKey);
  sp.set("size", String(params.size ?? 40));
  sp.set("sort", "date,asc");
  if (params.keyword) sp.set("keyword", params.keyword);
  if (params.lat !== undefined && params.lng !== undefined) {
    sp.set("latlong", `${params.lat},${params.lng}`);
    sp.set("radius", String(Math.max(1, Math.round(params.radiusMiles ?? 30))));
    sp.set("unit", "miles");
  } else if (params.city) {
    sp.set("city", params.city);
  }
  if (params.category) sp.set("classificationName", params.category);
  if (params.startDateTime) sp.set("startDateTime", params.startDateTime);
  if (params.endDateTime) sp.set("endDateTime", params.endDateTime);
  return `${BASE_URL}?${sp.toString()}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEvents(json: any): TMEvent[] {
  const events = json?._embedded?.events;
  if (!Array.isArray(events)) return [];
  return events.map((e: any): TMEvent => {
    const venue = e?._embedded?.venues?.[0];
    const price = Array.isArray(e?.priceRanges) ? e.priceRanges[0] : undefined;
    const images: any[] = Array.isArray(e?.images) ? e.images : [];
    const bestImage = images.reduce(
      (best, img) => (!best || (img?.width ?? 0) > (best?.width ?? 0) ? img : best),
      undefined as any,
    );
    const latRaw = venue?.location?.latitude;
    const lngRaw = venue?.location?.longitude;
    return {
      id: String(e?.id ?? ""),
      name: String(e?.name ?? ""),
      url: String(e?.url ?? ""),
      date: e?.dates?.start?.dateTime ?? e?.dates?.start?.localDate ?? "",
      venue: venue?.name ?? "",
      city: venue?.city?.name ?? "",
      state: venue?.state?.stateCode ?? undefined,
      lat: latRaw !== undefined ? Number.parseFloat(latRaw) : undefined,
      lng: lngRaw !== undefined ? Number.parseFloat(lngRaw) : undefined,
      priceMin: typeof price?.min === "number" ? price.min : undefined,
      priceMax: typeof price?.max === "number" ? price.max : undefined,
      imageUrl: bestImage?.url ?? undefined,
      category: e?.classifications?.[0]?.segment?.name ?? undefined,
    };
  });
}

export async function searchTicketmaster(
  params: TMSearchParams,
  opts?: { apiKey?: string; fetchFn?: typeof fetch },
): Promise<TMEvent[]> {
  const apiKey = opts?.apiKey ?? process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("Ticketmaster API key is not configured (TICKETMASTER_API_KEY)");
  const fetchFn = opts?.fetchFn ?? fetch;
  const res = await fetchFn(buildSearchUrl(params, apiKey));
  if (!res.ok) {
    const body = await (res as any).text?.().catch(() => "");
    throw new Error(`Ticketmaster search failed (HTTP ${res.status}): ${body}`);
  }
  return mapEvents(await res.json());
}
