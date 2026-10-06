"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudent } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type MessageState = { error?: string; ok?: number } | undefined;

const bodySchema = z.string().trim().min(1, "Write a message.").max(2000, "Keep it under 2000 characters.");

export async function contactSeller(listingId: string, _prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireStudent();
  if (!z.uuid().safeParse(listingId).success) return { error: "Listing not found." };
  const body = bodySchema.safeParse(formData.get("body") ?? "");
  if (!body.success) return { error: body.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("contact_seller", { p_listing_id: listingId, p_body: body.data });
  if (error || typeof data !== "string") return { error: "This item is no longer available." };
  redirect(`/messages/${data}`);
}

export async function sendMessage(conversationId: string, prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireStudent();
  if (!z.uuid().safeParse(conversationId).success) return { error: "Conversation not found." };
  const body = bodySchema.safeParse(formData.get("body") ?? "");
  if (!body.success) return { error: body.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, body: body.data });
  if (error) return { error: "Message not sent. Try again." };
  refresh();
  return { ok: (prev?.ok ?? 0) + 1 };
}
