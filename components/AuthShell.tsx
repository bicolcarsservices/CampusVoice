import type { ReactNode } from "react";

export default function AuthShell({
  title,
  description,
  children,
  footer,
  heroLogoUrl,
  formLogoUrl,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  heroLogoUrl?: string;
  formLogoUrl?: string;
}) {
  return (
    <section className="auth-screen">
      <header className="auth-hero">
        {heroLogoUrl
          ? <img className="auth-mark auth-mark-image" src={heroLogoUrl} alt="CampusVoice logo" />
          : <span className="auth-mark" aria-hidden="true">+</span>}
        <p className="auth-kicker">YOUR VOICE. YOUR SPACE.</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="auth-panel">
        {formLogoUrl && <img className="auth-form-logo" src={formLogoUrl} alt="CampusVoice logo" />}
        {children}
      </div>
      <footer className="auth-footer">{footer}</footer>
    </section>
  );
}
