"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/wallet";

export type WalletWithdrawalRequest = {
  id: string;
  amount_centavos: number;
  payout_method: string;
  status: "pending" | "approved" | "paid" | "rejected" | "cancelled";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function statusMessage(status: WalletWithdrawalRequest["status"]) {
  if (status === "approved") return "Your request was approved. The payout is being processed.";
  if (status === "paid") return "Your withdrawal has been paid.";
  if (status === "rejected") return "Your withdrawal was rejected. The reserved balance has been returned to your wallet.";
  if (status === "cancelled") return "Your withdrawal was cancelled. The reserved balance has been returned to your wallet.";
  return "Your withdrawal request is being reviewed. This status updates automatically.";
}

export default function WalletWithdrawalStatus({ initialRequest }: { initialRequest: WalletWithdrawalRequest }) {
  const [request, setRequest] = useState(initialRequest);
  const [open, setOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissalChecked, setDismissalChecked] = useState(false);
  const storageKey = `wallet-withdrawal-status-dismissed:${initialRequest.id}`;
  const isPending = request.status === "pending";

  useEffect(() => {
    setRequest(initialRequest);
  }, [initialRequest.id, initialRequest.status, initialRequest.created_at]);

  useEffect(() => {
    if (initialRequest.status === "pending") {
      window.localStorage.removeItem(storageKey);
      setDismissed(false);
    } else {
      setDismissed(window.localStorage.getItem(storageKey) === "true");
    }
    setDismissalChecked(true);
  }, [initialRequest.status, storageKey]);

  useEffect(() => {
    if (!isPending) return;
    let disposed = false;
    let timeout: number | undefined;

    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/wallet/withdrawals/${encodeURIComponent(request.id)}/status`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Could not check withdrawal status: ${response.status}`);
        const result = await response.json() as WalletWithdrawalRequest;
        if (!disposed) setRequest((current) => current.id === request.id ? result : current);
      } catch (error) {
        if (!disposed) console.error("Could not refresh wallet withdrawal status.", error);
      } finally {
        if (!disposed) timeout = window.setTimeout(refreshStatus, 7000);
      }
    };

    timeout = window.setTimeout(refreshStatus, 7000);
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [isPending, request.id]);

  const finishStatus = () => {
    if (!isPending) {
      window.localStorage.setItem(storageKey, "true");
      setDismissed(true);
    }
    setOpen(false);
  };

  const statusLabel = request.status === "paid"
    ? "paid"
    : request.status === "cancelled"
      ? "cancelled"
      : request.status;
  const canViewReceipt = request.status === "paid";
  const receiptNumber = `WW-${request.id.slice(0, 8).toUpperCase()}`;
  const receiptDate = new Date(request.reviewed_at ?? request.created_at).toLocaleString("en-PH");

  return (
    <>
      {!dismissed && dismissalChecked && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="wallet-withdrawal-status-launcher fixed right-6 z-[60] flex items-center gap-2 rounded-full bg-violet-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-violet-800"
          aria-label="Open wallet withdrawal status"
        >
          <span aria-hidden="true">{isPending ? "⌛" : request.status === "paid" ? "✓" : request.status === "approved" ? "↗" : "!"}</span>
          <span>Withdrawal status</span>
          {isPending && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-label="Pending" />}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-withdrawal-status-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white"
          >
            {receiptOpen && canViewReceipt ? (
              <>
                <div className="wallet-receipt-print wallet-receipt-withdrawal">
                  <p className="wallet-receipt-kicker text-sm font-bold uppercase tracking-widest">KanyaKanyaNa · Wallet receipt</p>
                  <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Withdrawal receipt</h2>
                  <p className="mt-1 text-sm text-slate-500">Payout completed</p>
                  <dl className="mt-6 space-y-3 text-sm text-slate-900">
                    <div className="flex justify-between gap-3"><dt>Receipt no.</dt><dd className="font-semibold">{receiptNumber}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Date paid</dt><dd className="text-right">{receiptDate}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Payout method</dt><dd>{request.payout_method}</dd></div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-base font-extrabold"><dt>Amount paid</dt><dd>{formatCentavos(request.amount_centavos)}</dd></div>
                  </dl>
                  <p className="mt-6 text-xs text-slate-500">This receipt confirms that the withdrawal request was marked paid. Account details are not shown for privacy.</p>
                </div>
                <div className="wallet-receipt-print-actions mt-5 grid gap-2">
                  <button type="button" className="btn-primary w-full" onClick={() => window.print()}>Print / Save receipt</button>
                  <button type="button" className="btn-ghost w-full" onClick={() => setReceiptOpen(false)}>Back to status</button>
                </div>
              </>
            ) : (
            <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Wallet withdrawal</p>
                <h2 id="wallet-withdrawal-status-title" className="text-2xl font-extrabold">
                  Withdrawal {statusLabel}
                </h2>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} aria-label="Close withdrawal status">×</button>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{statusMessage(request.status)}</p>
            <dl className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{formatCentavos(request.amount_centavos)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Payout method</dt><dd>{request.payout_method}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Request date</dt><dd>{new Date(request.created_at).toLocaleString("en-PH")}</dd></div>
              {request.reviewed_at && <div className="flex justify-between gap-3"><dt className="text-slate-500">Reviewed</dt><dd>{new Date(request.reviewed_at).toLocaleString("en-PH")}</dd></div>}
              {request.review_note && <div className="border-t border-slate-200 pt-3 dark:border-slate-700"><dt className="text-slate-500">Admin note</dt><dd className="mt-1 whitespace-pre-wrap">{request.review_note}</dd></div>}
            </dl>
            {canViewReceipt && (
              <button type="button" className="btn-ghost mt-4 w-full" onClick={() => setReceiptOpen(true)}>
                View receipt
              </button>
            )}
            <div className="mt-5 grid gap-2">
              <Link href="/wallet" className="btn-primary w-full" onClick={() => setOpen(false)}>View wallet</Link>
              <button type="button" className="btn-ghost w-full" onClick={finishStatus}>
                {isPending ? "Close" : "Done"}
              </button>
            </div>
            </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
