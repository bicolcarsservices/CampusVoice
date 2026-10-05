import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import Link from "next/link";
import PostCard from "@/components/community/PostCard";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  sort?: string;
  school?: string;
  category?: string;
  page?: string;
};

export default async function Wall({ searchParams }: { searchParams?: SearchParams }) {
  if (!hasSupabaseConfig()) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Freedom Wall</h1>
        <p className="text-slate-500">Connect Supabase in .env.local to enable the wall.</p>
      </div>
    );
  }

  const supabase = createClient();
  const q = (searchParams?.q ?? "").trim().slice(0, 80);
  const sort = ["popular", "discussed"].includes(searchParams?.sort ?? "") ? searchParams?.sort : "latest";
  const schoolId = searchParams?.school;
  const categoryId = searchParams?.category;
  const parsedPage = Number(searchParams?.page ?? 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1000) : 1;
  const from = (page - 1) * 20;
  const to = from + 19;

  let postsQuery = supabase
    .from("public_posts")
    .select("id,created_at,content,image_path,school_id,category_id,reaction_count,comment_count,is_anonymous,username,display_name,avatar_path")
    .order(sort === "popular" ? "reaction_count" : sort === "discussed" ? "comment_count" : "created_at", { ascending: false })
    .range(from, to);
  if (q) postsQuery = postsQuery.ilike("content", `%${q}%`);
  if (schoolId) postsQuery = postsQuery.eq("school_id", schoolId);
  if (categoryId) postsQuery = postsQuery.eq("category_id", categoryId);

  const [{ data: posts, error: postsError }, { data: schools, error: schoolsError },
    { data: categories, error: categoriesError }, { data: { user } }] = await Promise.all([
    postsQuery,
    supabase.from("schools").select("id,name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order"),
    supabase.auth.getUser(),
  ]);
  if (postsError) throw new Error(`Could not load Freedom Wall posts: ${postsError.message}`);
  if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);
  if (categoriesError) throw new Error(`Could not load categories: ${categoriesError.message}`);

  const postRows = posts ?? [];
  const postIds = postRows.map((post) => post.id);
  const [{ data: comments, error: commentsError }, { data: likedRows, error: reactionsError },
    { data: myComments, error: myCommentsError }] = postIds.length
    ? await Promise.all([
      supabase.from("comments").select("id,post_id,parent_id,content,reaction_count,created_at").in("post_id", postIds)
        .eq("status", "approved").order("created_at", { ascending: true }),
      user
        ? supabase.from("reactions").select("post_id").eq("user_id", user.id).in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
      user
        ? supabase.from("my_comment_ids").select("id").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (commentsError) throw new Error(`Could not load comments: ${commentsError.message}`);
  if (reactionsError) throw new Error(`Could not load your reactions: ${reactionsError.message}`);
  if (myCommentsError) throw new Error(`Could not load your comment permissions: ${myCommentsError.message}`);
  const commentsByPost = new Map<string, typeof comments>();
  for (const comment of comments ?? []) {
    const current = commentsByPost.get(comment.post_id) ?? [];
    current.push(comment);
    commentsByPost.set(comment.post_id, current);
  }
  const schoolNames = new Map((schools ?? []).map((school) => [school.id, school.name]));
  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const likedIds = new Set((likedRows ?? []).map((row) => row.post_id));
  const myCommentIds = new Set((myComments ?? []).map((row) => row.id));
  const commentIds = (comments ?? []).map((comment) => comment.id);
  const { data: likedComments, error: likedCommentsError } = user && commentIds.length
    ? await supabase.from("reactions").select("comment_id").eq("user_id", user.id).in("comment_id", commentIds)
    : { data: [], error: null };
  if (likedCommentsError) throw new Error(`Could not load your comment reactions: ${likedCommentsError.message}`);
  const likedCommentIds = new Set((likedComments ?? []).map((row) => row.comment_id));
  const createClientData = user
    ? await supabase.from("profiles").select("id,status").eq("id", user.id).maybeSingle()
    : { data: null, error: null };
  if (createClientData.error) throw new Error(`Could not verify your account: ${createClientData.error.message}`);
  const canInteract = Boolean(user && createClientData.data?.status === "active");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Your community feed</p>
          <h1 className="text-3xl font-bold">Freedom Wall</h1>
        </div>
        {canInteract && <Link href="/wall/new" className="btn-primary">Create post</Link>}
      </header>
      <form className="card grid gap-3 sm:grid-cols-2" action="/wall">
        <label className="text-sm sm:col-span-2">
          Search posts
          <input name="q" defaultValue={q} maxLength={80} className="input mt-1" placeholder="Search the wall..." />
        </label>
        <label className="text-sm">
          Sort by
          <select name="sort" defaultValue={sort} className="input mt-1">
            <option value="latest">Latest</option>
            <option value="popular">Popular</option>
            <option value="discussed">Most discussed</option>
          </select>
        </label>
        <label className="text-sm">
          School
          <select name="school" defaultValue={schoolId ?? ""} className="input mt-1">
            <option value="">All schools</option>
            {(schools ?? []).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Category
          <select name="category" defaultValue={categoryId ?? ""} className="input mt-1">
            <option value="">All categories</option>
            {(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <button className="btn-ghost self-end" type="submit">Apply filters</button>
      </form>

      {postRows.length === 0 && (
        <section className="card text-center">
          <h2 className="text-lg font-semibold">{q ? "No matching posts" : "No posts yet"}</h2>
          <p className="mt-1 text-sm text-slate-500">{q ? "Try another search or filter." : "Be the first to share with the community."}</p>
          {canInteract && <Link className="btn-primary mt-4" href="/wall/new">Create a post</Link>}
        </section>
      )}

      {postRows.map((post) => {
        const imageUrl = post.image_path
          ? supabase.storage.from("post-images").getPublicUrl(post.image_path).data.publicUrl
          : null;
        const avatarUrl = post.avatar_path
          ? supabase.storage.from("avatars").getPublicUrl(post.avatar_path).data.publicUrl
          : null;
        return (
          <PostCard
            key={post.id}
            post={{ ...post, avatar_path: avatarUrl }}
            schoolName={post.school_id ? schoolNames.get(post.school_id) ?? "CampusVoice" : "CampusVoice"}
            categoryName={post.category_id ? categoryNames.get(post.category_id) ?? "Community" : "Community"}
            imageUrl={imageUrl}
            comments={(commentsByPost.get(post.id) ?? []).map((comment) => ({
              ...comment,
              isMine: myCommentIds.has(comment.id),
              liked: likedCommentIds.has(comment.id),
            }))}
            canInteract={canInteract}
            liked={likedIds.has(post.id)}
          />
        );
      })}

      <nav aria-label="Feed pages" className="flex items-center justify-between">
        {page > 1 ? (
          <Link className="btn-ghost" href={buildPageUrl(searchParams, page - 1)}>← Newer</Link>
        ) : <span />}
        {postRows.length === 20 && (
          <Link className="btn-ghost" href={buildPageUrl(searchParams, page + 1)}>Older →</Link>
        )}
      </nav>
    </div>
  );
}

function buildPageUrl(searchParams: SearchParams | undefined, page: number) {
  const params = new URLSearchParams();
  for (const key of ["q", "sort", "school", "category"] as const) {
    const value = searchParams?.[key];
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/wall?${params.toString()}`;
}
