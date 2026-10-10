import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { formatCentavos } from "@/lib/wallet";
import MayaQrCode from "@/components/community/MayaQrCode";
import {
  CancelWalletWithdrawalForm,
  WalletTopupForm,
  WalletWithdrawalForm,
} from "@/components/community/WalletForms";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const { data: balance, error: balanceError } = await supabase.rpc("my_wallet_balance");
  if (balanceError) throw new Error(`Could not load wallet balance: ${balanceError.message}`);

  const [{ data: transactions, error: transactionsError },
    { data: topups, error: topupsError },
    { data: withdrawals, error: withdrawalsError }] = await Promise.all([
    supabase.from("wallet_transactions")
      .select("id,direction,kind,amount_centavos,balance_after_centavos,note,game_key,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("wallet_topup_requests")
      .select("id,amount_centavos,received_centavos,fee_centavos,credited_centavos,payment_reference,status,review_note,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("wallet_withdrawal_requests")
      .select("id,amount_centavos,payout_method,status,review_note,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (transactionsError) throw new Error(`Could not load wallet transactions: ${transactionsError.message}`);
  if (topupsError) throw new Error(`Could not load top-up requests: ${topupsError.message}`);
  if (withdrawalsError) throw new Error(`Could not load withdrawal requests: ${withdrawalsError.message}`);

  const requests = [...(topups ?? []).map((row) => ({ ...row, requestType: "Top-up" })),
    ...(withdrawals ?? []).map((row) => ({ ...row, requestType: "Withdrawal" }))]
    .sort((left, right) => right.created_at.localeCompare(left.created_at));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">Games wallet</p>
        <h1 className="text-3xl font-extrabold">Credit balance</h1>
      </header>
      <section className="card bg-violet-50 dark:bg-violet-950/40">
        <p className="text-sm text-slate-600 dark:text-slate-300">Available balance</p>
        <p className="mt-1 text-4xl font-extrabold">{formatCentavos(balance)}</p>
        <p className="mt-1 text-xs text-slate-500">Balance is stored in PHP centavos (₱1.00 = 100 centavos).</p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-4">
          <div><h2 className="text-xl font-bold">Top up with Maya</h2><p className="text-sm text-slate-500">Send payment, then submit it for admin verification.</p></div>
          <MayaQrCode />
          <WalletTopupForm />
        </section>
        <section className="card space-y-4">
          <div><h2 className="text-xl font-bold">Withdraw balance</h2><p className="text-sm text-slate-500">Request a manual payout to Maya, GCash, or a bank account.</p></div>
          <WalletWithdrawalForm />
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Top-up and withdrawal requests</h2>
        {!requests.length && <p className="text-sm text-slate-500">No wallet requests yet.</p>}
        {requests.map((request) => (
          <article key={`${request.requestType}-${request.id}`} className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div>
              <p className="font-semibold">{request.requestType} · {formatCentavos(request.amount_centavos)}</p>
              <p className="text-xs capitalize text-slate-500">{request.status} · {new Date(request.created_at).toLocaleString()}</p>
              {"fee_centavos" in request && request.status === "approved" && (
                <p className="text-xs text-slate-500">Received: {formatCentavos(request.received_centavos)} · Deduction: {formatCentavos(request.fee_centavos)} · Wallet credit: {formatCentavos(request.credited_centavos)}</p>
              )}
              {"payment_reference" in request && request.payment_reference && <p className="text-xs text-slate-500">Reference: {request.payment_reference}</p>}
              {request.review_note && <p className="text-xs text-slate-500">Admin note: {request.review_note}</p>}
            </div>
            {request.requestType === "Withdrawal" && request.status === "pending" && (
              <CancelWalletWithdrawalForm requestId={request.id} />
            )}
          </article>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Wallet transactions</h2>
        {!transactions?.length && <p className="text-sm text-slate-500">No transactions yet.</p>}
        {(transactions ?? []).map((transaction) => (
          <article key={transaction.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
            <div>
              <p className="font-semibold capitalize">{transaction.kind.replaceAll("_", " ")}{transaction.game_key ? ` · ${transaction.game_key}` : ""}</p>
              <p className="text-xs text-slate-500">{transaction.note ?? "—"} · {new Date(transaction.created_at).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className={transaction.direction === "credit" ? "font-semibold text-green-700" : "font-semibold text-slate-700"}>
                {transaction.direction === "credit" ? "+" : "−"}{formatCentavos(transaction.amount_centavos)}
              </p>
              <p className="text-xs text-slate-500">Balance {formatCentavos(transaction.balance_after_centavos)}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
