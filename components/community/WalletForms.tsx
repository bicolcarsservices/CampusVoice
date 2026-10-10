"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/server/community-actions";
import {
  cancelWalletWithdrawal,
  requestWalletTopup,
  requestWalletWithdrawal,
} from "@/server/community-actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Submitting..." : label}</button>;
}

function FormFeedback({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state?.success) return <p role="status" className="text-sm text-green-700">{state.success}</p>;
  return null;
}

export function WalletTopupForm() {
  const [state, dispatch] = useFormState(requestWalletTopup, null);
  return (
    <form action={dispatch} className="space-y-3">
      <label className="block text-sm">Amount sent to Maya (PHP)
        <input name="amount_php" type="number" min="1" max="100000" step="0.01" required className="input mt-1" placeholder="100.00" />
      </label>
      <label className="block text-sm">Maya payment reference (optional)
        <input name="payment_reference" maxLength={120} className="input mt-1" placeholder="Reference number or sender name" />
      </label>
      <p className="text-xs text-slate-500">Enter the amount you sent using the Maya QR code. An administrator verifies it and enters any applicable deduction before crediting your wallet.</p>
      <SubmitButton label="Submit top-up for verification" />
      <FormFeedback state={state} />
    </form>
  );
}

export function WalletWithdrawalForm() {
  const [state, dispatch] = useFormState(requestWalletWithdrawal, null);
  return (
    <form action={dispatch} className="space-y-3">
      <label className="block text-sm">Withdrawal amount (PHP)
        <input name="amount_php" type="number" min="1" max="100000" step="0.01" required className="input mt-1" placeholder="100.00" />
      </label>
      <label className="block text-sm">Payout method
        <select name="payout_method" className="input mt-1"><option>Maya</option><option>GCash</option><option>Bank</option></select>
      </label>
      <label className="block text-sm">Account name
        <input name="account_name" required minLength={2} maxLength={100} className="input mt-1" />
      </label>
      <label className="block text-sm">Account number
        <input name="account_number" required minLength={4} maxLength={100} className="input mt-1" />
      </label>
      <p className="text-xs text-slate-500">The requested amount is reserved while pending. If declined or cancelled, it is returned to your wallet.</p>
      <SubmitButton label="Request withdrawal" />
      <FormFeedback state={state} />
    </form>
  );
}

export function CancelWalletWithdrawalForm({ requestId }: { requestId: string }) {
  const [state, dispatch] = useFormState(cancelWalletWithdrawal, null);
  return (
    <form action={dispatch} className="space-y-2">
      <input type="hidden" name="request_id" value={requestId} />
      <button type="submit" className="btn-ghost text-sm">Cancel request</button>
      <FormFeedback state={state} />
    </form>
  );
}
