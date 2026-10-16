"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function FloatingModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [router]);

  return (
    <div className="floating-modal-backdrop">
      <button type="button" className="floating-modal-dismiss" aria-label="Close window" onClick={() => router.back()} />
      <section
        className="floating-modal"
        role="dialog"
        aria-modal="true"
        aria-label="CampusVoice window"
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const anchor = event.target.closest("a[href]");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          const destination = new URL(anchor.href, window.location.href);
          const isModalRoute = /^\/(subscription|login|register|profile)(\/|$)/.test(destination.pathname);
          if (destination.origin === window.location.origin && !isModalRoute) {
            event.preventDefault();
            window.location.assign(destination.href);
          }
        }}
      >
        <button type="button" className="floating-modal-close" aria-label="Close window" onClick={() => router.back()}>
          <span aria-hidden="true">×</span>
        </button>
        <div className="floating-modal-content">{children}</div>
      </section>
    </div>
  );
}
