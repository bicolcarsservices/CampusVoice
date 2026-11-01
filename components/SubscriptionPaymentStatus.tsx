"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type PaymentRequest = {
  id: string;
  status: string;
  planName: string;
  amount: number;
  createdAt: string;
  paymentReference: string | null;
};

const dismissedEvent = "campusvoice:subscription-payment-status-dismissed";

function statusMessage(status: string) {
  if (status === "active") return "Your payment was verified and your plan is active.";
  if (status === "rejected") return "Your payment request was rejected. Please contact support if you need help.";
  if (status === "cancelled") return "This subscription request was cancelled.";
  if (status === "expired") return "This subscription has expired.";
  if (status === "refunded") return "This subscription payment was refunded.";
  return "Your payment is being checked by our team. This status updates automatically.";
}

export default function SubscriptionPaymentStatus({
  initialRequest,
  pageMode = false,
  showReceiptInitially = false,
}: {
  initialRequest: PaymentRequest | null;
  pageMode?: boolean;
  showReceiptInitially?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [open, setOpen] = useState(pageMode);
  const [showReceipt, setShowReceipt] = useState(showReceiptInitially);
  const [dismissed, setDismissed] = useState(false);
  const [dismissalChecked, setDismissalChecked] = useState(false);
  const dismissedStorageKey = initialRequest ? `subscription-payment-status-dismissed:${initialRequest.id}` : null;

  useEffect(() => {
    setRequest(initialRequest);
  }, [initialRequest?.id, initialRequest?.status, initialRequest?.createdAt]);

  useEffect(() => {
    setShowReceipt(showReceiptInitially);
  }, [showReceiptInitially, initialRequest?.id]);

  useEffect(() => {
    if (initialRequest?.status === "pending" && dismissedStorageKey) {
      window.localStorage.removeItem(dismissedStorageKey);
      setDismissed(false);
    } else {
      setDismissed(Boolean(dismissedStorageKey && window.localStorage.getItem(dismissedStorageKey) === "true"));
    }
    setDismissalChecked(true);
  }, [dismissedStorageKey, initialRequest?.status]);

  useEffect(() => {
    const handleDismissed = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === request?.id) setDismissed(true);
    };
    window.addEventListener(dismissedEvent, handleDismissed);
    return () => window.removeEventListener(dismissedEvent, handleDismissed);
  }, [request?.id]);

  useEffect(() => {
    if (!request || request.status !== "pending") return;
    let disposed = false;
    let timeout: number | undefined;

    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/subscriptions/${encodeURIComponent(request.id)}/status`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Could not check payment status: ${response.status}`);
        const result = await response.json() as { status: string };
        if (!disposed) setRequest((current) => current?.id === request.id
          ? { ...current, status: result.status }
          : current);
      } catch (error) {
        if (!disposed) console.error("Could not refresh subscription payment status.", error);
      } finally {
        if (!disposed) timeout = window.setTimeout(refreshStatus, 7000);
      }
    };

    timeout = window.setTimeout(refreshStatus, 7000);
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [request?.id, request?.status]);

  if (!request) return null;
  if (!pageMode && pathname.startsWith("/subscription/status/")) return null;

  const pending = request.status === "pending";
  const activated = request.status === "active";
  const formattedAmount = `₱${request.amount.toLocaleString("en-PH")}`;
  const orderNumber = `CV-${request.id.slice(0, 8).toUpperCase()}`;
  const orderDate = new Date(request.createdAt).toLocaleDateString("en-PH");
  const finishStatus = () => {
    if (activated) {
      if (dismissedStorageKey) window.localStorage.setItem(dismissedStorageKey, "true");
      setDismissed(true);
      window.dispatchEvent(new CustomEvent(dismissedEvent, { detail: { id: request.id } }));
    }
    if (pageMode) router.push("/wall");
    else setOpen(false);
  };

  return (
    <>
      {!pageMode && !dismissed && dismissalChecked && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="payment-status-launcher fixed right-6 z-[60] flex items-center gap-2 rounded-full bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-700"
          aria-label="Open payment status"
        >
          <span aria-hidden="true">{pending ? "⌛" : activated ? "✓" : "₱"}</span>
          <span>Payment status</span>
          {pending && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-label="Pending" />}
        </button>
      )}

      {open && (
        <div
          className={pageMode
            ? "mx-auto w-full max-w-2xl"
            : "fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"}
          onMouseDown={(event) => {
            if (!pageMode && event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role={pageMode ? "region" : "dialog"}
            aria-modal={pageMode ? undefined : true}
            aria-labelledby="subscription-payment-status-title"
            className={`w-full rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white ${pageMode ? "" : "max-w-md"}`}
          >
            {activated && showReceipt ? (
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-4xl font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" aria-hidden="true">✓</div>
                <h2 id="subscription-payment-status-title" className="text-2xl font-extrabold">Payment Successful</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Thank you for subscribing! Your plan is now active.</p>
                <div className="mt-5 rounded-xl border border-slate-200 p-4 text-left dark:border-slate-700">
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Order date</dt><dd>{orderDate}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Order no.</dt><dd>{orderNumber}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="font-bold text-emerald-700 dark:text-emerald-400">Successful</dd></div>
                    <hr className="border-slate-200 dark:border-slate-700" />
                    <div className="flex justify-between gap-3"><dt>CampusVoice {request.planName}</dt><dd className="font-bold">{formattedAmount}</dd></div>
                    <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 font-bold dark:border-slate-700"><dt>Total</dt><dd>{formattedAmount}</dd></div>
                  </dl>
                </div>
                <button
                  type="button"
                  className="btn-primary mt-5 w-full"
                  onClick={finishStatus}
                >
                  Done
                </button>
                <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setShowReceipt(false)}>
                  Back to payment status
                </button>
              </div>
            ) : (
            <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">PAYMENT UPDATE</p>
                <h2 id="subscription-payment-status-title" className="text-2xl font-extrabold">Payment Status</h2>
              </div>
              {pageMode ? (
                <button type="button" className="btn-ghost" onClick={() => router.push("/subscription")}>×</button>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)} aria-label="Close payment status">×</button>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 font-bold text-white">1</span>
                <div>
                  <p className="font-bold">Payment submitted</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{request.planName} plan · {formattedAmount}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold text-white ${request.status === "rejected" ? "bg-red-600" : pending ? "animate-pulse bg-sky-600" : "bg-emerald-600"}`}>2</span>
                <div>
                  <p className="font-bold">Payment verification</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{statusMessage(request.status)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold text-white ${activated ? "bg-emerald-600" : "bg-slate-400"}`}>3</span>
                <div>
                  <p className="font-bold">Plan activated</p>
                  {activated && <p className="text-sm text-emerald-700 dark:text-emerald-400">Your plan is ready to use.</p>}
                </div>
              </div>
            </div>

            <dl className="mt-5 space-y-2 rounded-xl bg-slate-100 p-4 text-sm dark:bg-slate-800">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Submitted</dt><dd className="text-right">{new Date(request.createdAt).toLocaleString("en-PH")}</dd></div>
              {request.paymentReference && <div className="flex justify-between gap-3"><dt className="text-slate-500">Reference</dt><dd className="break-all text-right">{request.paymentReference}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="font-bold capitalize">{request.status}</dd></div>
            </dl>
            {activated && (
              <button type="button" className="btn-ghost mt-4 w-full" onClick={() => setShowReceipt(true)}>
                View receipt
              </button>
            )}
            <button
              type="button"
              className="btn-primary mt-5 w-full"
              onClick={finishStatus}
            >
              Done
            </button>
            </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
