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
    <section className="post-composer-page">
      <PostComposer categories={categories ?? []} schools={schools ?? []} />
    </section>
  );
}
