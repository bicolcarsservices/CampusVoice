import Link from "next/link";

export default function AboutPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header><p className="eyebrow">Kanya-kanyang kwento, iisang tambayan</p><h1 className="text-4xl font-extrabold">Tungkol sa KanyaKanyaNa</h1></header>
      <p className="text-lg">Ang KanyaKanyaNa ay campus Freedom Wall kung saan puwedeng magbahagi ng tanong, karanasan, achievements, at mga ganap sa school.</p>
      <p>Piliin kung gagamitin ang public profile mo o magpo-post nang anonymous. Alagaan pa rin ang isa’t isa: igalang ang privacy, huwag mang-target, at i-report ang pagbabanta o harassment.</p>
      <Link className="btn-primary" href="/wall">Silipin ang Freedom Wall</Link>
    </article>
  );
}
