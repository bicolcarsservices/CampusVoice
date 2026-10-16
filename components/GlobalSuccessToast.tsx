"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type SuccessNotice = { message: string };

export default function GlobalSuccessToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const registered = searchParams.get("registered") === "1";
  const [toast, setToast] = useState<SuccessNotice | null>(null);

  useEffect(() => {
    const id = notice === "login" ? `${pathname}:login` :
      notice === "registered" || registered ? `${pathname}:registered` : null;
    if (!id) return;

    setToast({
      message: id.endsWith(":login")
        ? "You’re logged in successfully."
        : "Your account was created successfully. Check your email if confirmation is required.",
    });
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("notice");
    cleanUrl.searchParams.delete("registered");
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, [notice, pathname, registered]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="success-toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span>
      <p className="flex-1 text-sm font-semibold">{toast.message}</p>
      <button type="button" className="success-toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
    </div>
  );
}
