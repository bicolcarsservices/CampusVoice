"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/server/dating-actions";

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Please wait..." : label}
    </button>
  );
}

export default function SocialActionForm({
  action,
  children,
  submitLabel,
  className = "inline-flex",
  buttonClassName = "btn-ghost",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, dispatch] = useFormState(action, null);
  return (
    <form action={dispatch} className={className}>
      {children}
      {state?.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      <SubmitButton label={submitLabel} className={buttonClassName} />
    </form>
  );
}
