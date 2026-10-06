"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CAMPUS_IDS, safeRedirectPath } from "@/lib/catalog";
import { requireUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type ProfileState = { error?: string; saved?: boolean } | undefined;

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name.").max(80),
  campus_id: z.enum(CAMPUS_IDS, { error: "Pick your campus." }),
  program: z.string().trim().max(80),
});

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    campus_id: formData.get("campus_id"),
    program: formData.get("program") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, program: parsed.data.program || null })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save your profile." };

  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(safeRedirectPath(next));
  refresh();
  return { saved: true };
}
