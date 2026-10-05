import Link from "next/link";

export default function Home() {
  return (
    <section className="py-12 text-center sm:py-20">
      <p className="mb-3 text-sm font-semibold text-brand">Your Voice. Your Space. Your Story.</p>
      <h1 className="text-4xl font-extrabold sm:text-5xl">Say What You Feel. Share What You Think.</h1>
      <p className="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
        CampusVoice is a space where students and communities can share their thoughts, stories,
        experiences, opinions, and rants, anonymously or with their identity.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/wall" className="btn-primary">Enter the Freedom Wall</Link>
        <Link href="/register" className="btn-ghost">Create an Account</Link>
      </div>
    </section>
  );
}
