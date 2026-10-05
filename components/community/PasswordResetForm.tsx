"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updatePassword } from "@/server/auth-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Updating..." : "Update password"}</button>;
}

export default function PasswordResetForm() {
  const [state, action] = useFormState(updatePassword, null);
  return (
    <form action={action} className="card mx-auto max-w-sm space-y-4">
      <div><p className="eyebrow">Secure your account</p><h1 className="text-2xl font-bold">Choose a new password</h1></div>
      <label className="block text-sm">New password
        <input type="password" name="password" minLength={8} required autoComplete="new-password" className="input mt-1" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <Submit />
    </form>
  );
}
