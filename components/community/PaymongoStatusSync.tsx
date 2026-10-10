"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymongoStatusSync({
  intentId,
  autoSync = false,
}: {
  intentId: string;
  autoSync?: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const syncStatus = useCallback(async () => {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/payments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId }),
      });
      const body: {
        status?: string;
        subscriptionStatus?: string;
        providerStatus?: string;
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not refresh payment status.");

      if (body.status === "paid" && body.subscriptionStatus !== "active") {
        setMessage("Payment was received, but the subscription is no longer active. Please contact an administrator.");
      } else if (body.status === "paid" || body.status === "refunded") {
        setMessage(body.status === "paid" ? "Payment confirmed. Your subscription is updated." : "This payment has been refunded.");
      } else if (body.status === "failed") {
        setMessage("PayMongo reports that this payment failed.");
      } else if (body.status === "pending") {
        setMessage("Payment is not confirmed yet. Please wait a moment and refresh again.");
      } else if (body.status === "paid_subscription_inactive") {
        setMessage("Payment was received, but the subscription is no longer active. Please contact an administrator.");
      } else {
        setMessage(`Payment status: ${body.status ?? body.providerStatus ?? "not confirmed"}.`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh payment status.");
    } finally {
      setPending(false);
    }
  }, [intentId, router]);

  useEffect(() => {
    if (autoSync && !started.current) {
      started.current = true;
      void syncStatus();
    }
  }, [autoSync, syncStatus]);

  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost" disabled={pending} onClick={syncStatus}>
        {pending ? "Checking PayMongo..." : "Refresh payment status"}
      </button>
      {message && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
