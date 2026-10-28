import Link from "next/link";

export default function Home() {
  return (
    <section className="py-12 text-center sm:py-20">
      <p className="mb-3 text-sm font-semibold text-brand">Kanya-kanyang kwento, iisang tambayan.</p>
      <h1 className="text-4xl font-extrabold sm:text-5xl">1, 2, 3, go! Kanya-kanya nang post dito.</h1>
      <p className="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
        KanyaKanyaNa ay tambayan para sa mga kwento, tanong, notes, at ganap sa campus—ikaw ang
        bahala kung gamit ang profile mo o anonymous sa public feed.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/wall" className="btn-primary">Enter the Freedom Wall</Link>
        <Link href="/register" className="btn-ghost">Create an Account</Link>
      </div>
    </section>
  );
}
