"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export type SupportActionState = { error?: string; success?: string } | null;

const messageSchema = z.string().trim().min(1).max(2000);
const uuidSchema = z.string().uuid();

async function getSignedInUser() {
  const { supabase, user, error } = await getAuthUser(createClient());
  if (error || !user) return { supabase, user: null, error: "Please log in to continue." };
  return { supabase, user, error: null };
}

export async function sendSupportMessage(_: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const { supabase, user, error: authError } = await getSignedInUser();
  if (!user) return { error: authError ?? "Please log in to continue." };
  const body = messageSchema.safeParse(formData.get("body"));
  if (!body.success) return { error: "Write a message of up to 2,000 characters." };

  const { error } = await supabase.rpc("send_support_message", { p_body: body.data });
  if (error) {
    if (error.message.includes("ACCOUNT_NOT_ACTIVE")) return { error: "Your account is not active." };
    if (error.message.includes("INVALID_SUPPORT_MESSAGE")) return { error: "Write a message of up to 2,000 characters." };
    return { error: `Could not send your support message: ${error.message}` };
  }
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { success: "Message sent to KanyaKanyaNa Support." };
}

export async function replyToSupportConversation(
  _: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const { supabase, user, error: authError } = await getSignedInUser();
  if (!user) return { error: authError ?? "Please log in to continue." };
  const conversationId = uuidSchema.safeParse(formData.get("conversation_id"));
  const body = messageSchema.safeParse(formData.get("body"));
  if (!conversationId.success) return { error: "Choose a valid support conversation." };
  if (!body.success) return { error: "Write a message of up to 2,000 characters." };

  const { error } = await supabase.rpc("reply_to_support_conversation", {
    p_conversation_id: conversationId.data,
    p_body: body.data,
  });
  if (error) {
    if (error.message.includes("ADMIN_REQUIRED")) return { error: "Administrator access is required." };
    if (error.message.includes("INVALID_SUPPORT_MESSAGE")) return { error: "Write a message of up to 2,000 characters." };
    return { error: `Could not send the support reply: ${error.message}` };
  }
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${conversationId.data}`);
  revalidatePath("/support");
  return { success: "Reply sent as KanyaKanyaNa Support." };
}
