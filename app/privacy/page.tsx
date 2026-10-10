export const metadata = { title: "Privacy Policy | CampusVoice" };

export default function PrivacyPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">Your data matters</p>
        <h1 className="text-4xl font-extrabold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">How CampusVoice handles information when you use the service.</p>
      </header>
      <section>
        <h2 className="text-xl font-bold">Information we handle</h2>
        <p>CampusVoice processes account details such as your email address, username, profile information, and authentication identifiers. We also store content and activity you submit, including posts, comments, reactions, reports, school details, and moderation records.</p>
        <p>When you use plans or wallet features, related records may include subscription status, payment references, top-up or withdrawal requests, and payout information you choose to submit. Game records may include Dias and inventory, locally held game progress, conversion requests, and cashout requests.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">How information is used</h2>
        <p>Information is used to provide accounts and community features, display profiles and posts, enforce plan limits, administer payments and game requests, prevent abuse, respond to reports, and maintain service security. Supabase provides authentication and database services. Payment instructions may direct you to third-party payment services; CampusVoice does not receive your payment-provider password.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Public and anonymous posts</h2>
        <p>Public posts, comments, reactions, and profile details you choose to publish can be visible to other visitors. Anonymous posting hides your profile identity in the public feed, but the post remains linked to your account internally. Authorized administrators may access that link for moderation, safety, or security purposes.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Access and sharing</h2>
        <p>Authorized administrators can access information needed to moderate the community, review subscription and wallet requests, and investigate abuse. We do not display submitted payout account details publicly. Information may also be processed by service providers that host or operate features you use, or disclosed when necessary to protect users, enforce these policies, or meet legal obligations.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Retention and security</h2>
        <p>We retain records while they are needed to operate the service, maintain safety and financial records, or meet applicable obligations. Access controls and database policies are used to protect information, but no online service can promise absolute security. Do not include passwords, financial credentials, or sensitive personal information in public posts or payment-reference fields.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Your choices</h2>
        <p>You can choose what profile details and content to publish and whether to post anonymously. You may stop using the service at any time. Some records may remain available to administrators where needed for moderation, transaction history, or service integrity.</p>
      </section>
      <p className="text-sm text-slate-500">This policy describes current CampusVoice features and may be updated as the service changes. The operator should review it for the project’s actual practices and applicable requirements.</p>
    </article>
  );
}
