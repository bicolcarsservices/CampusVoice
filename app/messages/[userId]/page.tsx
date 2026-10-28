import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ChatThread from "@/components/social/ChatThread";
import MessageSidebar from "@/components/social/MessageSidebar";
import type { DirectConversationLink, GroupConversationLink } from "@/components/social/MessageSidebar";
import { isCurrentlyOnline } from "@/lib/social";

export const dynamic = "force-dynamic";

type DirectMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  image_path: string | null;
  audio_path?: string | null;
  created_at: string;
  unsent_at: string | null;
};

export default async function MessageThreadPage({ params }: { params: { userId: string } }) {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");
  if (params.userId === user.id) redirect("/messages");

  const { data: profile, error: profileError } = await supabase.from("public_profiles")
    .select("id,username,display_name,avatar_path")
    .eq("id", params.userId)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load chat: ${profileError.message}`);
  if (!profile) notFound();

  const [readResult, withAudio, directResult, groupResult, presenceResult, preferencesResult] = await Promise.all([
    supabase.rpc("mark_thread_read", { p_other_user_id: profile.id }),
    supabase.from("direct_messages")
      .select("id,sender_id,recipient_id,body,image_path,audio_path,created_at,unsent_at")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.rpc("my_conversations"),
    supabase.rpc("my_group_chats"),
    supabase.from("user_presence").select("last_seen_at").eq("user_id", profile.id).maybeSingle(),
    supabase.from("chat_preferences").select("muted,deleted_at")
      .eq("user_id", user.id).eq("other_user_id", profile.id).maybeSingle(),
  ]);
  if (readResult.error) throw new Error(`Could not update the conversation read status: ${readResult.error.message}`);
  if (directResult.error) throw new Error(`Could not load your conversations: ${directResult.error.message}`);
  if (presenceResult.error) throw new Error(`Could not load chat presence: ${presenceResult.error.message}`);
  const chatSettingsNeedSetup = Boolean(preferencesResult.error && (
    preferencesResult.error.code === "42P01" || preferencesResult.error.code === "PGRST205" ||
    preferencesResult.error.message.toLowerCase().includes("chat_preferences")
  ));
  if (preferencesResult.error && !chatSettingsNeedSetup) {
    throw new Error(`Could not load your chat settings: ${preferencesResult.error.message}`);
  }
  const groupSetupNeeded = groupResult.error?.code === "PGRST202" || groupResult.error?.code === "42883";
  if (groupResult.error && !groupSetupNeeded) throw new Error(`Could not load group conversations: ${groupResult.error.message}`);
  const directThreads = ((directResult.data ?? []) as (Omit<DirectConversationLink, "avatarUrl"> & { avatar_path: string | null })[]).map((thread) => ({
    ...thread,
    avatarUrl: thread.avatar_path
      ? supabase.storage.from("avatars").getPublicUrl(thread.avatar_path).data.publicUrl
      : null,
  }));
  const groupThreads = groupSetupNeeded ? [] : (groupResult.data ?? []) as GroupConversationLink[];
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const online = isCurrentlyOnline(presenceResult.data?.last_seen_at);
  let messageRows: DirectMessageRow[] = (withAudio.data ?? []) as DirectMessageRow[];
  if (withAudio.error) {
    if (withAudio.error.code !== "42703" && withAudio.error.code !== "PGRST204" &&
        !withAudio.error.message.toLowerCase().includes("audio_path")) {
      throw new Error(`Could not load messages: ${withAudio.error.message}`);
    }
    const legacy = await supabase.from("direct_messages")
      .select("id,sender_id,recipient_id,body,image_path,created_at,unsent_at")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(200);
    if (legacy.error) throw new Error(`Could not load messages: ${legacy.error.message}`);
    messageRows = (legacy.data ?? []) as DirectMessageRow[];
  }
  const deletedAt = preferencesResult.data?.deleted_at;
  if (deletedAt) {
    messageRows = messageRows.filter((message) => message.created_at > deletedAt);
  }

  const messageIds = messageRows.map((row) => row.id);
  const [{ data: reactions, error: reactionsError }, audioUrls] = await Promise.all([
    messageIds.length
      ? supabase.from("message_reactions").select("direct_message_id,user_id,emoji").in("direct_message_id", messageIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(messageRows.map(async (row) => {
      if (!row.audio_path) return [row.id, null] as const;
      const { data, error: audioError } = await supabase.storage.from("chat-audio").createSignedUrl(row.audio_path, 3600);
      if (audioError) throw new Error(`Could not load a voice message: ${audioError.message}`);
      return [row.id, data.signedUrl] as const;
    })),
  ]);
  const reactionsNeedSetup = reactionsError?.code === "PGRST205" || reactionsError?.code === "42P01" ||
    (reactionsError?.message.toLowerCase().includes("message_reactions") ?? false);
  if (reactionsError && !reactionsNeedSetup) throw new Error(`Could not load message reactions: ${reactionsError.message}`);
  const reactionsByMessage = new Map<string, { emoji: string; user_id: string }[]>();
  for (const reaction of reactions ?? []) {
    const list = reactionsByMessage.get(reaction.direct_message_id) ?? [];
    list.push({ emoji: reaction.emoji, user_id: reaction.user_id });
    reactionsByMessage.set(reaction.direct_message_id, list);
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
      <MessageSidebar directThreads={directThreads} groupThreads={groupThreads} activeThreadId={profile.id} />
      <div className="messenger-thread-main">
        <header className="messenger-thread-header">
          <Link href="/messages" className="messenger-back-link" aria-label="Back to messages">←</Link>
          <Link href={`/dating/${profile.username}`} className="messenger-participant-avatar" aria-label={`View ${profile.display_name}'s profile`}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" />
              : <span>{profile.display_name.slice(0, 1).toUpperCase()}</span>}
            <span className={`messenger-presence-dot${online ? " messenger-presence-online" : ""}`} />
          </Link>
          <div className="messenger-participant-info">
            <h1>{profile.display_name}</h1>
            <Link href={`/dating/${profile.username}`}>@{profile.username} · {online ? "Online" : "View profile"}</Link>
          </div>
          <div id="messenger-header-actions" className="messenger-header-actions" />
        </header>
        <ChatThread
          recipientId={profile.id}
          currentUserId={user.id}
          messages={messages}
          conversationName={profile.display_name}
          participantAvatarUrl={avatarUrl}
          participantUsername={profile.username}
          participantHref={`/dating/${profile.username}`}
          initialMuted={Boolean(preferencesResult.data?.muted)}
          chatSettingsNeedSetup={chatSettingsNeedSetup}
        />
      </div>
    </section>
  );
}
