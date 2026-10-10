"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Conversion = {
  id: string;
  subscription_id: string;
  crystals: number;
  plan_code: string;
  amount_centavos: number;
  status: string;
  review_note: string | null;
  created_at: string;
};

type Withdrawal = {
  id: string;
  amount_centavos: number;
  vat_centavos: number;
  payout_centavos: number;
  payout_method: string;
  status: string;
  review_note: string | null;
  created_at: string;
};

type InventoryItem = {
  item_id: string;
  item_type: string;
  upgrade_level: number;
  equipped: boolean;
};

type Account = {
  subscription: { status: string; expires_at: string | null; subscription_id: string | null };
  gameAccessAvailable: boolean;
  earningsBalanceCentavos: number;
  dias: number;
  inventory: InventoryItem[];
  conversions: Conversion[];
  withdrawals: Withdrawal[];
};

const formatPhp = (centavos: number) => `₱${(Number(centavos) / 100).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export default function GalacticStriker({ gameEnabled }: { gameEnabled: boolean }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [crystals, setCrystals] = useState(0);
  const [conversionAmount, setConversionAmount] = useState(25000);
  const [amountPhp, setAmountPhp] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canConvert = gameEnabled && account?.gameAccessAvailable !== false;
  const hasPendingConversion = account?.conversions.some((conversion) => conversion.status === "pending") ?? false;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/galactic-striker", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 403) {
      iframe.current?.contentWindow?.postMessage({ type: "galactic-subscription-expired" }, window.location.origin);
    }
    if (!response.ok) throw new Error(data.error ?? "Could not load game earnings.");
    const current = data as Account;
    setAccount(current);
    if (!current.gameAccessAvailable) {
      iframe.current?.contentWindow?.postMessage({ type: "galactic-subscription-expired" }, window.location.origin);
    } else {
      iframe.current?.contentWindow?.postMessage({
        type: "galactic-wallet-sync",
        dias: current.dias,
        inventory: current.inventory,
      }, window.location.origin);
    }
    for (const conversion of current.conversions) {
      if (conversion.status === "approved" || conversion.status === "rejected") {
        iframe.current?.contentWindow?.postMessage({
          type: "galactic-conversion-settled",
          requestId: conversion.id,
          subscriptionId: conversion.subscription_id,
          crystals: conversion.crystals,
          status: conversion.status,
        }, window.location.origin);
      }
    }
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load game earnings."));
    const interval = window.setInterval(() => {
      void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh game earnings."));
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function receiveGameMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return;
      if (typeof event.data !== "object" || event.data === null ||
          !["galactic-convert", "galactic-balance"].includes(event.data.type)) return;
      const available = Number(event.data.crystals);
      if (!Number.isSafeInteger(available) || available < 0) return;
      setCrystals(available);
      if (event.data.type === "galactic-convert") {
        setConversionAmount(available >= 25000 ? 25000 : 60000);
        setError("");
        setMessage("");
      }
    }
    window.addEventListener("message", receiveGameMessage);
    return () => window.removeEventListener("message", receiveGameMessage);
  }, []);

  async function submitConversion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/galactic-striker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", crystals: conversionAmount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit conversion.");
      iframe.current?.contentWindow?.postMessage(
        {
          type: "galactic-conversion-submitted",
          requestId: data.requestId,
          subscriptionId: account?.subscription.subscription_id,
          crystals: conversionAmount,
        },
        window.location.origin,
      );
      setMessage(data.success);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit conversion.");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdrawal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountCentavos = Math.round(Number(form.get("amount_php")) * 100);
    if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 100) {
      setError("Enter a withdrawal amount of at least ₱1.00.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/galactic-striker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          amountCentavos,
          payoutMethod: form.get("payout_method"),
          accountName: form.get("account_name"),
          accountEmail: form.get("account_email"),
          accountNumber: form.get("account_number"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit withdrawal.");
      setMessage(data.success);
      setAmountPhp("");
      formElement.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {gameEnabled && (
        <iframe
          ref={iframe}
          title="Galactic Striker"
          src="/games/galactic-striker.html"
          className="h-[85vh] min-h-[720px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
          allow="fullscreen"
          onLoad={() => void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh game earnings."))}
        />
      )}

      <section className={`card grid gap-5 ${canConvert ? "md:grid-cols-2" : ""}`}>
        {canConvert ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold">Crystal conversion</h2>
            <p className="text-sm text-slate-500">Crystals remain game-only until you request a conversion and an admin approves it.</p>
          </div>
          <p className="text-sm">Game crystals currently shown: <strong>{crystals.toLocaleString("en-US")}</strong></p>
          <form onSubmit={submitConversion} className="space-y-3">
            <label className="block text-sm">Conversion bundle
              <select
                className="input mt-1"
                value={conversionAmount}
                onChange={(event) => setConversionAmount(Number(event.target.value))}
              >
                <option value={25000} disabled={crystals < 25000}>25,000 crystals → ₱25.00</option>
                <option value={60000} disabled={crystals < 60000}>
                  60,000 crystals → ₱{account?.subscription.status === "premium" ? "60.00" : "50.00"}
                </option>
              </select>
            </label>
            <button type="submit" className="btn-primary" disabled={busy || hasPendingConversion || !account || crystals < conversionAmount}>
              {busy ? "Submitting..." : hasPendingConversion ? "Conversion pending review" : "Submit conversion for review"}
            </button>
          </form>
          <p className="text-xs text-slate-500">Basic: 25,000 = ₱25 or 60,000 = ₱50. Premium: 25,000 = ₱25 or 60,000 = ₱60. Conversion requires an active Basic or Premium plan.</p>
        </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold">Game crystals reset</h2>
            <p className="text-sm text-slate-500">An active Basic or Premium plan is needed to play and request new crystal conversions. Your already-approved earnings and payout requests remain available here.</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold">Game earnings</h2>
            <p className="text-3xl font-extrabold">{account ? formatPhp(account.earningsBalanceCentavos) : "—"}</p>
            <p className="text-xs text-slate-500">Approved earnings are separate from your top-up wallet and Dias.</p>
          </div>
          <form onSubmit={submitWithdrawal} className="space-y-3">
            <label className="block text-sm">Withdrawal amount (PHP)
              <input
                name="amount_php"
                type="number"
                min="1"
                max="100000"
                step="0.01"
                required
                className="input mt-1"
                placeholder="25.00"
                value={amountPhp}
                onChange={(event) => setAmountPhp(event.target.value)}
              />
            </label>
            <label className="block text-sm">Payout method
              <select name="payout_method" className="input mt-1"><option>GCash</option><option>Maya</option></select>
            </label>
            <label className="block text-sm">Account name
              <input name="account_name" required minLength={2} maxLength={100} className="input mt-1" />
            </label>
            <label className="block text-sm">Email
              <input name="account_email" type="email" required maxLength={254} className="input mt-1" />
            </label>
            <label className="block text-sm">Account number
              <input name="account_number" required minLength={4} maxLength={100} className="input mt-1" />
            </label>
            <p className="text-xs text-slate-500">10% VAT is deducted from the requested amount. Example: ₱100 request → ₱10 VAT → ₱90 payout. Requests need admin approval; no automatic payment is sent.</p>
            <button type="submit" className="btn-primary" disabled={busy || !account || account.earningsBalanceCentavos < 100}>
              {busy ? "Submitting..." : "Request withdrawal"}
            </button>
          </form>
        </div>
        {error && <p className="text-sm text-red-700 md:col-span-2" role="alert">{error}</p>}
        {message && <p className="text-sm text-green-700 md:col-span-2" role="status">{message}</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Conversion requests</h2>
        {!account?.conversions.length && <p className="text-sm text-slate-500">No conversions yet.</p>}
        {account?.conversions.map((conversion) => (
          <article key={conversion.id} className="border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
            <p className="font-semibold">{conversion.crystals.toLocaleString()} crystals → {formatPhp(conversion.amount_centavos)} · <span className="capitalize">{conversion.status}</span></p>
            <p className="text-xs text-slate-500">{new Date(conversion.created_at).toLocaleString()} · {conversion.plan_code} plan</p>
            {conversion.review_note && <p className="text-xs text-slate-500">Admin note: {conversion.review_note}</p>}
          </article>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Withdrawal requests</h2>
        {!account?.withdrawals.length && <p className="text-sm text-slate-500">No withdrawals yet.</p>}
        {account?.withdrawals.map((withdrawal) => (
          <article key={withdrawal.id} className="border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
            <p className="font-semibold">{formatPhp(withdrawal.amount_centavos)} requested · {formatPhp(withdrawal.vat_centavos)} VAT · {formatPhp(withdrawal.payout_centavos)} net · <span className="capitalize">{withdrawal.status}</span></p>
            <p className="text-xs text-slate-500">{withdrawal.payout_method} · {new Date(withdrawal.created_at).toLocaleString()}</p>
            {withdrawal.review_note && <p className="text-xs text-slate-500">Admin note: {withdrawal.review_note}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
