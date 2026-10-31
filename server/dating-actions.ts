"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { sendDirectMessagePush, sendGroupMessagePush } from "@/lib/web-push";

export type ActionState = { error?: string; success?: string; redirectTo?: string } | null;

const uuidSchema = z.string().uuid();
const captionSchema = z.string().trim().max(200);
const messageSchema = z.string().trim().max(2000);

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const audioTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

async function getActiveUser() {
  const { supabase, user, error } = await getAuthUser(createClient());
  if (error) return { supabase, user: null, error: "Please log in and try again." };
  if (!user) return { supabase, user: null, error: "Please log in to continue." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { supabase, user: null, error: "Could not verify your account. Try again." };
  if (!profile || profile.status !== "active") {
    return { supabase, user: null, error: "Your account is not active." };
  }
  return { supabase, user, error: null };
}

function actionError(message: string) {
  if (message.includes("NOT_AUTHENTICATED")) return "Please log in to continue.";
  if (message.includes("ACCOUNT_NOT_ACTIVE")) return "Your account is not active.";
  if (message.includes("ALREADY_FRIENDS")) return "You are already friends.";
  if (message.includes("REQUEST_PENDING")) return "Friend request is already pending.";
  if (message.includes("PHOTO_LIMIT_REACHED")) return "You can post up to 24 photos on your profile.";
  if (message.includes("EMPTY_MESSAGE")) return "Write a message or attach a photo or voice note.";
  if (message.includes("MESSAGE_NOT_FOUND")) return "That message could not be unsent.";
  if (message.includes("USER_NOT_FOUND")) return "That account was not found.";
  if (message.includes("NOT_GROUP_MEMBER")) return "You are no longer a member of that group.";
  if (message.includes("INVALID_GROUP_MEMBERS")) return "Choose between 1 and 49 active group members.";
  if (message.includes("INVALID_GROUP_NAME")) return "Group names must be between 2 and 60 characters.";
  if (message.includes("INVALID_CONVERSATION")) return "Choose one valid conversation.";
  if (message.includes("MESSAGE_TOO_LONG")) return "Messages can be up to 2,000 characters.";
  if (message.includes("INVALID_MEDIA_PATH")) return "The attached media could not be verified.";
  return message;
}

export async function touchPresence() {
  const result = await getActiveUser();
  if (!result.user) return;
  await result.supabase.rpc("touch_presence");
}

async function uploadImage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bucket: "profile-photos" | "chat-images",
  file: File,
) {
  const extension = imageTypes[file.type];
  if (!extension) return { error: "Images must be JPG, PNG, or WebP.", path: null };
  if (file.size > 3 * 1024 * 1024) return { error: "Images must be 3 MB or smaller.", path: null };
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: `Image upload failed: ${error.message}`, path: null };
  return { error: null, path };
}

async function uploadAudio(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  file: File,
) {
  if (!audioTypes.has(file.type)) return { error: "Voice messages must use a supported audio format.", path: null };
  if (file.size > 10 * 1024 * 1024) return { error: "Voice messages must be 10 MB or smaller.", path: null };
  const extension = file.type === "audio/ogg" ? "ogg" : file.type === "audio/mp4" ? "m4a" :
    file.type === "audio/mpeg" ? "mp3" : file.type === "audio/wav" ? "wav" : "webm";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("chat-audio").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: `Voice message upload failed: ${error.message}`, path: null };
  return { error: null, path };
}

export async function sendFriendRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const userId = uuidSchema.safeParse(formData.get("user_id"));
  if (!userId.success) return { error: "Choose a valid account." };
  const { error } = await result.supabase.rpc("send_friend_request", { p_user_id: userId.data });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/dating");
  revalidatePath("/messages");
  return { success: "Friend request sent." };
}

export async function respondFriendRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const requestId = uuidSchema.safeParse(formData.get("request_id"));
  const accept = formData.get("accept") === "true";
  if (!requestId.success) return { error: "That request is invalid." };
  const { error } = await result.supabase.rpc("respond_friend_request", {
    p_request_id: requestId.data,
    p_accept: accept,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/dating");
  revalidatePath("/messages");
  return { success: accept ? "Friend request accepted." : "Friend request declined." };
}

export async function removeFriend(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const userId = uuidSchema.safeParse(formData.get("user_id"));
  if (!userId.success) return { error: "Choose a valid account." };
  const { error } = await result.supabase.rpc("remove_friend", { p_user_id: userId.data });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/dating");
  return { success: "Removed from friends." };
}

export async function addProfilePhoto(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const image = formData.get("image");
  const caption = captionSchema.safeParse(formData.get("caption") || "");
  if (!(image instanceof File) || image.size === 0) return { error: "Choose a photo to post." };
  if (!caption.success) return { error: "Caption must be 200 characters or less." };

  const uploaded = await uploadImage(result.supabase, result.user.id, "profile-photos", image);
  if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "Upload failed." };

  const { error } = await result.supabase.rpc("add_profile_photo", {
    p_image_path: uploaded.path,
    p_caption: caption.data || null,
  });
  if (error) {
    await result.supabase.storage.from("profile-photos").remove([uploaded.path]);
    return { error: actionError(error.message) };
  }
  revalidatePath("/profile");
  revalidatePath("/dating");
  return { success: "Photo posted to your profile." };
}

export async function deleteProfilePhoto(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const photoId = uuidSchema.safeParse(formData.get("photo_id"));
  if (!photoId.success) return { error: "That photo could not be removed." };
  const { data: path, error } = await result.supabase.rpc("delete_profile_photo", { p_photo_id: photoId.data });
  if (error) return { error: actionError(error.message) };
  if (typeof path === "string" && path) {
    await result.supabase.storage.from("profile-photos").remove([path]);
  }
  revalidatePath("/profile");
  revalidatePath("/dating");
  return { success: "Photo removed." };
}

export async function sendDirectMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const recipientId = uuidSchema.safeParse(formData.get("recipient_id"));
  const body = messageSchema.safeParse(formData.get("body") || "");
  if (!recipientId.success) return { error: "Choose who to message." };
  if (!body.success) return { error: "Messages can be up to 2,000 characters." };

  const image = formData.get("image");
  const audio = formData.get("audio");
  let imagePath: string | null = null;
  let audioPath: string | null = null;
  if (image instanceof File && image.size > 0) {
    const uploaded = await uploadImage(result.supabase, result.user.id, "chat-images", image);
    if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "Upload failed." };
    imagePath = uploaded.path;
  }
  if (audio instanceof File && audio.size > 0) {
    const uploaded = await uploadAudio(result.supabase, result.user.id, audio);
    if (uploaded.error || !uploaded.path) {
      if (imagePath) await result.supabase.storage.from("chat-images").remove([imagePath]);
      return { error: uploaded.error ?? "Voice message upload failed." };
    }
    audioPath = uploaded.path;
  }

  let { error } = await result.supabase.rpc("send_direct_message", {
    p_recipient_id: recipientId.data,
    p_body: body.data || null,
    p_image_path: imagePath,
    p_audio_path: audioPath,
  });
  if (error && !audioPath && (error.code === "PGRST202" || error.code === "42883")) {
    const legacyResult = await result.supabase.rpc("send_direct_message", {
      p_recipient_id: recipientId.data,
      p_body: body.data || null,
      p_image_path: imagePath,
    });
    error = legacyResult.error;
  }
  if (error) {
    if (imagePath) await result.supabase.storage.from("chat-images").remove([imagePath]);
    if (audioPath) await result.supabase.storage.from("chat-audio").remove([audioPath]);
    return { error: actionError(error.message) };
  }
  await sendDirectMessagePush(result.user.id, recipientId.data);
  revalidatePath("/messages");
  revalidatePath(`/messages/${recipientId.data}`);
  return { success: "Message sent." };
}

export async function createGroupChat(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  if (!name.success) return { error: "Group names must be between 2 and 60 characters." };
  const memberIds: string[] = [];
  for (const value of formData.getAll("member_id")) {
    const memberId = uuidSchema.safeParse(value);
    if (!memberId.success) return { error: "Choose valid group members." };
    memberIds.push(memberId.data);
  }
  if (memberIds.length < 1 || memberIds.length > 49) {
    return { error: "Choose between 1 and 49 active group members." };
  }
  const { data: groupId, error } = await result.supabase.rpc("create_group_chat", {
    p_name: name.data,
    p_member_ids: memberIds,
  });
  if (error) return { error: actionError(error.message) };
  if (typeof groupId !== "string" || !uuidSchema.safeParse(groupId).success) {
    throw new Error("The group chat response was invalid.");
  }
  revalidatePath("/dating");
  revalidatePath("/messages");
  return { success: "Group created.", redirectTo: `/messages/group/${groupId}` };
}

export async function sendGroupChatMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const groupId = uuidSchema.safeParse(formData.get("group_id"));
  const body = messageSchema.safeParse(formData.get("body") || "");
  if (!groupId.success) return { error: "Choose a valid group." };
  if (!body.success) return { error: "Messages can be up to 2,000 characters." };
  const image = formData.get("image");
  const audio = formData.get("audio");
  let imagePath: string | null = null;
  let audioPath: string | null = null;
  if (image instanceof File && image.size > 0) {
    const uploaded = await uploadImage(result.supabase, result.user.id, "chat-images", image);
    if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "Upload failed." };
    imagePath = uploaded.path;
  }
  if (audio instanceof File && audio.size > 0) {
    const uploaded = await uploadAudio(result.supabase, result.user.id, audio);
    if (uploaded.error || !uploaded.path) {
      if (imagePath) await result.supabase.storage.from("chat-images").remove([imagePath]);
      return { error: uploaded.error ?? "Voice message upload failed." };
    }
    audioPath = uploaded.path;
  }
  const { error } = await result.supabase.rpc("send_group_chat_message", {
    p_group_id: groupId.data,
    p_body: body.data || null,
    p_image_path: imagePath,
    p_audio_path: audioPath,
  });
  if (error) {
    if (imagePath) await result.supabase.storage.from("chat-images").remove([imagePath]);
    if (audioPath) await result.supabase.storage.from("chat-audio").remove([audioPath]);
    return { error: actionError(error.message) };
  }
  await sendGroupMessagePush(result.user.id, groupId.data);
  revalidatePath("/dating");
  revalidatePath(`/messages/group/${groupId.data}`);
  return { success: "Message sent." };
}

export async function toggleMessageReaction(
  messageId: string,
  emoji: string,
  conversationId: string,
  isGroup: boolean,
): Promise<{ error?: string }> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  if (!uuidSchema.safeParse(messageId).success || !uuidSchema.safeParse(conversationId).success) {
    return { error: "That message could not be updated." };
  }
  const allowedEmojis = ["👍", "❤️", "😂", "😮", "😢", "😡", "👏", "🔥"];
  if (!allowedEmojis.includes(emoji)) return { error: "Choose a valid reaction." };
  const { error } = await result.supabase.rpc("toggle_message_reaction", {
    p_emoji: emoji,
    p_direct_message_id: isGroup ? null : messageId,
    p_group_message_id: isGroup ? messageId : null,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath(isGroup ? `/messages/group/${conversationId}` : `/messages/${conversationId}`);
  return {};
}

export async function unsendGroupChatMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const messageId = uuidSchema.safeParse(formData.get("message_id"));
  const groupId = uuidSchema.safeParse(formData.get("group_id"));
  if (!messageId.success || !groupId.success) return { error: "That message could not be unsent." };
  const { error } = await result.supabase.rpc("unsend_group_chat_message", { p_message_id: messageId.data });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/dating");
  revalidatePath(`/messages/group/${groupId.data}`);
  return { success: "Message unsent." };
}

export async function unsendDirectMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const messageId = uuidSchema.safeParse(formData.get("message_id"));
  if (!messageId.success) return { error: "That message could not be unsent." };
  const { error } = await result.supabase.rpc("unsend_direct_message", { p_message_id: messageId.data });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/messages");
  return { success: "Message unsent." };
}

export async function setChatMuted({
  otherUserId,
  groupId,
  muted,
}: {
  otherUserId?: string;
  groupId?: string;
  muted: boolean;
}): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  if (Boolean(otherUserId) === Boolean(groupId)) return { error: "Choose one conversation." };
  const conversationId = uuidSchema.safeParse(otherUserId ?? groupId);
  if (!conversationId.success) return { error: "That conversation could not be updated." };

  const { error } = await result.supabase.rpc("set_chat_muted", {
    p_other_user_id: otherUserId ?? null,
    p_group_id: groupId ?? null,
    p_muted: muted,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/messages");
  if (otherUserId) revalidatePath(`/messages/${conversationId.data}`);
  else revalidatePath(`/messages/group/${conversationId.data}`);
  return { success: muted ? "Conversation muted." : "Conversation unmuted." };
}

export async function deleteDirectConversation(otherUserId: string): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const conversationId = uuidSchema.safeParse(otherUserId);
  if (!conversationId.success) return { error: "That conversation could not be deleted." };
  const { error } = await result.supabase.rpc("delete_direct_conversation", {
    p_other_user_id: conversationId.data,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId.data}`);
  return { redirectTo: "/messages" };
}

export async function leaveGroupConversation(groupId: string): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in." };
  const conversationId = uuidSchema.safeParse(groupId);
  if (!conversationId.success) return { error: "That group conversation could not be left." };
  const { error } = await result.supabase.rpc("leave_group_chat", {
    p_group_id: conversationId.data,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath("/messages");
  revalidatePath(`/messages/group/${conversationId.data}`);
  revalidatePath("/dating");
  return { redirectTo: "/messages" };
}
