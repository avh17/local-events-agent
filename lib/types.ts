export interface TasteProfile {
  likes: string[];
  dislikes: string[];
  vibes: string[];
  notes: string[];
}

export interface Profile {
  id: string;
  email: string | null;
  home_base_text: string | null;
  home_lat: number | null;
  home_lng: number | null;
  budget_cap: number | null;
  max_distance_miles: number | null;
  taste: TasteProfile | null;
  digest_opt_in: boolean;
}

export const EMPTY_TASTE: TasteProfile = { likes: [], dislikes: [], vibes: [], notes: [] };

/** An event as shown to the user in the chat UI (and the digest email). */
export interface EventCard {
  id: string;
  name: string;
  url: string;
  date: string;
  venue: string;
  city: string;
  image_url?: string;
  price_min?: number;
  price_max?: number;
  distance_miles?: number;
  reason: string;
  budget_note?: string;
}

export interface FeedbackRow {
  event_name: string;
  signal: string; // 'up' | 'down' | 'booked'
}
