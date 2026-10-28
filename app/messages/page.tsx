import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isCurrentlyOnline } from "@/lib/social";
import MessagesInbox from "@/components/social/MessagesInbox";
import type { DirectConversationLink, GroupConversationLink } from "@/components/social/MessageSidebar";

export const dynamic = "force-dynamic";

type ConversationRow = Omit<DirectConversationLink, "avatarUrl"> & {
  avatar_path: string | null;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

export default async function MessagesPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const [
    { data: profiles, error: profilesError },
    { data: presence, error: presenceError },
    { data: friendships, error: friendshipsError },
    { data: conversations, error: conversationsError },
    { data: groupConversations, error: groupConversationsError },
    { data: chatPreferences, error: chatPreferencesError },
  ] = await Promise.all([
    supabase.from("public_profiles")
      .select("id,username,display_name,avatar_path")
      .neq("id", user.id)
      .order("display_name"),
    supabase.from("user_presence").select("user_id,last_seen_at"),
    supabase.from("friendships")
      .select("requester_id,addressee_id,status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.rpc("my_conversations"),
    supabase.rpc("my_group_chats"),
    supabase.from("chat_preferences").select("other_user_id,deleted_at").eq("user_id", user.id).not("deleted_at", "is", null),
  ]);
  if (profilesError) throw new Error(`Could not load your friends: ${profilesError.message}`);
  if (presenceError) throw new Error(`Could not load online status: ${presenceError.message}`);
  if (friendshipsError) throw new Error(`Could not load friends: ${friendshipsError.message}`);
  if (conversationsError) throw new Error(`Could not load messages: ${conversationsError.message}`);
  const chatSettingsNeedSetup = Boolean(chatPreferencesError && (
    chatPreferencesError.code === "42P01" || chatPreferencesError.code === "PGRST205" ||
    chatPreferencesError.message.toLowerCase().includes("chat_preferences")
  ));
  if (chatPreferencesError && !chatSettingsNeedSetup) {
    throw new Error(`Could not load your conversation settings: ${chatPreferencesError.message}`);
  }
  const groupChatNeedsSetup = groupConversationsError?.code === "PGRST202" || groupConversationsError?.code === "42883";
  if (groupConversationsError && !groupChatNeedsSetup) {
    throw new Error(`Could not load group messages: ${groupConversationsError.message}`);
  }

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile as ProfileRow]));
  const friends = (friendships ?? [])
    .filter((friendship) => friendship.status === "accepted")
    .map((friendship) => profilesById.get(
      friendship.requester_id === user.id ? friendship.addressee_id : friendship.requester_id
    ))
    .filter((profile): profile is ProfileRow => Boolean(profile))
    .map((profile) => ({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatarUrl: profile.avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
        : null,
      online: isCurrentlyOnline((presence ?? []).find((row) => row.user_id === profile.id)?.last_seen_at),
    }))
    .sort((left, right) => Number(right.online) - Number(left.online) || left.display_name.localeCompare(right.display_name));

  const deletedAtByUser = new Map((chatPreferences ?? []).map((preference) => [preference.other_user_id, preference.deleted_at]));
  const directThreads = ((conversations ?? []) as ConversationRow[])
    .filter((thread) => {
      const deletedAt = deletedAtByUser.get(thread.other_user_id);
      return !deletedAt || (thread.last_at && new Date(thread.last_at) > new Date(deletedAt));
    })
    .map((thread) => ({
    ...thread,
    avatarUrl: thread.avatar_path
      ? supabase.storage.from("avatars").getPublicUrl(thread.avatar_path).data.publicUrl
      : null,
    }));
  const groupThreads = groupChatNeedsSetup
    ? []
    : (groupConversations ?? []) as GroupConversationLink[];

  return (
    <MessagesInbox
      friends={friends}
      directThreads={directThreads}
      groupThreads={groupThreads}
      profiles={(profiles ?? []).map((profile) => ({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
      }))}
      groupChatNeedsSetup={groupChatNeedsSetup}
    />
  );
}
