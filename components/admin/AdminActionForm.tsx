"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/server/community-actions";

type ActionResult = Promise<{ error?: string; success?: string }>;
type AdminAction = (formData: FormData) => ActionResult;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-ghost" disabled={pending}>{pending ? "Saving..." : label}</button>;
}

export default function AdminActionForm({
  action,
  children,
  submitLabel,
}: {
  action: AdminAction;
  children: ReactNode;
  submitLabel: string;
}) {
  const [state, dispatch] = useFormState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    null,
  );
  return (
    <form action={dispatch} className="space-y-3">
      {children}
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
