import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-side jobs (the weekly digest) that must read
 * across users. Never import this from client components.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
