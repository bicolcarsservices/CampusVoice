import Link from "next/link";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

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
  let announcements: Array<{ id: string; title: string; body: string }> = [];

  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const [{ data: preview, error: postsError }, { data: activeSchools, error: schoolsError },
      { data: activeAnnouncements, error: announcementsError }] = await Promise.all([
      supabase.from("public_posts")
        .select("id,content,is_anonymous,username,display_name,created_at")
        .order("created_at", { ascending: false }).limit(3),
      supabase.from("schools").select("id,name").eq("is_active", true).order("name").limit(6),
      supabase.from("announcements").select("id,title,body").eq("is_published", true).order("created_at", { ascending: false }).limit(3),
    ]);
    if (postsError) throw new Error(`Could not load the homepage feed: ${postsError.message}`);
    if (schoolsError) throw new Error(`Could not load schools: ${schoolsError.message}`);
    if (announcementsError) throw new Error(`Could not load announcements: ${announcementsError.message}`);
    posts = preview ?? [];
    schools = activeSchools ?? [];
    announcements = activeAnnouncements ?? [];
  }

  return (
    <div className="space-y-20 pb-12">
      {!!announcements.length && (
        <section aria-label="CampusVoice announcements" className="space-y-3">
          {announcements.map((announcement) => (
            <article key={announcement.id} className="card border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
              <p className="eyebrow">Announcement</p>
              <h2 className="font-bold">{announcement.title}</h2>
              <p className="mt-1 text-sm">{announcement.body}</p>
            </article>
          ))}
        </section>
      )}
      <section className="grid items-center gap-10 py-10 sm:py-16 md:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="eyebrow">Your Voice. Your Space. Your Story.</p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Say what you feel. <span className="text-brand">Share what you think.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            CampusVoice is a space where students and communities can share thoughts, stories,
            experiences, opinions, and rants — anonymously or with their identity.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/wall" className="btn-primary">Enter the Freedom Wall</Link>
            <Link href="/register" className="btn-ghost">Create an account</Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">A community for every campus. Built around expression, privacy, and respect.</p>
        </div>
        <div className="card space-y-3 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <div><p className="eyebrow">A little space to speak up</p><h2 className="text-xl font-bold">Campus conversations</h2></div>
            <span aria-hidden="true" className="text-3xl">✦</span>
          </div>
          {[
            ["A question", "What’s one thing you wish you knew before your first year?"],
            ["A reminder", "You don’t have to have everything figured out today."],
            ["A community", "Listen with care. Share with respect."],
          ].map(([label, text]) => (
            <div key={label} className="rounded-xl border border-violet-100 bg-white/80 p-4 dark:border-violet-900 dark:bg-slate-900/70">
              <span className="tag">{label}</span><p className="mt-2 font-medium">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="space-y-6">
        <div className="max-w-2xl"><p className="eyebrow">How it works</p><h2 className="text-3xl font-bold">Find your voice, your way.</h2></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["01", "Join your community", "Create an account and choose your school."],
            ["02", "Share what matters", "Write a thought, ask a question, or celebrate a win."],
            ["03", "Choose your identity", "Post with your name or keep your public identity private."],
          ].map(([number, title, description]) => (
            <article key={number} className="card">
              <span className="text-sm font-bold text-brand">{number}</span>
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">From the community</p><h2 className="text-3xl font-bold">Freedom Wall preview</h2></div>
          <Link href="/wall" className="font-semibold text-brand">Explore the wall →</Link>
        </div>
        {posts.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="card">
                <p className="text-xs font-semibold text-brand">{post.is_anonymous ? "Anonymous" : post.display_name || post.username}</p>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap">{post.content}</p>
                <p className="mt-4 text-xs text-slate-500">{new Date(post.created_at).toLocaleDateString()}</p>
              </article>
            ))}
          </div>
        ) : <p className="card text-slate-600 dark:text-slate-300">The wall is ready for your community’s first stories.</p>}
      </section>

      <section className="grid gap-10 md:grid-cols-2">
        <div className="space-y-4">
          <p className="eyebrow">Made for campus life</p>
          <h2 className="text-3xl font-bold">A place to listen, connect, and grow.</h2>
          <p className="text-slate-600 dark:text-slate-300">Share experiences, get perspective, celebrate small wins, and connect across schools.</p>
          <Link href="/about" className="font-semibold text-brand">Learn about CampusVoice →</Link>
        </div>
        <div className="card border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
          <p className="eyebrow">Community safety</p>
          <h3 className="text-xl font-bold">Freedom of expression does not mean freedom to harm others.</h3>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Report threats, harassment, bullying, or private information. Anonymous posting hides your public identity, but serious safety issues may be investigated by authorized administrators.</p>
          <Link href="/guidelines" className="mt-4 inline-block font-semibold text-brand">Read the Community Guidelines →</Link>
        </div>
      </section>

      <section className="space-y-5">
        <div><p className="eyebrow">Across campuses</p><h2 className="text-3xl font-bold">Your school, your community.</h2></div>
        {schools.length ? (
          <div className="flex flex-wrap gap-2">
            {schools.map((school) => <Link className="tag px-4 py-2" key={school.id} href={`/wall?school=${school.id}`}>{school.name}</Link>)}
            <Link href="/schools" className="btn-ghost">Browse schools</Link>
          </div>
        ) : <Link href="/schools" className="btn-ghost">Explore participating schools</Link>}
      </section>

      <section id="faq" className="card">
        <p className="eyebrow">FAQ</p>
        <h2 className="text-2xl font-bold">A few things to know</h2>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">Can I post anonymously?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Yes. Your public profile is hidden on anonymous posts. The platform retains an internal account link for safety and moderation investigations.</p>
        </details>
        <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer font-semibold">How do I report harmful content?</summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use Report on a post or comment. Reports go to authorized moderators for review.</p>
        </details>
      </section>

      <section className="rounded-3xl bg-violet-700 px-6 py-10 text-center text-white sm:px-10">
        <h2 className="text-3xl font-bold">Your story belongs here.</h2>
        <p className="mx-auto mt-2 max-w-xl text-violet-100">Join the conversation, share something meaningful, and help build a better campus community.</p>
        <Link href="/register" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-violet-800">Get started</Link>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800">
        <span>© {new Date().getFullYear()} CampusVoice</span>
        <div className="flex gap-4"><Link href="/about">About</Link><Link href="/guidelines">Guidelines</Link><Link href="/privacy">Privacy</Link></div>
      </footer>
    </div>
  );
}
