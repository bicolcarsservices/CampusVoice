"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/server/community-actions";
import { cancelMySubscription } from "@/server/community-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost mt-3" disabled={pending}>
      {pending ? "Cancelling..." : "Cancel subscription"}
    </button>
  );
}

export default function CancelSubscriptionForm({ subscriptionId }: { subscriptionId: string }) {
  const [state, dispatch] = useFormState(cancelMySubscription, null);
  return (
    <form action={dispatch}>
      <input type="hidden" name="subscription_id" value={subscriptionId} />
      <SubmitButton />
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="mt-2 text-sm text-green-700">{state.success}</p>}
    </form>
  );
}
