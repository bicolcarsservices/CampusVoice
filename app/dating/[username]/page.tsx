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
    <div className="dating-profile community-profile mx-auto space-y-5">
      <Link href="/dating" className="community-profile-back">← Dating</Link>
      <header className="dating-profile-card">
        <div className="dating-profile-cover" aria-hidden="true" />
        <div className="dating-profile-content">
          <div className="community-profile-avatar-ring">
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="community-profile-avatar" />
              : <div className="community-profile-avatar community-profile-avatar-fallback">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
          </div>
          <p className="community-profile-kicker">Dating profile</p>
          <h1>{profile.display_name}</h1>
          <p className="community-profile-username">@{profile.username}</p>
          <div className="dating-profile-details">
            {online && <span className="dating-profile-online"><span aria-hidden="true" /> Online now</span>}
            <span>{profile.school_name ?? "Campus member"}</span>
          </div>
          {profile.bio && <p className="community-profile-bio">{profile.bio}</p>}
          <div className="dating-profile-actions">
            {!mine && (
              <>
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
              </>
            )}
            {mine && <Link href="/settings#profile" className="btn-primary">Manage your photos</Link>}
          </div>
        </div>
      </header>

      <section className="community-profile-gallery-section">
        <div className="community-profile-section-heading">
          <h2>Photos</h2>
          <span>{photos?.length ?? 0}</span>
        </div>
        <p className="text-sm text-slate-500">Profile photos only. These do not appear on the Freedom Wall.</p>
        {!photos?.length && <p className="card text-slate-500">No photos yet.</p>}
        <div className="community-profile-photo-grid">
          {(photos ?? []).map((photo) => {
            const url = supabase.storage.from("profile-photos").getPublicUrl(photo.image_path).data.publicUrl;
            return (
              <figure key={photo.id} className="community-profile-photo">
                <img src={url} alt={photo.caption || ""} />
                {photo.caption && <figcaption>{photo.caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      </section>
    </div>
  );
}
