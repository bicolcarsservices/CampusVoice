import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ProfileForm from "@/components/community/ProfileForm";
import DeletePostForm from "@/components/community/DeletePostForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: schools, error: schoolsError },
    { data: posts, error: postsError }, { data: quota, error: quotaError },
    { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("profiles").select("id,username,display_name,school_id,school_name,grade_level,bio,avatar_path,created_at,status")
      .eq("id", user.id).maybeSingle(),
    supabase.from("schools").select("id,name").eq("is_active", true).order("name"),
    supabase.from("my_posts").select("id,content,status,is_anonymous,created_at").order("created_at", { ascending: false }).limit(10),
    supabase.rpc("my_post_quota"),
    supabase.rpc("my_subscription"),
  ]);
  if (profileError) throw new Error(`Could not load profile: ${profileError.message}`);
  if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);
  if (postsError) throw new Error(`Could not load your posts: ${postsError.message}`);
  if (quotaError) throw new Error(`Could not load posting allowance: ${quotaError.message}`);
  if (subscriptionError) throw new Error(`Could not load subscription: ${subscriptionError.message}`);
  if (!profile) throw new Error("Your profile was not found. Please contact support.");

  const schoolName = profile.school_name ?? schools?.find((school) => school.id === profile.school_id)?.name ?? "No school selected";
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <section className="space-y-4">
        <article className="card">
          <div className="flex items-center gap-4">
            {avatarUrl ? <img src={avatarUrl} alt="" className="avatar-fallback h-16 w-16 object-cover" /> :
              <div className="avatar-fallback h-16 w-16 text-xl">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
            <div>
              <p className="eyebrow">Your profile</p>
              <h1 className="text-2xl font-bold">{profile.display_name}</h1>
              <p className="text-sm text-slate-500">@{profile.username}</p>
            </div>
          </div>
          <p className="mt-4 text-sm">{profile.bio || "Add a short bio to tell the community about yourself."}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">School</dt><dd className="text-right">{schoolName}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Grade / Year</dt><dd>{profile.grade_level || "Not set"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Joined</dt><dd>{new Date(profile.created_at).toLocaleDateString()}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Account</dt><dd className="capitalize">{profile.status}</dd></div>
          </dl>
        </article>

        <article className="card">
          <p className="eyebrow">Your account</p>
          <h2 className="text-xl font-bold capitalize">{subscription?.plan_name ?? "Free plan"}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {quota?.limit == null ? `${quota?.used ?? 0} posts used today · unlimited` : `${quota?.used ?? 0} / ${quota?.limit} posts used today`}
          </p>
          {subscription?.expires_at && <p className="mt-1 text-sm text-slate-500">Expires {new Date(subscription.expires_at).toLocaleDateString()}</p>}
          <a href="/subscription" className="btn-ghost mt-4">View plans</a>
        </article>

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
      </section>

      <section className="space-y-4">
        <div><p className="eyebrow">Your activity</p><h2 className="text-2xl font-bold">Your posts</h2></div>
        {(posts ?? []).length === 0 && <p className="card text-sm text-slate-500">You haven’t posted yet.</p>}
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
      </section>
    </div>
  );
}
