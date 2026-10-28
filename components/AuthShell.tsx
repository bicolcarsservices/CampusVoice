import type { ReactNode } from "react";

export default function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="auth-screen">
      <header className="auth-hero">
        <img className="auth-mark auth-mark-image" src="/kanyakanyana-mark.svg" alt="KanyaKanyaNa logo" />
        <p className="auth-kicker">KANYA-KANYANG KWENTO, IISANG TAMBAYAN</p>
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
