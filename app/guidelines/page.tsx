export default function GuidelinesPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header><p className="eyebrow">Community first</p><h1 className="text-4xl font-extrabold">Community Guidelines</h1><p className="mt-3 text-lg">Freedom of expression does not mean freedom to harm others.</p></header>
      <section><h2 className="text-xl font-bold">Share with care</h2><p>CampusVoice is a place for honest stories, questions, opinions, and school experiences. Critique ideas and systems without targeting or endangering people.</p></section>
      <section><h2 className="text-xl font-bold">Not allowed</h2><ul className="list-disc space-y-2 pl-6"><li>Threats, bullying, harassment, or hate speech</li><li>Doxxing or sharing another person’s private information</li><li>Sexual exploitation or sexual content involving minors</li><li>Impersonation, spam, scams, or illegal content</li><li>Content that targets, exploits, or endangers minors</li></ul></section>
      <section><h2 className="text-xl font-bold">Report harmful content</h2><p>Use the Report option on a post or comment and choose the closest reason. Reports are reviewed by authorized moderators. Do not repost harmful content to call attention to it.</p></section>
      <section><h2 className="text-xl font-bold">Anonymous posting</h2><p>Anonymous posts hide your public identity, but they are still linked to your account internally. Authorized administrators may investigate that identity when needed for serious safety violations or security investigations.</p></section>
    </article>
  );
}
