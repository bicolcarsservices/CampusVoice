"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  description = "",
  pricePhp,
  durationDays = null,
  dailyPostLimit = null,
  features = [],
}: {
  planId: string;
  planName: string;
  description?: string | null;
  pricePhp: number;
  durationDays?: number | null;
  dailyPostLimit?: number | null;
  features?: string[];
}) {
  const [step, setStep] = useState<"closed" | "details" | "payment">("closed");
  const [portalReady, setPortalReady] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [state, action] = useFormState(createSubscriptionRequest, null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  return (
    <div className="mt-4 space-y-3">
      <button type="button" onClick={() => setStep(state?.success ? "payment" : "details")} className="btn-primary w-full">
        {state?.success ? "View payment status" : "Get Plan"}
      </button>
      {portalReady && step !== "closed" && createPortal(
        <div className="plan-detail-backdrop">
          <section className={`plan-detail-window${step === "details" ? " plan-detail-window-selected" : " plan-detail-window-payment"}`} role="dialog" aria-modal="true" aria-labelledby={`plan-title-${planId}`}>
            <div className="plan-detail-topbar">
              <button type="button" onClick={() => setStep(step === "payment" ? "details" : "closed")} className="plan-detail-back">
                <span aria-hidden="true">←</span>
                {step === "payment" ? "Plan details" : "All plans"}
              </button>
              <span className="plan-detail-step">{step === "payment" ? "STEP 2 OF 2" : "STEP 1 OF 2"}</span>
            </div>
            {step === "details" ? (
              <>
                <header className="selected-plan-card">
                  <div className="selected-plan-topline">
                    <span className="selected-plan-brand">
                      <span className="selected-plan-mark" aria-hidden="true">KK</span>
                      KANYAKANYANA · CAMPUS PLAN
                    </span>
                    <span className="selected-plan-included">YOUR SELECTION</span>
                  </div>
                  <h2 id={`plan-title-${planId}`} className="selected-plan-name">{planName}</h2>
                  <p className="selected-plan-description">{description}</p>
                  <div className="selected-plan-price">
                    <span className="selected-plan-amount">₱{pricePhp.toLocaleString("en-PH")}</span>
                    <span className="selected-plan-term">{durationDays ? `/${durationDays} ${durationDays === 1 ? "day" : "days"}` : "no expiry"}</span>
                  </div>
                  <div className="selected-plan-divider" />
                  <div className="selected-plan-features-heading">
                    <span>Included with your plan</span>
                    <span>{dailyPostLimit == null ? "UNLIMITED POSTS" : `${dailyPostLimit} POSTS / DAY`}</span>
                  </div>
                  <ul className="plan-feature-list">
                    {features.map((feature) => (
                      <li key={feature}>
                        <span className="plan-feature-check" aria-hidden="true">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </header>
                <button type="button" onClick={() => setStep("payment")} className="plan-detail-next">
                  Next <span aria-hidden="true">→</span>
                </button>
                <p className="plan-detail-footnote">Payment is reviewed by the KanyaKanyaNa team before activation.</p>
              </>
            ) : (
              state?.success ? (
                <section className="payment-confirmation" role="status" aria-labelledby={`payment-confirmation-title-${planId}`}>
                  <span className="payment-confirmation-icon" aria-hidden="true">⌛</span>
                  <p className="eyebrow">PAYMENT REQUEST RECEIVED</p>
                  <h2 id={`payment-confirmation-title-${planId}`}>Waiting for approval</h2>
                  <p className="payment-confirmation-amount">₱{pricePhp.toLocaleString("en-PH")}</p>
                  <dl className="payment-confirmation-details">
                    <div><dt>Plan</dt><dd>{planName}</dd></div>
                    <div><dt>Payment method</dt><dd>Maya</dd></div>
                    <div><dt>Reference</dt><dd>{paymentReference}</dd></div>
                    {submittedAt && <div><dt>Submitted</dt><dd>{submittedAt.toLocaleString("en-PH")}</dd></div>}
                  </dl>
                  <p className="payment-confirmation-note">
                    Your payment details were sent to the KanyaKanyaNa team. Your plan will activate after an administrator verifies the payment.
                  </p>
                  <button type="button" className="btn-primary payment-confirmation-done" onClick={() => setStep("closed")}>
                    Done
                  </button>
                </section>
              ) : (
                <section className="mt-4 space-y-3">
                  <div className="payment-step-heading">
                    <p className="eyebrow">Secure your campus plan</p>
                    <h2 className="text-2xl font-extrabold">Pay for {planName}</h2>
                    <p className="text-sm text-slate-600">Send the exact amount below using Maya.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="payment-amount">Amount to send <strong>₱{pricePhp.toLocaleString("en-PH")}</strong></p>
                    <MayaQrCode />
                    <p className="text-xs text-slate-500">
                      Scan the QR in Maya and send the exact amount. Payment is not detected automatically; your plan activates after an administrator confirms the payment.
                    </p>
                  </div>
                  <form action={action} onSubmit={() => setSubmittedAt(new Date())} className="space-y-2">
                    <input type="hidden" name="plan_id" value={planId} />
                    <label className="block text-xs text-slate-500">
                      Maya payment reference or sender name
                      <input name="payment_reference" required maxLength={100} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="input mt-1" placeholder="Enter the reference number or sender name" />
                    </label>
                    {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
                    <span className="plan-request-button"><RequestButton /></span>
                  </form>
                </section>
              )
            )}
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
