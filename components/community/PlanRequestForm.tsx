"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createSubscriptionRequest } from "@/server/community-actions";
import MayaQrCode from "@/components/community/MayaQrCode";

function RequestButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Submitting payment..." : "I have paid — submit for verification"}</button>;
}

export default function PlanRequestForm({
  planId,
  planName,
  pricePhp,
}: {
  planId: string;
  planName: string;
  pricePhp: number;
}) {
  const [showPayment, setShowPayment] = useState(false);
  const [state, action] = useFormState(createSubscriptionRequest, null);
  const paymentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (showPayment) paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [showPayment]);

  if (state?.success) {
    return <p role="status" className="mt-4 text-sm text-green-700">{state.success}</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {!showPayment ? (
        <button type="button" onClick={() => setShowPayment(true)} className="btn-primary w-full">
          Continue to Maya payment
        </button>
      ) : (
        <section ref={paymentRef} className="space-y-3">
          <div className="space-y-2">
            <p className="text-left text-sm font-semibold">Pay for {planName} with Maya</p>
            <p className="text-left text-sm">Amount to send: <strong>₱{pricePhp.toLocaleString("en-PH")}</strong></p>
            <MayaQrCode />
            <p className="text-left text-xs text-slate-500">
              Scan the QR in Maya and send the exact amount. Payment is not detected automatically; your plan activates after an administrator confirms the payment.
            </p>
          </div>
          <form action={action} className="space-y-2">
            <input type="hidden" name="plan_id" value={planId} />
            <label className="block text-left text-xs text-slate-500">
              Maya payment reference or sender name
              <input name="payment_reference" required maxLength={100} className="input mt-1" placeholder="Enter the reference number or sender name" />
            </label>
            {state?.error && <p role="alert" className="text-left text-sm text-red-700">{state.error}</p>}
            <RequestButton />
          </form>
          <button type="button" onClick={() => setShowPayment(false)} className="btn-ghost w-full">
            Back to plans
          </button>
        </section>
      )}
    </div>
  );
}
