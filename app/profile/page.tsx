import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ProfileForm from "@/components/community/ProfileForm";
import DeletePostForm from "@/components/community/DeletePostForm";
import ProfilePhotoComposer from "@/components/social/ProfilePhotoComposer";
import SocialActionForm from "@/components/social/SocialActionForm";
import AppearanceSettings from "@/components/AppearanceSettings";
import NotificationSettings from "@/components/NotificationSettings";
import { deleteProfilePhoto } from "@/server/dating-actions";
import { logout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: schools, error: schoolsError },
    { data: posts, error: postsError }, { data: quota, error: quotaError },
    { data: subscription, error: subscriptionError }, { data: photos, error: photosError },
    { data: notificationPreference, error: notificationPreferenceError }] = await Promise.all([
    supabase.from("profiles").select("id,username,display_name,school_id,school_name,grade_level,bio,avatar_path,created_at,status")
      .eq("id", user.id).maybeSingle(),
    supabase.from("schools").select("id,name").eq("is_active", true).order("name"),
    supabase.from("my_posts").select("id,content,status,is_anonymous,created_at").order("created_at", { ascending: false }).limit(10),
    supabase.rpc("my_post_quota"),
    supabase.rpc("my_subscription"),
    supabase.from("profile_photos").select("id,image_path,caption,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.rpc("my_notification_preference"),
  ]);
  if (profileError) throw new Error(`Could not load profile: ${profileError.message}`);
  if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);
  if (postsError) throw new Error(`Could not load your posts: ${postsError.message}`);
  if (quotaError) throw new Error(`Could not load posting allowance: ${quotaError.message}`);
  if (subscriptionError) throw new Error(`Could not load subscription: ${subscriptionError.message}`);
  if (photosError) throw new Error(`Could not load profile photos: ${photosError.message}`);
  const notificationSettingsNeedSetup = notificationPreferenceError?.code === "PGRST202" || notificationPreferenceError?.code === "42883";
  if (notificationPreferenceError && !notificationSettingsNeedSetup) {
    throw new Error(`Could not load notification settings: ${notificationPreferenceError.message}`);
  }
  if (!profile) throw new Error("Your profile was not found. Please contact support.");

  const schoolName = profile.school_name ?? schools?.find((school) => school.id === profile.school_id)?.name ?? "No school selected";
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  const settingsLinks = [
    ["Profile", "#profile"],
    ["Your posts", "#your-posts"],
    ["Appearance", "#appearance"],
    ["Notifications", "#notifications"],
    ["Subscription", "#subscription"],
    ["About CampusVoice", "#about"],
    ["Chat support", "#support"],
    ["Policies", "#policies"],
  ];

  return (
    <div className="settings-page mx-auto max-w-7xl">
      <header className="settings-page-header">
        <div className="settings-user-avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
            : profile.display_name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="eyebrow">CampusVoice account</p>
          <h1 className="text-3xl font-extrabold">Profile &amp; Settings</h1>
          <p className="text-sm text-slate-500">{profile.display_name} · @{profile.username}</p>
        </div>
      </header>

      <div className="settings-page-layout">
        <aside className="settings-sidebar">
          <p className="settings-sidebar-title">ACCOUNT &amp; PREFERENCES</p>
          <nav aria-label="Profile settings">
            {settingsLinks.map(([label, href]) => (
              <a key={href} href={href} className="settings-sidebar-link">
                <span>{label}</span><span aria-hidden="true">›</span>
              </a>
            ))}
          </nav>
          <form action={logout} className="settings-logout-form">
            <button type="submit" className="settings-sidebar-link settings-logout-link">
              <span>Log out</span><span aria-hidden="true">↗</span>
            </button>
          </form>
        </aside>

        <div className="settings-content">
          <section id="profile" className="settings-section">
            <div className="settings-section-heading">
              <div>
                <p className="eyebrow">Your account</p>
                <h2 className="text-2xl font-extrabold">Profile</h2>
              </div>
              <span className="tag capitalize">{profile.status}</span>
            </div>
            <div className="settings-profile-facts">
              <div><span>School</span><strong>{schoolName}</strong></div>
              <div><span>Grade / year</span><strong>{profile.grade_level || "Not set"}</strong></div>
              <div><span>Member since</span><strong>{new Date(profile.created_at).toLocaleDateString()}</strong></div>
            </div>
            <ProfileForm
              profile={{
                username: profile.username,
                display_name: profile.display_name,
                school_name: schoolName === "No school selected" ? "" : schoolName,
                grade_level: profile.grade_level,
                bio: profile.bio,
              }}
              schools={schools ?? []}
              avatarUrl={avatarUrl}
            />
            <ProfilePhotoComposer />
            {(photos ?? []).length > 0 && (
              <div className="settings-photo-grid">
                {(photos ?? []).map((photo) => {
                  const url = supabase.storage.from("profile-photos").getPublicUrl(photo.image_path).data.publicUrl;
                  return (
                    <figure key={photo.id} className="settings-photo-card">
                      <img src={url} alt={photo.caption || ""} className="aspect-square w-full rounded-xl object-cover" />
                      {photo.caption && <figcaption className="text-sm">{photo.caption}</figcaption>}
                      <SocialActionForm action={deleteProfilePhoto} submitLabel="Remove photo">
                        <input type="hidden" name="photo_id" value={photo.id} />
                      </SocialActionForm>
                    </figure>
                  );
                })}
              </div>
            )}
          </section>

          <section id="your-posts" className="settings-section">
            <div className="settings-section-heading">
              <div><p className="eyebrow">Your activity</p><h2 className="text-2xl font-extrabold">Your posts</h2></div>
              <Link href="/wall/new" className="btn-ghost">＋ Create post</Link>
            </div>
            {(posts ?? []).length === 0 && <p className="card text-sm text-slate-500">You haven’t posted yet.</p>}
            <div className="settings-post-list">
              {(posts ?? []).map((post) => (
                <article className="card" key={post.id}>
                  <div className="flex justify-between gap-3">
                    <span className="tag">{post.is_anonymous ? "Anonymous" : "Personal post"}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs capitalize text-slate-500">{post.status}</span>
                      <DeletePostForm postId={post.id} />
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words">{post.content}</p>
                  <p className="mt-3 text-xs text-slate-500">{new Date(post.created_at).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="appearance" className="settings-section">
            <AppearanceSettings />
          </section>

          <section id="notifications" className="settings-section">
            <NotificationSettings enabled={notificationPreference !== false} setupNeeded={notificationSettingsNeedSetup} />
            <Link href="/notifications" className="btn-ghost settings-inbox-link">View notification inbox <span aria-hidden="true">→</span></Link>
          </section>

          <section id="subscription" className="settings-section card settings-link-section">
            <div>
              <p className="eyebrow">Your plan</p>
              <h2 className="text-xl font-bold capitalize">{subscription?.plan_name ?? "Free plan"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {quota?.limit == null ? `${quota?.used ?? 0} posts used today · unlimited` : `${quota?.used ?? 0} / ${quota?.limit} posts used today`}
              </p>
              {subscription?.expires_at && <p className="mt-1 text-sm text-slate-500">Expires {new Date(subscription.expires_at).toLocaleDateString()}</p>}
            </div>
            <Link href="/subscription" className="btn-ghost">Subscription settings <span aria-hidden="true">→</span></Link>
          </section>

          <section id="about" className="settings-section card settings-link-section">
            <div>
              <p className="eyebrow">Learn more</p>
              <h2 className="text-xl font-bold">About CampusVoice</h2>
              <p className="mt-1 text-sm text-slate-500">Your voice, your space, your story.</p>
            </div>
            <Link href="/about" className="btn-ghost">About <span aria-hidden="true">→</span></Link>
          </section>

          <section id="support" className="settings-section card settings-link-section">
            <div>
              <p className="eyebrow">Need help?</p>
              <h2 className="text-xl font-bold">Chat support</h2>
              <p className="mt-1 text-sm text-slate-500">Message the CampusVoice Support team in a separate private inbox.</p>
            </div>
            <Link href="/support" className="btn-primary">Open support chat <span aria-hidden="true">→</span></Link>
          </section>

          <section id="policies" className="settings-section card">
            <p className="eyebrow">Your rights &amp; responsibilities</p>
            <h2 className="text-xl font-bold">Policies</h2>
            <div className="settings-policy-links">
              <Link href="/privacy" className="settings-policy-link"><span>Privacy policy</span><span aria-hidden="true">→</span></Link>
              <Link href="/terms" className="settings-policy-link"><span>Terms of use</span><span aria-hidden="true">→</span></Link>
              <Link href="/guidelines" className="settings-policy-link"><span>Community guidelines</span><span aria-hidden="true">→</span></Link>
            </div>
          </section>

          <form action={logout} className="settings-bottom-logout">
            <button type="submit" className="btn-ghost settings-logout-button">Log out of CampusVoice</button>
          </form>
        </div>
      </div>
    </div>
  );
}
