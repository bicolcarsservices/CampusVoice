import AdminActionForm from "@/components/admin/AdminActionForm";
import WalletTopupFeeField from "@/components/admin/WalletTopupFeeField";
import { formatCentavos } from "@/lib/wallet";
import { createClient } from "@/lib/supabase/server";
import {
  adminReviewWalletTopup,
  adminReviewWalletWithdrawal,
  adminSetWalletGameRate,
} from "@/server/admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminWalletPage() {
  const supabase = createClient();
  const [{ data: topups, error: topupError },
    { data: withdrawals, error: withdrawalError },
    { data: rates, error: ratesError }] = await Promise.all([
    supabase.from("wallet_topup_requests")
      .select("id,user_id,amount_centavos,received_centavos,fee_centavos,credited_centavos,payment_reference,status,created_at,profiles(username,display_name)")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("wallet_withdrawal_requests")
      .select("id,user_id,amount_centavos,payout_method,account_name,account_number,status,created_at,profiles(username,display_name)")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("wallet_game_rates")
      .select("game_key,game_name,price_centavos,period_minutes,is_active,updated_at")
      .order("game_name"),
  ]);
  if (topupError) throw new Error(`Could not load wallet top-up requests: ${topupError.message}`);
  if (withdrawalError) throw new Error(`Could not load wallet withdrawals: ${withdrawalError.message}`);
  if (ratesError) throw new Error(`Could not load game rates: ${ratesError.message}`);

  return (
    <section className="space-y-6">
      <header><h2 className="text-2xl font-bold">Wallet management</h2><p className="text-sm text-slate-500">Verify Maya transfers before crediting balances. Approve withdrawals, send the payout manually, then mark them paid.</p></header>

      <div className="space-y-3">
        <h3 className="text-xl font-bold">Top-up requests</h3>
        {!topups?.length && <p className="card text-sm text-slate-500">No top-up requests.</p>}
        {(topups ?? []).map((request) => {
          const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
          return (
            <article className="card space-y-3" key={request.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h4 className="font-bold">{profile?.display_name ?? profile?.username ?? request.user_id} · {formatCentavos(request.amount_centavos)} sent</h4>
                <span className="tag capitalize">{request.status}</span>
              </div>
              {request.status !== "pending" && request.status !== "rejected" && (
                <p className="text-sm text-slate-500">
                  Received: {formatCentavos(request.received_centavos)} · Deduction: {formatCentavos(request.fee_centavos)} · Credited to wallet: <strong>{formatCentavos(request.credited_centavos)}</strong>
                </p>
              )}
              <p className="text-sm text-slate-500">{new Date(request.created_at).toLocaleString()}{request.payment_reference ? ` · Maya reference: ${request.payment_reference}` : ""}</p>
              {request.status === "pending" && (
                <div className="grid gap-3 md:grid-cols-2">
                  {(["approve", "reject"] as const).map((decision) => (
                    <AdminActionForm key={decision} action={adminReviewWalletTopup} submitLabel={decision === "approve" ? "Verify payment and credit" : "Reject request"}>
                      <input type="hidden" name="request_id" value={request.id} />
                      <input type="hidden" name="decision" value={decision} />
                      {decision === "approve" && <WalletTopupFeeField requestedCentavos={request.amount_centavos} />}
                      <label className="block text-sm">Review note
                        <input name="reason" maxLength={500} className="input mt-1" placeholder={decision === "approve" ? "Verified Maya transaction and deduction basis" : "Reason for rejection"} />
                      </label>
                    </AdminActionForm>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-bold">Withdrawal requests</h3>
        {!withdrawals?.length && <p className="card text-sm text-slate-500">No withdrawal requests.</p>}
        {(withdrawals ?? []).map((request) => {
          const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
          return (
            <article className="card space-y-3" key={request.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h4 className="font-bold">{profile?.display_name ?? profile?.username ?? request.user_id} · {formatCentavos(request.amount_centavos)}</h4>
                <span className="tag capitalize">{request.status}</span>
              </div>
              <p className="text-sm">{request.payout_method} · {request.account_name} · <span className="font-mono">{request.account_number}</span></p>
              <p className="text-xs text-slate-500">Requested {new Date(request.created_at).toLocaleString()}</p>
              {request.status === "pending" && (
                <div className="grid gap-3 md:grid-cols-2">
                  {(["approve", "reject"] as const).map((decision) => (
                    <AdminActionForm key={decision} action={adminReviewWalletWithdrawal} submitLabel={decision === "approve" ? "Approve payout" : "Reject and return balance"}>
                      <input type="hidden" name="request_id" value={request.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <label className="block text-sm">Review note
                        <input name="reason" maxLength={500} className="input mt-1" />
                      </label>
                    </AdminActionForm>
                  ))}
                </div>
              )}
              {request.status === "approved" && (
                <AdminActionForm action={adminReviewWalletWithdrawal} submitLabel="Mark payout as sent">
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="decision" value="paid" />
                  <label className="block text-sm">Payout reference / note
                    <input name="reason" maxLength={500} className="input mt-1" />
                  </label>
                </AdminActionForm>
              )}
            </article>
          );
        })}
      </div>

      <div className="space-y-3">
        <div><h3 className="text-xl font-bold">Game charge rates</h3><p className="text-sm text-slate-500">Example: ₱1.00 per 30 minutes. Rates are inactive by default; only activate after a game is ready.</p></div>
        {(rates ?? []).map((rate) => (
          <article className="card" key={rate.game_key}>
            <AdminActionForm action={adminSetWalletGameRate} submitLabel="Save game rate">
              <input type="hidden" name="game_key" value={rate.game_key} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">Game key
                  <input value={rate.game_key} readOnly className="input mt-1" />
                </label>
                <label className="block text-sm">Game name
                  <input name="game_name" required maxLength={80} defaultValue={rate.game_name} className="input mt-1" />
                </label>
                <label className="block text-sm">Price per period (PHP)
                  <input name="price_php" type="number" min="1" max="100000" step="0.01" required defaultValue={(rate.price_centavos / 100).toFixed(2)} className="input mt-1" />
                </label>
                <label className="block text-sm">Period (minutes)
                  <input name="period_minutes" type="number" min="1" max="1440" required defaultValue={rate.period_minutes} className="input mt-1" />
                </label>
                <label className="block text-sm">Availability
                  <select name="is_active" defaultValue={String(rate.is_active)} className="input mt-1"><option value="false">Inactive</option><option value="true">Active</option></select>
                </label>
              </div>
            </AdminActionForm>
          </article>
        ))}
        <article className="card">
          <h4 className="mb-3 font-bold">Add a game rate</h4>
          <AdminActionForm action={adminSetWalletGameRate} submitLabel="Add inactive game rate">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Game key (lowercase, e.g. chess)
                <input name="game_key" required pattern="[a-z0-9][a-z0-9_-]{1,59}" className="input mt-1" />
              </label>
              <label className="block text-sm">Game name
                <input name="game_name" required maxLength={80} className="input mt-1" />
              </label>
              <label className="block text-sm">Price per period (PHP)
                <input name="price_php" type="number" min="1" max="100000" step="0.01" required defaultValue="1.00" className="input mt-1" />
              </label>
              <label className="block text-sm">Period (minutes)
                <input name="period_minutes" type="number" min="1" max="1440" required defaultValue="30" className="input mt-1" />
              </label>
              <input type="hidden" name="is_active" value="false" />
            </div>
          </AdminActionForm>
        </article>
      </div>
    </section>
  );
}
