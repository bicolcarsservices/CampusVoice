"use client";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { login, requestPasswordReset, resendConfirmation } from "@/server/auth-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Logging in..." : "Login"}</button>;
}

function ResendSubmit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-ghost w-full" disabled={pending}>{pending ? "Sending..." : "Resend confirmation email"}</button>;
}

function ResetSubmit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-ghost w-full" disabled={pending}>{pending ? "Sending..." : "Send password reset link"}</button>;
}

export default function LoginPage({ searchParams }: { searchParams?: { error?: string; registered?: string; next?: string } }) {
  const [state, action] = useFormState(login, null);
  const [resendState, resendAction] = useFormState(resendConfirmation, null);
  const [resetState, resetAction] = useFormState(requestPasswordReset, null);
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">Login</h1>
      {searchParams?.registered === "1" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-green-700" role="status">
            Account created. Check your email for the confirmation link, then return here to log in.
          </p>
          <form action={resendAction} className="space-y-2">
            <label className="block text-sm">Email for confirmation
              <input name="email" type="email" required autoComplete="email" className="input mt-1" />
            </label>
            {resendState?.error && <p role="alert" className="text-sm text-red-600">{resendState.error}</p>}
            {resendState?.success && <p role="status" className="text-sm text-green-700">{resendState.success}</p>}
            <ResendSubmit />
          </form>
        </div>
      )}
      {searchParams?.error === "verification" && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          We couldn’t verify that link. It may have expired; request a new confirmation email and try again.
        </p>
      )}
      <form action={action} className="space-y-3">
        {searchParams?.next && <input type="hidden" name="next" value={searchParams.next} />}
        <label className="block text-sm">Email
          <input name="email" type="email" required autoComplete="email" className="input mt-1" />
        </label>
        <label className="block text-sm">Password
          <input name="password" type="password" required autoComplete="current-password" className="input mt-1" />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <Submit />
      </form>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand">Forgot password?</summary>
        <form action={resetAction} className="mt-3 space-y-2">
          <label className="block text-sm">Account email
            <input name="email" type="email" required autoComplete="email" className="input mt-1" />
          </label>
          {resetState?.error && <p role="alert" className="text-sm text-red-600">{resetState.error}</p>}
          {resetState?.success && <p role="status" className="text-sm text-green-700">{resetState.success}</p>}
          <ResetSubmit />
        </form>
      </details>
      <p className="mt-4 text-sm">No account? <Link href={searchParams?.next ? `/register?next=${encodeURIComponent(searchParams.next)}` : "/register"} className="font-semibold text-brand">Create Account</Link></p>
    </div>
  );
}
