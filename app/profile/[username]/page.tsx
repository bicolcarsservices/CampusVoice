import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const username = params.username.trim().replace(/^@/, "");
  const supabase = createClient();
  const { data: profile, error } = await supabase.from("public_profiles")
    .select("id,username,display_name,school_id,school_name,bio,avatar_path,created_at")
    .ilike("username", username).maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!profile) notFound();

  const [{ data: school }, { data: posts, error: postsError }] = await Promise.all([
    profile.school_id
      ? supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("public_posts")
      .select("id,content,is_anonymous,created_at,username,display_name,school_id")
      .eq("username", profile.username).order("created_at", { ascending: false }).limit(20),
  ]);
  if (postsError) throw new Error(`Could not load public posts: ${postsError.message}`);
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/wall" className="font-semibold text-brand">← Freedom Wall</Link>
      <header className="card flex flex-wrap items-center gap-4">
        {avatarUrl ? <img src={avatarUrl} alt="" className="avatar-fallback h-20 w-20 object-cover" /> :
          <div className="avatar-fallback h-20 w-20 text-2xl">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
        <div><p className="eyebrow">Community profile</p><h1 className="text-3xl font-bold">{profile.display_name}</h1><p className="text-slate-500">@{profile.username}</p></div>
        <dl className="w-full border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <div className="flex justify-between"><dt className="text-slate-500">School</dt><dd>{profile.school_name ?? school?.name ?? "Community member"}</dd></div>
          <div className="mt-2 flex justify-between"><dt className="text-slate-500">Joined</dt><dd>{new Date(profile.created_at).toLocaleDateString()}</dd></div>
        </dl>
        {profile.bio && <p className="w-full">{profile.bio}</p>}
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Public posts</h2>
        {!posts?.length && <p className="card text-slate-500">No public posts yet.</p>}
        {(posts ?? []).map((post) => (
          <article className="card" key={post.id}>
            <p className="text-xs text-slate-500">{post.is_anonymous ? "Anonymous" : "@" + profile.username} · {new Date(post.created_at).toLocaleString()}</p>
            <p className="mt-3 whitespace-pre-wrap break-words">{post.content}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
