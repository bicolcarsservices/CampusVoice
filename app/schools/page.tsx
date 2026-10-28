import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const supabase = createClient();
  const { data: schools, error } = await supabase.from("school_stats")
    .select("id,name,location,description,logo_path,user_count,post_count").order("name");
  if (error) throw new Error(`Could not load schools: ${error.message}`);

  return (
    <div className="school-directory">
      <header className="school-directory-hero">
        <div className="school-hero-orbit school-hero-orbit-one" aria-hidden="true" />
        <div className="school-hero-orbit school-hero-orbit-two" aria-hidden="true" />
        <div className="relative z-10 max-w-2xl">
          <p className="school-directory-kicker">A community for every campus</p>
          <h1>Find your school.<br /><span>Find your people.</span></h1>
          <p>Explore the campuses sharing stories, ideas, and everyday student life on KanyaKanyaNa.</p>
          <div className="school-directory-count">
            <span className="school-count-icon" aria-hidden="true">⌂</span>
            <strong>{schools?.length ?? 0}</strong>
            <span>campuses in our community</span>
          </div>
        </div>
        <div className="school-hero-emblem" aria-hidden="true">
          <span>KK</span><i /><b /><em />
        </div>
      </header>

      <section className="school-directory-section" aria-labelledby="school-list-title">
        <div className="school-directory-section-heading">
          <div>
            <p className="school-directory-kicker">Explore campuses</p>
            <h2 id="school-list-title">Schools in the community</h2>
          </div>
          <span className="school-section-caption">Discover what's happening on campus</span>
        </div>

        {!schools?.length && (
          <p className="school-directory-empty">No active schools are listed yet. Please check back soon.</p>
        )}
        <div className="school-directory-grid">
          {(schools ?? []).map((school, index) => {
            const logoUrl = publicStorageUrl(supabase, "school-logos", school.logo_path);
            return (
              <article className="school-directory-card" key={school.id}>
                <div className={`school-card-cover school-card-cover-${index % 4}`}>
                  <div className="school-card-cover-pattern" aria-hidden="true" />
                  <span className="school-card-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="school-card-logo">
                    {logoUrl
                      ? <img src={logoUrl} alt={`${school.name} logo`} />
                      : <span aria-hidden="true">{school.name.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <span className="school-card-status"><i /> Active campus</span>
                </div>
                <div className="school-card-content">
                  <h3>{school.name}</h3>
                  {school.location && <p className="school-card-location"><span aria-hidden="true">⌖</span>{school.location}</p>}
                  {school.description && <p className="school-card-description">{school.description}</p>}
                  <div className="school-card-stats">
                    <span><strong>{school.user_count}</strong> members</span>
                    <span><strong>{school.post_count}</strong> posts</span>
                  </div>
                  <Link href={`/wall?school=${school.id}`} className="school-card-link">
                    Explore campus <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
