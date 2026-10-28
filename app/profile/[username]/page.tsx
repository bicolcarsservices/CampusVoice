import { notFound } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/community/PostCard";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const username = params.username.trim().replace(/^@/, "");
  const supabase = createClient();
  const { data: profile, error } = await supabase.from("public_profiles")
    .select("id,username,display_name,school_id,school_name,bio,avatar_path,created_at")
    .ilike("username", username).maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!profile) notFound();

  const [
    { data: school, error: schoolError },
    { data: posts, error: postsError, count: postCount },
    { data: photos, error: photosError },
    { user },
  ] = await Promise.all([
    profile.school_id
      ? supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("public_posts")
      .select("id,content,image_path,is_anonymous,created_at,username,display_name,avatar_path,school_id,category_id,reaction_count,comment_count", { count: "exact" })
      .eq("username", profile.username).order("created_at", { ascending: false }).limit(20),
    supabase.from("profile_photos")
      .select("id,image_path,caption,created_at")
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
    getAuthUser(supabase),
  ]);
  if (schoolError) throw new Error(`Could not load profile school: ${schoolError.message}`);
  if (postsError) throw new Error(`Could not load public posts: ${postsError.message}`);
  if (photosError) throw new Error(`Could not load profile photos: ${photosError.message}`);
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const profilePhotos = photos?.length
    ? photos.map((photo) => ({
      id: photo.id,
      imageUrl: supabase.storage.from("profile-photos").getPublicUrl(photo.image_path).data.publicUrl,
      caption: photo.caption,
    }))
    : (posts ?? []).flatMap((post) => post.image_path ? [{
        id: post.id,
        imageUrl: supabase.storage.from("post-images").getPublicUrl(post.image_path).data.publicUrl,
        caption: post.content,
      }] : []);
  const postIds = (posts ?? []).map((post) => post.id);
  const [{ data: comments, error: commentsError }, { data: reactions, error: reactionsError },
    { data: myComments, error: myCommentsError }, { data: categories, error: categoriesError },
    { data: postSchools, error: postSchoolsError }, { data: viewerProfile, error: viewerProfileError }] = await Promise.all([
    postIds.length
      ? supabase.from("comments").select("id,post_id,parent_id,content,reaction_count,created_at").in("post_id", postIds)
        .eq("status", "approved").order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    user && postIds.length
      ? supabase.from("reactions").select("post_id,kind").eq("user_id", user.id).in("post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    user && postIds.length
      ? supabase.from("my_comment_ids").select("id").in("post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("categories").select("id,name").eq("is_active", true),
    supabase.from("schools").select("id,name").eq("is_active", true),
    user
      ? supabase.from("profiles").select("id,status").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (commentsError) throw new Error(`Could not load profile post comments: ${commentsError.message}`);
  if (reactionsError) throw new Error(`Could not load your profile post reactions: ${reactionsError.message}`);
  if (myCommentsError) throw new Error(`Could not load your profile comment permissions: ${myCommentsError.message}`);
  if (categoriesError) throw new Error(`Could not load post categories: ${categoriesError.message}`);
  if (postSchoolsError) throw new Error(`Could not load post schools: ${postSchoolsError.message}`);
  if (viewerProfileError) throw new Error(`Could not verify your account: ${viewerProfileError.message}`);
  const commentIds = (comments ?? []).map((comment) => comment.id);
  const { data: likedComments, error: likedCommentsError } = user && commentIds.length
    ? await supabase.from("reactions").select("comment_id").eq("user_id", user.id).in("comment_id", commentIds)
    : { data: [], error: null };
  if (likedCommentsError) throw new Error(`Could not load your comment reactions: ${likedCommentsError.message}`);
  const commentsByPost = new Map<string, Array<{
    id: string;
    post_id: string;
    parent_id: string | null;
    content: string;
    reaction_count: number;
    created_at: string;
  }>>();
  for (const comment of comments ?? []) {
    const current = commentsByPost.get(comment.post_id) ?? [];
    current.push(comment);
    commentsByPost.set(comment.post_id, current);
  }
  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const schoolNames = new Map((postSchools ?? []).map((item) => [item.id, item.name]));
  const reactionKinds = new Map((reactions ?? []).map((reaction) => [reaction.post_id, reaction.kind]));
  const myCommentIds = new Set((myComments ?? []).map((comment) => comment.id));
  const likedCommentIds = new Set((likedComments ?? []).map((reaction) => reaction.comment_id));
  const canInteract = Boolean(user && viewerProfile?.status === "active");

  return (
    <div className="community-profile mx-auto space-y-5">
      <Link href="/wall" className="community-profile-back">← Freedom Wall</Link>
      <header className="community-profile-card">
        <div className="community-profile-avatar-ring">
          {avatarUrl ? <img src={avatarUrl} alt="" className="community-profile-avatar" /> :
            <div className="community-profile-avatar community-profile-avatar-fallback">{profile.display_name.slice(0, 1).toUpperCase()}</div>}
        </div>
        <p className="community-profile-kicker">Community profile</p>
        <h1>{profile.display_name}</h1>
        <p className="community-profile-username">@{profile.username}</p>
        {profile.bio && <p className="community-profile-bio">{profile.bio}</p>}
        <div className="community-profile-details">
          <span>{profile.school_name ?? school?.name ?? "Community member"}</span>
          <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
        </div>
        <dl className="community-profile-stats">
          <div><dt>Posts</dt><dd>{postCount ?? posts?.length ?? 0}</dd></div>
          <div><dt>Photos</dt><dd>{profilePhotos.length}</dd></div>
          <div><dt>Member since</dt><dd>{new Date(profile.created_at).getFullYear()}</dd></div>
        </dl>
        <div className="community-profile-actions">
          <Link href="#profile-posts" className="btn-primary">View posts</Link>
          <Link href="/wall" className="community-profile-wall-link">Freedom Wall</Link>
        </div>
      </header>
      <nav className="community-profile-tabs" aria-label="Profile sections">
        <a href="#profile-posts" className="community-profile-tab community-profile-tab-active">Posts</a>
        <a href="#profile-photos" className="community-profile-tab">Photos</a>
      </nav>
      <section id="profile-posts" className="community-profile-posts space-y-3">
        <div className="community-profile-section-heading">
          <h2>Public posts</h2>
          <span>{postCount ?? posts?.length ?? 0}</span>
        </div>
        {!posts?.length && <p className="card text-slate-500">No public posts yet.</p>}
        {(posts ?? []).map((post) => (
          <PostCard
            key={post.id}
            post={{
              ...post,
              avatar_path: post.avatar_path
                ? supabase.storage.from("avatars").getPublicUrl(post.avatar_path).data.publicUrl
                : null,
            }}
            schoolName={post.school_id ? schoolNames.get(post.school_id) ?? profile.school_name ?? school?.name ?? "Community member" : profile.school_name ?? school?.name ?? "Community member"}
            categoryName={post.category_id ? categoryNames.get(post.category_id) ?? "Community" : "Community"}
            imageUrl={post.image_path ? supabase.storage.from("post-images").getPublicUrl(post.image_path).data.publicUrl : null}
            comments={(commentsByPost.get(post.id) ?? []).map((comment) => ({
              ...comment,
              isMine: myCommentIds.has(comment.id),
              liked: likedCommentIds.has(comment.id),
            }))}
            canInteract={canInteract}
            reactionKind={reactionKinds.get(post.id) ?? null}
          />
        ))}
      </section>
      <section id="profile-photos" className="community-profile-gallery-section">
        <div className="community-profile-section-heading">
          <h2>Photos</h2>
          <span>{profilePhotos.length}</span>
        </div>
        {profilePhotos.length ? (
          <div className="community-profile-photo-grid">
            {profilePhotos.map((photo) => (
              <figure className="community-profile-photo" key={photo.id}>
                <img src={photo.imageUrl} alt={photo.caption || "Profile photo"} loading="lazy" />
                {photo.caption && <figcaption>{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : <p className="card text-slate-500">No photos yet.</p>}
      </section>
    </div>
  );
}
