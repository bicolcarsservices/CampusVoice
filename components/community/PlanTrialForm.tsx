"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/server/community-actions";
import { startSubscriptionTrial } from "@/server/community-actions";

function TrialButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Starting trial..." : "Select 2-day trial"}
    </button>
  );
}

export default function PlanTrialForm({ planCode }: { planCode: "basic" | "premium" }) {
  const [state, action] = useFormState(startSubscriptionTrial, null);
  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="plan_code" value={planCode} />
      <p className="text-xs text-slate-500">One free 2-day trial per account. No payment or automatic charge. Your trial ends automatically.</p>
      <TrialButton />
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
    </form>
  );
}

export function TrialStatus({ text }: { text: string }) {
  return <p className="btn-ghost mt-4 w-full cursor-default" aria-live="polite">{text}</p>;
}
