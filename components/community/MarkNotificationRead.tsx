"use client";

import { useFormState, useFormStatus } from "react-dom";
import { markNotificationRead } from "@/server/community-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="btn-ghost" type="submit" disabled={pending}>{pending ? "Saving..." : "Mark read"}</button>;
}

export default function MarkNotificationRead({ notificationId }: { notificationId: string }) {
  const [state, action] = useFormState(markNotificationRead, null);
  return (
    <form action={action}>
      <input type="hidden" name="notification_id" value={notificationId} />
      <SubmitButton />
      {state?.error && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
  );
}
