import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_TASTE, type Profile } from "./types";

export async function loadOrCreateProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;

  // Normally created by the auth trigger; this covers users who signed up
  // before the trigger existed.
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, email, taste: EMPTY_TASTE, digest_opt_in: true })
    .select()
    .single();
  if (insertError) throw insertError;
  return created as Profile;
}

export function makeSaveProfile(supabase: SupabaseClient, userId: string) {
  return async (patch: Partial<Profile>): Promise<Profile> => {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  };
}
