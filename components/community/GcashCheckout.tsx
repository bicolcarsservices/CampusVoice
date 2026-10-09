"use client";

import { useState } from "react";

type Props = { planId: string; planName: string };

export default function GcashCheckout({ planId, planName }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/checkout/gcash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const body: { redirectUrl?: string; error?: string } = await response.json();
      if (!response.ok || !body.redirectUrl) {
        throw new Error(body.error ?? "Could not start GCash checkout. Please try again.");
      }

      const destination = new URL(body.redirectUrl);
      if (destination.protocol !== "https:") {
        throw new Error("PayMongo returned an invalid checkout link.");
      }
      window.location.assign(destination.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start GCash checkout. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button type="button" onClick={startCheckout} disabled={pending} className="btn-primary w-full">
        {pending ? "Opening GCash..." : `Pay for ${planName} with GCash`}
      </button>
      {error && <p role="alert" className="text-left text-sm text-red-700">{error}</p>}
    </div>
  );
}
