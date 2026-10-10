import Link from "next/link";

export const metadata = { title: "Terms of Use | CampusVoice" };

export default function TermsPage() {
  return (
    <article className="prose-card mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">A respectful community</p>
        <h1 className="text-4xl font-extrabold">Terms of Use</h1>
        <p className="mt-2 text-sm text-slate-500">Rules for using CampusVoice and its community, plan, wallet, and game features.</p>
      </header>
      <section>
        <h2 className="text-xl font-bold">Using CampusVoice</h2>
        <p>Use an account you control, keep your sign-in credentials private, and provide accurate information for account, payment, or payout requests. You are responsible for activity performed through your account. Do not attempt to bypass access controls, interfere with the service, or exploit bugs.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Community content</h2>
        <p>You retain responsibility for content you submit and must have the right to share it. Do not post threats, harassment, hate, scams, spam, private information, or content that violates another person’s rights. Follow the <Link className="text-action" href="/guidelines">Community Guidelines</Link>. Content can be reported, hidden, or removed, and accounts may be restricted when needed to protect the community.</p>
        <p>Anonymous posting hides your identity from the public post display, not from authorized administrators or the service.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Plans and trials</h2>
        <p>Plan features, prices, and durations are shown on the Plans page and may change for future purchases. Unless explicitly stated otherwise, plans do not renew automatically. A payment request is not an active subscription until payment has been reviewed and confirmed. Eligible accounts may start one free 2-day Basic or Premium trial. A trial ends automatically and does not automatically charge or convert into a paid plan. Account eligibility and trial use are enforced by CampusVoice records.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Wallet, games, and rewards</h2>
        <p>Wallet top-ups, Dias, game earnings, and conversion or payout requests are separate balances or processes. Game earnings and payout requests may require manual review and approval. A displayed game balance or submitted request is not a guarantee of a cash payout. Reward conversions and withdrawals are subject to the rates, eligibility requirements, review steps, and deductions shown in the relevant feature. Do not manipulate game data or submit false transaction details.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Availability and changes</h2>
        <p>CampusVoice is provided as an evolving service. Features may be changed, paused, or discontinued, and access may be limited for maintenance, security, or policy enforcement. We will make reasonable efforts to preserve accurate account and transaction records, but uninterrupted availability is not guaranteed.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Contact and updates</h2>
        <p>These terms should be read together with the <Link className="text-action" href="/privacy">Privacy Policy</Link> and <Link className="text-action" href="/guidelines">Community Guidelines</Link>. The operator may update these terms when product features or requirements change. Continued use after an update means you accept the revised terms.</p>
      </section>
      <p className="text-sm text-slate-500">These terms are a product-use summary, not legal advice. The service operator should review them against actual operations and applicable law.</p>
    </article>
  );
}
