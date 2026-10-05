import Link from "next/link";

export default function AboutPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header><p className="eyebrow">Your Voice. Your Space. Your Story.</p><h1 className="text-4xl font-extrabold">About CampusVoice</h1></header>
      <p className="text-lg">CampusVoice is a school and community Freedom Wall for sharing thoughts, questions, experiences, achievements, and everyday campus stories.</p>
      <p>Choose whether to share through your public profile or anonymously. Either way, help keep the space safe: respect privacy, avoid targeting others, and report threats or harassment.</p>
      <Link className="btn-primary" href="/wall">Visit the Freedom Wall</Link>
    </article>
  );
}
