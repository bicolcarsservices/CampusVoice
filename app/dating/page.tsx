import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import SocialActionForm from "@/components/social/SocialActionForm";
import { respondFriendRequest, sendFriendRequest } from "@/server/dating-actions";
import { isCurrentlyOnline } from "@/lib/social";

export const dynamic = "force-dynamic";

export default async function DatingPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");
  const userId = user.id;

  const [
    { data: profiles, error: profilesError },
    { data: presence },
    { data: friendships, error: friendsError },
    { data: conversations, error: conversationsError },
  ] = await Promise.all([
    supabase.from("public_profiles").select("id,username,display_name,school_name,bio,avatar_path").neq("id", userId).order("display_name"),
    supabase.from("user_presence").select("user_id,last_seen_at"),
    supabase.from("friendships").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase.rpc("my_conversations"),
  ]);
  if (profilesError) throw new Error(`Could not load dating profiles: ${profilesError.message}`);
  if (friendsError) throw new Error(`Could not load friends: ${friendsError.message}`);
  if (conversationsError) throw new Error(`Could not load messages: ${conversationsError.message}`);

  const presenceByUser = new Map((presence ?? []).map((row) => [row.user_id, row.last_seen_at]));
  const incoming = (friendships ?? []).filter((row) => row.addressee_id === userId && row.status === "pending");
  type Conversation = {
    other_user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_path: string | null;
    last_body: string | null;
    last_image: boolean | null;
    last_unsent: boolean | null;
    unread_count: number | null;
  };
  const threads = (conversations ?? []) as Conversation[];
  const onlineProfiles = (profiles ?? []).filter((profile) => isCurrentlyOnline(presenceByUser.get(profile.id)));

  function relation(otherId: string) {
    const row = (friendships ?? []).find((item) =>
      (item.requester_id === userId && item.addressee_id === otherId) ||
      (item.addressee_id === userId && item.requester_id === otherId)
    );
    if (!row) return "none";
    if (row.status === "accepted") return "friends";
    if (row.status === "pending" && row.requester_id === userId) return "outgoing";
    if (row.status === "pending") return "incoming";
    return "none";
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Meet people</p>
        <h1 className="text-3xl font-extrabold">Dating &amp; Messages</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Find people, see who is online, and continue your conversations in one place. Photos posted here stay on their profile, not the Freedom Wall.</p>
      </header>

      <section id="messages" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">Messages</h2>
        {!threads.length && <p className="card text-slate-500">No conversations yet. Open a profile and tap Message to start a chat.</p>}
        {threads.map((thread) => {
          const avatarUrl = thread.avatar_path
            ? supabase.storage.from("avatars").getPublicUrl(thread.avatar_path).data.publicUrl
            : null;
          const preview = thread.last_unsent
            ? "This message was unsent"
            : thread.last_body || (thread.last_image ? "Photo" : "Message");
          return (
            <Link key={thread.other_user_id} href={`/messages/${thread.other_user_id}`} className="card flex items-center gap-3 hover:border-violet-300">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="avatar-fallback h-12 w-12 object-cover" />
                : <div className="avatar-fallback h-12 w-12">{String(thread.display_name ?? "?").slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{thread.display_name} <span className="font-normal text-slate-500">@{thread.username}</span></p>
                <p className="truncate text-sm text-slate-500">{preview}</p>
              </div>
              {Number(thread.unread_count) > 0 && (
                <span className="rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">{Number(thread.unread_count)}</span>
              )}
            </Link>
          );
        })}
      </section>

      <section id="online-users" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">Online now <span className="text-sm font-medium text-slate-500">({onlineProfiles.length})</span></h2>
        {!onlineProfiles.length && <p className="card text-slate-500">No one is online right now.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {onlineProfiles.map((profile) => {
            const avatarUrl = profile.avatar_path
              ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
              : null;
            return (
              <article key={profile.id} className="card flex items-center gap-3">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="avatar-fallback h-12 w-12 object-cover" />
                  : <div className="avatar-fallback h-12 w-12">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{profile.display_name}</p>
                  <p className="truncate text-sm text-slate-500">@{profile.username}</p>
                </div>
                <Link href={`/messages/${profile.id}`} className="btn-primary">Message</Link>
              </article>
            );
          })}
        </div>
      </section>

      {!!incoming.length && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Friend requests</h2>
          {incoming.map((request) => {
            const from = (profiles ?? []).find((profile) => profile.id === request.requester_id);
            return (
              <article key={request.id} className="card flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">{from ? `${from.display_name} (@${from.username})` : "Campus member"}</p>
                <div className="flex gap-2">
                  <SocialActionForm action={respondFriendRequest} submitLabel="Accept" buttonClassName="btn-primary">
                    <input type="hidden" name="request_id" value={request.id} />
                    <input type="hidden" name="accept" value="true" />
                  </SocialActionForm>
                  <SocialActionForm action={respondFriendRequest} submitLabel="Decline">
                    <input type="hidden" name="request_id" value={request.id} />
                    <input type="hidden" name="accept" value="false" />
                  </SocialActionForm>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(profiles ?? []).map((profile) => {
          const avatarUrl = profile.avatar_path
            ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
            : null;
          const status = relation(profile.id);
          return (
            <article key={profile.id} className="card space-y-3">
              <div className="flex items-center gap-3">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="avatar-fallback h-14 w-14 object-cover" />
                  : <div className="avatar-fallback h-14 w-14 text-xl">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
                <div>
                  <p className="font-bold">{profile.display_name} {isCurrentlyOnline(presenceByUser.get(profile.id)) && <span className="text-xs font-semibold text-emerald-600">Online</span>}</p>
                  <p className="text-sm text-slate-500">@{profile.username}</p>
                  <p className="text-xs text-slate-500">{profile.school_name ?? "Campus member"}</p>
                </div>
              </div>
              {profile.bio && <p className="line-clamp-3 text-sm">{profile.bio}</p>}
              <div className="flex flex-wrap gap-2">
                <Link href={`/dating/${profile.username}`} className="btn-ghost">View</Link>
                {status === "none" && (
                  <SocialActionForm action={sendFriendRequest} submitLabel="Add friend">
                    <input type="hidden" name="user_id" value={profile.id} />
                  </SocialActionForm>
                )}
                {status === "outgoing" && <span className="btn-ghost pointer-events-none opacity-70">Requested</span>}
                {status === "friends" && <span className="btn-ghost pointer-events-none">Friends</span>}
                <Link href={`/messages/${profile.id}`} className="btn-primary">Message</Link>
              </div>
            </article>
          );
        })}
      </div>
      {!(profiles ?? []).length && <p className="card text-slate-500">No other profiles yet.</p>}
    </section>
  );
}
