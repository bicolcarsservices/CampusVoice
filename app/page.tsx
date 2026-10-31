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
          <p className="home-kicker"><span aria-hidden="true" /> CAMPUS HUB, EVERY STORY, EVERY VOICE</p>
          <h1>1, 2, 3, go! <span>Kanya-kanya nang post dito.</span></h1>
          <p className="home-intro">
            Want to ask something, share a story, or vent? Drop it here. You decide whether to post
            with your name or stay anonymous on the public feed.
          </p>
          <div className="home-actions">
            <Link href="/wall" className="home-primary-link">View the wall <span aria-hidden="true">→</span></Link>
            <Link href="/register" className="home-secondary-link">Create an account</Link>
          </div>
          <p className="home-privacy-note">Public anonymity only—community rules and a report button still apply.</p>
        </div>
        <div className="home-headlines" aria-label="KanyaKanyaNa headlines">
          <p className="home-headlines-label">CAMPUS CHIT-CHAT</p>
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
          <p className="home-headlines-foot">Share your story. Respect everyone else.</p>
        </div>
      </section>

      <section className="home-community-strip" aria-label="What you can do">
        <p><span aria-hidden="true">✳</span> Ask without pressure</p>
        <p><span aria-hidden="true">✳</span> Chit-chat around campus</p>
        <p><span aria-hidden="true">✳</span> Choose how you post</p>
      </section>

      <section className="share-campusvoice-card">
        <ShareQrCode />
        <div>
          <p className="eyebrow">Share with your crew</p>
          <h2 className="text-2xl font-bold">Take KanyaKanyaNa anywhere.</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Scan the QR code with your phone camera to open the site.
          </p>
          <a
            href={campusVoicePublicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block break-all text-sm font-semibold text-brand"
          >
            {campusVoicePublicUrl}
          </a>
          <p className="mt-3 text-xs text-slate-500">Save or share the QR code to invite your friends.</p>
        </div>
      </section>

      <section className="home-section" id="how-it-works">
        <div className="home-section-heading">
          <p className="eyebrow">Simple</p>
          <h2 className="text-3xl font-bold">You decide how to join in.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["01", "Pick your campus", "Find the school community that fits you."],
            ["02", "Post what’s on your mind", "Ask questions, share stories, notes, or a quick campus update."],
            ["03", "Choose your visibility", "Use your profile or post anonymously on the public feed."],
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
            <p className="eyebrow">The buzz</p>
            <h2 className="text-3xl font-bold">What’s happening on the wall?</h2>
          </div>
          <Link href="/wall" className="font-semibold text-brand">See all <span aria-hidden="true">→</span></Link>
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
        ) : <p className="card text-slate-600 dark:text-slate-300">No posts yet. Want to be the first one?</p>}
      </section>

      <section className="home-info-grid">
        <div className="home-about-card">
          <p className="eyebrow">For campus life</p>
          <h2 className="text-3xl font-bold">Every story has a place.</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Listen, connect, ask questions, or celebrate the small wins with other students.
          </p>
          <Link href="/about" className="font-semibold text-brand">Learn about KanyaKanyaNa →</Link>
        </div>
        <div className="home-safety-card">
          <p className="eyebrow">Chit-chat with care</p>
          <h3 className="text-xl font-bold">Feel free to share. Harassment is not okay.</h3>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Report harassment, threats, bullying, or exposure of private information. Posts can be
            anonymous on the public feed, but serious safety reports may be reviewed by authorized
            moderators.
          </p>
          <Link href="/guidelines" className="mt-4 inline-block font-semibold text-brand">Read the community rules →</Link>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <p className="eyebrow">Campus communities</p>
          <h2 className="text-3xl font-bold">Find your school community.</h2>
        </div>
        {schools.length ? (
          <div className="flex flex-wrap gap-2">
            {schools.map((school) => <Link className="tag px-4 py-2" key={school.id} href={`/wall?school=${school.id}`}>{school.name}</Link>)}
            <Link href="/schools" className="btn-ghost">All schools</Link>
          </div>
        ) : <Link href="/schools" className="btn-ghost">Browse schools</Link>}
      </section>

      <section id="faq" className="card home-faq">
        <p className="eyebrow">Common questions</p>
        <h2 className="text-2xl font-bold">Before you post</h2>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">Can I post anonymously?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Yes. Your public profile won’t show on anonymous posts. For safety and moderation, the
            platform still keeps an internal account link.
          </p>
        </details>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">How do I report a post or comment?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Use the Report button on the post or comment. It will be reviewed by authorized moderators.
          </p>
        </details>
      </section>

      <section className="home-final-cta">
        <p className="eyebrow">Ready to jump in?</p>
        <h2 className="text-3xl font-bold">Share your story. Keep it respectful.</h2>
        <p>Browse the wall or create an account to post.</p>
        <div className="home-actions">
          <Link href="/wall" className="home-primary-link">Enter the wall <span aria-hidden="true">→</span></Link>
          <Link href="/register" className="home-secondary-link">Create an account</Link>
        </div>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800">
        <span>© {new Date().getFullYear()} KanyaKanyaNa</span>
        <div className="flex gap-4"><Link href="/about">About</Link><Link href="/guidelines">Community rules</Link><Link href="/privacy">Privacy</Link></div>
      </footer>
    </div>
  );
}
