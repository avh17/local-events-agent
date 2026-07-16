import { describe, it, expect, vi } from "vitest";
import { geocode } from "../lib/geocode";

describe("geocode", () => {
  it("returns coordinates from the first Nominatim result", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { lat: "33.4255", lon: "-111.9400", display_name: "Tempe, Maricopa County, Arizona, USA" },
      ],
    })) as unknown as typeof fetch;

    const result = await geocode("Tempe, AZ", fetchFn);
    expect(result).toEqual({
      lat: 33.4255,
      lng: -111.94,
      display: "Tempe, Maricopa County, Arizona, USA",
    });

    const [url, init] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain(encodeURIComponent("Tempe, AZ"));
    // Nominatim usage policy requires an identifying User-Agent
    expect(init.headers["User-Agent"]).toBeTruthy();
  });

  it("returns null when no results match", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    expect(await geocode("zzzz-nowhere", fetchFn)).toBeNull();
  });

  it("returns null on a failed response instead of throwing", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    expect(await geocode("Tempe, AZ", fetchFn)).toBeNull();
  });
});
