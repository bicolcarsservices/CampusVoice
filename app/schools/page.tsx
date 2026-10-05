import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const { data: schools, error } = await createClient().from("school_stats")
    .select("id,name,location,description,logo_path,user_count,post_count").order("name");
  if (error) throw new Error(`Could not load schools: ${error.message}`);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="max-w-2xl"><p className="eyebrow">Across campuses</p><h1 className="text-4xl font-extrabold">Schools in the community</h1><p className="mt-3 text-slate-600 dark:text-slate-300">Explore posts and conversations from participating schools.</p></header>
      {!schools?.length && <p className="card text-slate-500">No active schools are listed yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(schools ?? []).map((school) => (
          <article className="card" key={school.id}>
            {school.logo_path ? <img src={school.logo_path} alt="" className="mb-4 h-14 w-14 rounded-xl object-cover" /> : <div className="avatar-fallback mb-4">CV</div>}
            <h2 className="text-xl font-bold">{school.name}</h2>
            {school.location && <p className="mt-1 text-sm text-slate-500">{school.location}</p>}
            {school.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{school.description}</p>}
            <p className="mt-4 text-xs text-slate-500">{school.user_count} members · {school.post_count} posts</p>
            <Link href={`/wall?school=${school.id}`} className="mt-4 inline-flex font-semibold text-brand">Explore school posts →</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
