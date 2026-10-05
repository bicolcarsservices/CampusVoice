export default function PrivacyPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header><p className="eyebrow">Your data matters</p><h1 className="text-4xl font-extrabold">Privacy at CampusVoice</h1></header>
      <section><h2 className="text-xl font-bold">Account information</h2><p>CampusVoice uses Supabase Auth for account credentials. Passwords are handled by the authentication provider and are not stored as plain text by this application. Profile information is protected by database access policies.</p></section>
      <section><h2 className="text-xl font-bold">Anonymous posts</h2><p>When you post anonymously, your username, display name, and avatar are hidden in the public feed. Your account remains linked to the post internally. Access to that link is restricted to authorized administrators and intended only for serious safety or security investigations.</p></section>
      <section><h2 className="text-xl font-bold">Reports and moderation</h2><p>Reports are visible to the reporting account and authorized moderators. Moderation actions may be logged to support accountability and platform safety.</p></section>
      <section><h2 className="text-xl font-bold">Keep personal information private</h2><p>Do not publish passwords, email addresses, phone numbers, home addresses, or private information about other people. Report content that exposes personal information.</p></section>
      <p className="text-sm text-slate-500">CampusVoice is a school project. Before public deployment, publish a complete privacy policy appropriate to the project’s actual data practices and applicable law.</p>
    </article>
  );
}
