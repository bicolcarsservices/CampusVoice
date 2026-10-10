import Link from "next/link";
import { redirect } from "next/navigation";
import PostComposer from "@/components/community/PostComposer";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const [{ data: categories, error: categoriesError }, { data: schools, error: schoolsError }] = await Promise.all([
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order"),
    supabase.from("schools").select("id,name").eq("is_active", true).order("name"),
  ]);
  if (categoriesError) throw new Error(`Could not load categories: ${categoriesError.message}`);
  if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <Link href="/wall" className="text-sm font-medium text-brand">← Back to Freedom Wall</Link>
      <div>
        <p className="eyebrow">Share safely and respectfully</p>
        <h1 className="text-3xl font-bold">Create a post</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your daily posting allowance is enforced by the database. Anonymous posts hide your public identity.
        </p>
      </div>
      <PostComposer categories={categories ?? []} schools={schools ?? []} />
    </section>
  );
}
