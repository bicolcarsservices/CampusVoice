import Link from "next/link";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import ShareQrCode from "@/components/ShareQrCode";
import { campusVoicePublicUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function Home() {
  let posts: Array<{
    id: string;
    content: string;
    is_anonymous: boolean;
    username: string | null;
    display_name: string | null;
    created_at: string;
  }> = [];
  let schools: Array<{ id: string; name: string }> = [];
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const [{ data: preview, error: postsError }, { data: activeSchools, error: schoolsError }] = await Promise.all([
      supabase.from("public_posts")
        .select("id,content,is_anonymous,username,display_name,created_at")
        .order("created_at", { ascending: false }).limit(3),
      supabase.from("schools").select("id,name").eq("is_active", true).order("name").limit(6),
    ]);
    if (postsError) throw new Error(`Could not load the homepage feed: ${postsError.message}`);
    if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);
    posts = preview ?? [];
    schools = activeSchools ?? [];
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-kicker"><span aria-hidden="true" /> TAMBAYAN NG CAMPUS, KANYA-KANYANG KWENTO</p>
          <h1>1, 2, 3, go! <span>Kanya-kanya nang post dito.</span></h1>
          <p className="home-intro">
            May gustong itanong, ikuwento, o i-rant? I-drop mo lang. Ikaw ang bahala kung pangalan mo
            o anonymous sa public feed.
          </p>
          <div className="home-actions">
            <Link href="/wall" className="home-primary-link">Silipin ang wall <span aria-hidden="true">→</span></Link>
            <Link href="/register" className="home-secondary-link">Gumawa ng account</Link>
          </div>
          <p className="home-privacy-note">Public anonymity lang—may community rules at report button pa rin.</p>
        </div>
        <div className="home-headlines" aria-label="KanyaKanyaNa headlines">
          <p className="home-headlines-label">KANYA-KANYANG CHIKA</p>
          <article className="home-headline-card home-headline-card-peach">
            <span aria-hidden="true">01</span>
            <p>Walang pakialaman, kanya-kanya tayo ng chika.</p>
          </article>
          <article className="home-headline-card home-headline-card-lilac">
            <span aria-hidden="true">02</span>
            <p>Drop your notes and lock in. Kanya-kanya na!</p>
          </article>
          <article className="home-headline-card home-headline-card-green">
            <span aria-hidden="true">03</span>
            <p>Unfiltered, anonymous, at walang bawas-aura. Kanya-kanya na!</p>
          </article>
          <p className="home-headlines-foot">I-share ang kwento. Irespeto ang kapwa.</p>
        </div>
      </section>

      <section className="home-community-strip" aria-label="Mga puwedeng gawin">
        <p><span aria-hidden="true">✳</span> Magtanong nang walang pressure</p>
        <p><span aria-hidden="true">✳</span> Makichika sa campus</p>
        <p><span aria-hidden="true">✳</span> Pumili kung paano mag-post</p>
      </section>

      <section className="share-campusvoice-card">
        <ShareQrCode />
        <div>
          <p className="eyebrow">I-share sa tropa</p>
          <h2 className="text-2xl font-bold">Dalhin ang KanyaKanyaNa kahit saan.</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            I-scan ang QR code gamit ang camera ng phone para buksan ang site.
          </p>
          <a
            href={campusVoicePublicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block break-all text-sm font-semibold text-brand"
          >
            {campusVoicePublicUrl}
          </a>
          <p className="mt-3 text-xs text-slate-500">I-save o i-share ang QR code para maimbitahan ang barkada.</p>
        </div>
      </section>

      <section className="home-section" id="how-it-works">
        <div className="home-section-heading">
          <p className="eyebrow">Simple lang</p>
          <h2 className="text-3xl font-bold">Ikaw ang bahala kung paano makisali.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["01", "Piliin ang campus mo", "Hanapin ang school community na para sa’yo."],
            ["02", "I-post ang nasa isip", "Tanong, kwento, notes, o simpleng ganap lang."],
            ["03", "Ikaw ang pumili", "Gamitin ang profile mo o piliing anonymous sa public feed."],
          ].map(([number, title, description]) => (
            <article key={number} className="home-step-card">
              <span className="home-step-number">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="home-section-heading">
            <p className="eyebrow">Usap-usapan</p>
            <h2 className="text-3xl font-bold">Ano na’ng ganap sa wall?</h2>
          </div>
          <Link href="/wall" className="font-semibold text-brand">Tingnan lahat <span aria-hidden="true">→</span></Link>
        </div>
        {posts.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="card">
                <p className="text-xs font-semibold text-brand">{post.is_anonymous ? "Anonymous" : post.display_name || post.username}</p>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap">{post.content}</p>
                <p className="mt-4 text-xs text-slate-500">
                  {new Date(post.created_at).toLocaleDateString("fil-PH", { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </article>
            ))}
          </div>
        ) : <p className="card text-slate-600 dark:text-slate-300">Wala pang post dito. Ikaw na kaya ang mauna?</p>}
      </section>

      <section className="home-info-grid">
        <div className="home-about-card">
          <p className="eyebrow">Para sa buhay-campus</p>
          <h2 className="text-3xl font-bold">May lugar ang bawat kwento.</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Makinig, makipag-connect, magtanong, o mag-celebrate ng maliliit na panalo kasama ang
            ibang students.
          </p>
          <Link href="/about" className="font-semibold text-brand">Kilalanin ang KanyaKanyaNa →</Link>
        </div>
        <div className="home-safety-card">
          <p className="eyebrow">Chika nang may malasakit</p>
          <h3 className="text-xl font-bold">Malaya kang mag-share. Hindi okay ang manakit.</h3>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            I-report ang harassment, pagbabanta, bullying, o paglalantad ng private information.
            Anonymous sa public feed ang post, pero maaaring i-review ng authorized moderators ang
            seryosong safety reports.
          </p>
          <Link href="/guidelines" className="mt-4 inline-block font-semibold text-brand">Basahin ang community rules →</Link>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <p className="eyebrow">Mga campus</p>
          <h2 className="text-3xl font-bold">Hanapin ang school community mo.</h2>
        </div>
        {schools.length ? (
          <div className="flex flex-wrap gap-2">
            {schools.map((school) => <Link className="tag px-4 py-2" key={school.id} href={`/wall?school=${school.id}`}>{school.name}</Link>)}
            <Link href="/schools" className="btn-ghost">Lahat ng schools</Link>
          </div>
        ) : <Link href="/schools" className="btn-ghost">Tingnan ang mga school</Link>}
      </section>

      <section id="faq" className="card home-faq">
        <p className="eyebrow">Madalas itanong</p>
        <h2 className="text-2xl font-bold">Bago ka mag-post</h2>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">Puwede bang anonymous ang post?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Oo. Hindi ipapakita ang public profile mo sa anonymous post. Para sa safety at moderation,
            may internal account link pa rin ang platform.
          </p>
        </details>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">Paano mag-report ng post o comment?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Gamitin ang Report button sa post o comment. Susuriin ito ng authorized moderators.
          </p>
        </details>
      </section>

      <section className="home-final-cta">
        <p className="eyebrow">Game ka na?</p>
        <h2 className="text-3xl font-bold">Kanya-kanya nang kwento. Sama-sama sa respeto.</h2>
        <p>Silipin ang wall o gumawa ng account para makapag-post.</p>
        <div className="home-actions">
          <Link href="/wall" className="home-primary-link">Pasok sa wall <span aria-hidden="true">→</span></Link>
          <Link href="/register" className="home-secondary-link">Gumawa ng account</Link>
        </div>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800">
        <span>© {new Date().getFullYear()} KanyaKanyaNa</span>
        <div className="flex gap-4"><Link href="/about">Tungkol</Link><Link href="/guidelines">Community rules</Link><Link href="/privacy">Privacy</Link></div>
      </footer>
    </div>
  );
}
