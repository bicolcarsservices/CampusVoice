import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import SocialActionForm from "@/components/social/SocialActionForm";
import { removeFriend, sendFriendRequest } from "@/server/dating-actions";
import { isCurrentlyOnline } from "@/lib/social";

export const dynamic = "force-dynamic";

export default async function DatingProfilePage({ params }: { params: { username: string } }) {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const username = params.username.trim().replace(/^@/, "");
  const { data: profile, error } = await supabase.from("public_profiles")
    .select("id,username,display_name,school_name,bio,avatar_path,created_at")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!profile) notFound();

  const [{ data: photos, error: photosError }, { data: presence }, { data: friendship }] = await Promise.all([
    supabase.from("profile_photos").select("id,image_path,caption,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("user_presence").select("last_seen_at").eq("user_id", profile.id).maybeSingle(),
    supabase.from("friendships")
      .select("id,requester_id,addressee_id,status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`)
      .maybeSingle(),
  ]);
  if (photosError) throw new Error(`Could not load photos: ${photosError.message}`);

  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const mine = profile.id === user.id;
  const online = isCurrentlyOnline(presence?.last_seen_at);
  let friendLabel: "none" | "friends" | "outgoing" | "incoming" = "none";
  if (friendship?.status === "accepted") friendLabel = "friends";
  else if (friendship?.status === "pending" && friendship.requester_id === user.id) friendLabel = "outgoing";
  else if (friendship?.status === "pending") friendLabel = "incoming";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dating" className="font-semibold text-brand">← Dating</Link>
      <header className="card space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="avatar-fallback h-20 w-20 object-cover" />
            : <div className="avatar-fallback h-20 w-20 text-2xl">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
          <div>
            <p className="eyebrow">Profile</p>
            <h1 className="text-3xl font-bold">{profile.display_name} {online && <span className="text-sm font-semibold text-emerald-600">Online</span>}</h1>
            <p className="text-slate-500">@{profile.username}</p>
            <p className="text-sm text-slate-500">{profile.school_name ?? "Campus member"}</p>
          </div>
        </div>
        {profile.bio && <p>{profile.bio}</p>}
        {!mine && (
          <div className="flex flex-wrap gap-2">
            {friendLabel === "none" && (
              <SocialActionForm action={sendFriendRequest} submitLabel="Add friend" buttonClassName="btn-ghost">
                <input type="hidden" name="user_id" value={profile.id} />
              </SocialActionForm>
            )}
            {friendLabel === "outgoing" && <span className="btn-ghost pointer-events-none opacity-70">Requested</span>}
            {friendLabel === "incoming" && <Link href="/dating" className="btn-ghost">Respond on Dating</Link>}
            {friendLabel === "friends" && (
              <SocialActionForm action={removeFriend} submitLabel="Unfriend">
                <input type="hidden" name="user_id" value={profile.id} />
              </SocialActionForm>
            )}
            <Link href={`/messages/${profile.id}`} className="btn-primary">Message</Link>
          </div>
        )}
        {mine && <Link href="/profile" className="btn-ghost">Manage your photos</Link>}
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Photos</h2>
        <p className="text-sm text-slate-500">Profile photos only. These do not appear on the Freedom Wall.</p>
        {!photos?.length && <p className="card text-slate-500">No photos yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(photos ?? []).map((photo) => {
            const url = supabase.storage.from("profile-photos").getPublicUrl(photo.image_path).data.publicUrl;
            return (
              <figure key={photo.id} className="card overflow-hidden p-0">
                <img src={url} alt={photo.caption || ""} className="aspect-square w-full object-cover" />
                {photo.caption && <figcaption className="p-3 text-sm">{photo.caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      </section>
    </div>
  );
}
