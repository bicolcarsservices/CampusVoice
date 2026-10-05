"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSubscriptionRequest } from "@/server/community-actions";

function RequestButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Sending request..." : "Request this plan"}</button>;
}

export default function PlanRequestForm({ planId }: { planId: string }) {
  const [state, action] = useFormState(createSubscriptionRequest, null);
  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="plan_id" value={planId} />
      <label className="block text-left text-xs text-slate-500">
        Payment reference (optional; no payment is processed here)
        <input name="payment_reference" maxLength={100} className="input mt-1" />
      </label>
      {state?.error && <p role="alert" className="text-left text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-left text-sm text-green-700">{state.success}</p>}
      <RequestButton />
    </form>
  );
}
