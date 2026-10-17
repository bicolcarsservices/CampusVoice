import type { ReactNode } from "react";

export default function AuthShell({
  title,
  description,
  children,
  footer,
  heroLogoUrl,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  heroLogoUrl?: string;
}) {
  const resolvedHeroLogoUrl = heroLogoUrl || "/campusvoice-logo.jpg";

  return (
    <section className="auth-screen">
      <header className="auth-hero">
        <img className="auth-mark auth-mark-image" src={resolvedHeroLogoUrl} alt="CampusVoice logo" />
        <p className="auth-kicker">YOUR VOICE. YOUR SPACE.</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="auth-panel">
        {children}
      </div>
      <footer className="auth-footer">{footer}</footer>
    </section>
  );
}
