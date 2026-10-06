"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client, authenticated as the signed-in user from the
// session cookies. Used only to upload listing photos straight to Storage
// (storage policies apply); all other reads and writes go through the server.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
