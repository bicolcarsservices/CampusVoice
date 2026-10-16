"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApprovalNotification = { id: string; message: string; link: string | null };

export default function SubscriptionApprovalToast({ enabled = true }: { enabled?: boolean }) {
  const [pending, setPending] = useState<ApprovalNotification[]>([]);
  const [toast, setToast] = useState<ApprovalNotification | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let timeout: number | undefined;
    const checkForApproval = async () => {
      try {
        const response = await fetch("/api/notifications/subscription-approval", { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not check subscription approval: ${response.status}`);
        const result = await response.json() as { notification: ApprovalNotification | null };
        const notification = result.notification;
        if (!disposed && notification) {
          setPending((current) => current.some((item) => item.id === notification.id)
            ? current
            : [...current, notification]);
        }
      } catch (error) {
        if (!disposed) console.error("Could not check for subscription approval notifications.", error);
      } finally {
        if (!disposed) timeout = window.setTimeout(checkForApproval, 15000);
      }
    };

    void checkForApproval();
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [enabled]);

  useEffect(() => {
    if (toast || !pending.length) return;
    setToast(pending[0]);
    setPending((current) => current.slice(1));
  }, [pending, toast]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="success-toast success-toast--approval" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span>
      <div className="flex-1 text-sm">
        <p className="font-bold">Payment approved!</p>
        <p>{toast.message}</p>
        {toast.link && <Link href={toast.link} className="mt-1 inline-block font-semibold underline">View plan</Link>}
      </div>
      <button type="button" className="success-toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
    </div>
  );
}
