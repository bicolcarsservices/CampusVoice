import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ChatThread from "@/components/social/ChatThread";
import MessageSidebar from "@/components/social/MessageSidebar";
import type { DirectConversationLink, GroupConversationLink } from "@/components/social/MessageSidebar";

export const dynamic = "force-dynamic";

export default async function GroupMessagePage({ params }: { params: { groupId: string } }) {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const { data: group, error: groupError } = await supabase.from("group_chats")
    .select("id,name")
    .eq("id", params.groupId)
    .maybeSingle();
  if (groupError) throw new Error(`Could not load group chat: ${groupError.message}`);
  if (!group) notFound();

  const [
    { data: memberships, error: membersError },
    { data: rows, error: messagesError },
    { data: directRows, error: directError },
    { data: groupRows, error: groupErrorList },
    { data: chatPreferences, error: preferencesError },
  ] = await Promise.all([
    supabase.from("group_chat_members").select("user_id").eq("group_id", group.id),
    supabase.from("group_chat_messages")
      .select("id,sender_id,body,image_path,audio_path,created_at,unsent_at")
      .eq("group_id", group.id)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.rpc("my_conversations"),
    supabase.rpc("my_group_chats"),
    supabase.from("chat_preferences").select("muted")
      .eq("user_id", user.id).eq("group_id", group.id).maybeSingle(),
  ]);
  if (membersError) throw new Error(`Could not load group members: ${membersError.message}`);
  if (messagesError) throw new Error(`Could not load group messages: ${messagesError.message}`);
  if (directError) throw new Error(`Could not load your conversations: ${directError.message}`);
  if (groupErrorList) throw new Error(`Could not load group conversations: ${groupErrorList.message}`);
  const chatSettingsNeedSetup = Boolean(preferencesError && (
    preferencesError.code === "42P01" || preferencesError.code === "PGRST205" ||
    preferencesError.message.toLowerCase().includes("chat_preferences")
  ));
  if (preferencesError && !chatSettingsNeedSetup) {
    throw new Error(`Could not load your group chat settings: ${preferencesError.message}`);
  }
  const directThreads = ((directRows ?? []) as (Omit<DirectConversationLink, "avatarUrl"> & { avatar_path: string | null })[]).map((thread) => ({
    ...thread,
    avatarUrl: thread.avatar_path
      ? supabase.storage.from("avatars").getPublicUrl(thread.avatar_path).data.publicUrl
      : null,
  }));
  const groupThreads = (groupRows ?? []) as GroupConversationLink[];

  const memberIds = (memberships ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase.from("public_profiles").select("id,display_name").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Could not load group member names: ${profilesError.message}`);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  const messageRows = rows ?? [];
  const messageIds = messageRows.map((row) => row.id);
  const [{ data: reactions, error: reactionsError }, audioUrls] = await Promise.all([
    messageIds.length
      ? supabase.from("message_reactions").select("group_message_id,user_id,emoji").in("group_message_id", messageIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(messageRows.map(async (row) => {
      if (!row.audio_path) return [row.id, null] as const;
      const { data, error: audioError } = await supabase.storage.from("chat-audio").createSignedUrl(row.audio_path, 3600);
      if (audioError) throw new Error(`Could not load a voice message: ${audioError.message}`);
      return [row.id, data.signedUrl] as const;
    })),
  ]);
  if (reactionsError) throw new Error(`Could not load message reactions: ${reactionsError.message}`);
  const reactionsByMessage = new Map<string, { emoji: string; user_id: string }[]>();
  for (const reaction of reactions ?? []) {
    const list = reactionsByMessage.get(reaction.group_message_id) ?? [];
    list.push({ emoji: reaction.emoji, user_id: reaction.user_id });
    reactionsByMessage.set(reaction.group_message_id, list);
  }
  const audioUrlByMessage = new Map(audioUrls);
  const messages = messageRows.map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    body: row.body,
    image_path: row.image_path,
    created_at: row.created_at,
    unsent_at: row.unsent_at,
    imageUrl: row.image_path
      ? supabase.storage.from("chat-images").getPublicUrl(row.image_path).data.publicUrl
      : null,
    audioUrl: audioUrlByMessage.get(row.id) ?? null,
    reactions: reactionsByMessage.get(row.id) ?? [],
  }));

  return (
    <section className="messenger-thread-layout">
      <MessageSidebar directThreads={directThreads} groupThreads={groupThreads} activeThreadId={group.id} />
      <div className="messenger-thread-main">
        <header className="messenger-thread-header messenger-thread-header-group">
          <Link href="/messages" className="messenger-back-link" aria-label="Back to messages">←</Link>
          <span className="messenger-participant-avatar messenger-group-avatar" aria-hidden="true">✦</span>
          <div className="messenger-participant-info">
            <h1>{group.name}</h1>
            <p>{memberIds.length} members · {(memberIds.map((id) => names.get(id)).filter(Boolean)).join(", ")}</p>
          </div>
          <div id="messenger-header-actions" className="messenger-header-actions" />
        </header>
        <ChatThread
          groupId={group.id}
          currentUserId={user.id}
          messages={messages}
          conversationName={group.name}
          initialMuted={Boolean(chatPreferences?.muted)}
          chatSettingsNeedSetup={chatSettingsNeedSetup}
        />
      </div>
    </section>
  );
}
