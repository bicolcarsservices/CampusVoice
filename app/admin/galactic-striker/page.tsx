import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { adminReviewGalacticConversion, adminReviewGalacticWithdrawal } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const formatPhp = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export default async function AdminGalacticStrikerPage() {
  const supabase = createClient();
  const [{ data: conversions, error: conversionError }, { data: withdrawals, error: withdrawalError }] = await Promise.all([
    supabase.from("galactic_conversion_requests")
      .select("id,user_id,subscription_id,plan_code,crystals,amount_centavos,status,created_at,review_note")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("galactic_withdrawal_requests")
      .select("id,user_id,amount_centavos,vat_centavos,payout_centavos,payout_method,account_name,account_email,account_number,status,created_at,review_note")
      .order("created_at", { ascending: false }).limit(100),
  ]);
  if (conversionError) throw new Error(`Could not load Galactic Striker conversions: ${conversionError.message}`);
  if (withdrawalError) throw new Error(`Could not load Galactic Striker withdrawals: ${withdrawalError.message}`);

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <header>
          <h2 className="text-2xl font-bold">Galactic Striker crystal conversions</h2>
          <p className="text-sm text-slate-500">Crystal totals come from the browser and are not server-verified. Verify each request before approval; approved conversions are credited to the separate game earnings balance.</p>
        </header>
        {!conversions?.length && <p className="card text-slate-500">No conversion requests yet.</p>}
        {(conversions ?? []).map((conversion) => (
          <article className="card space-y-3" key={conversion.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-bold">{conversion.crystals.toLocaleString("en-US")} crystals → {formatPhp(conversion.amount_centavos)} · {conversion.plan_code}</h3>
              <span className="tag capitalize">{conversion.status}</span>
            </div>
            <p className="text-xs text-slate-500">User {conversion.user_id} · subscription {conversion.subscription_id} · {new Date(conversion.created_at).toLocaleString()}</p>
            {conversion.review_note && <p className="text-sm text-slate-500">Admin note: {conversion.review_note}</p>}
            {conversion.status === "pending" && (
              <div className="grid gap-3 md:grid-cols-2">
                {(["approved", "rejected"] as const).map((decision) => (
                  <AdminActionForm
                    key={decision}
                    action={adminReviewGalacticConversion}
                    submitLabel={decision === "approved" ? "Approve conversion" : "Reject conversion"}
                  >
                    <input type="hidden" name="request_id" value={conversion.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <label className="block text-sm">Review note
                      <input name="reason" maxLength={500} className="input mt-1" placeholder="Verification note" />
                    </label>
                  </AdminActionForm>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="space-y-4">
        <header>
          <h2 className="text-2xl font-bold">Galactic Striker payouts</h2>
          <p className="text-sm text-slate-500">Verify the payout details, approve, send the net amount manually, then mark the request paid. Rejection returns the gross amount to the user's game earnings balance.</p>
        </header>
        {!withdrawals?.length && <p className="card text-slate-500">No payout requests yet.</p>}
        {(withdrawals ?? []).map((withdrawal) => (
          <article className="card space-y-3" key={withdrawal.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-bold">{formatPhp(withdrawal.amount_centavos)} requested · {formatPhp(withdrawal.vat_centavos)} VAT · {formatPhp(withdrawal.payout_centavos)} net</h3>
              <span className="tag capitalize">{withdrawal.status}</span>
            </div>
            <p className="text-sm">Recipient: <strong>{withdrawal.account_name}</strong> · {withdrawal.payout_method}</p>
            <p className="text-sm">Email: <a className="text-brand underline" href={`mailto:${withdrawal.account_email}`}>{withdrawal.account_email}</a></p>
            <p className="text-sm">Account number: <strong>{withdrawal.account_number}</strong></p>
            <p className="text-xs text-slate-500">User {withdrawal.user_id} · Submitted {new Date(withdrawal.created_at).toLocaleString()}</p>
            {withdrawal.review_note && <p className="text-sm text-slate-500">Admin note: {withdrawal.review_note}</p>}
            {withdrawal.status === "pending" && (
              <div className="grid gap-3 md:grid-cols-2">
                {(["approve", "reject"] as const).map((decision) => (
                  <AdminActionForm key={decision} action={adminReviewGalacticWithdrawal} submitLabel={decision === "approve" ? "Approve payout" : "Reject and return balance"}>
                    <input type="hidden" name="request_id" value={withdrawal.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <label className="block text-sm">Admin note
                      <input name="reason" maxLength={500} className="input mt-1" placeholder="Optional note" />
                    </label>
                  </AdminActionForm>
                ))}
              </div>
            )}
            {withdrawal.status === "approved" && (
              <div className="grid gap-3 md:grid-cols-2">
                <AdminActionForm action={adminReviewGalacticWithdrawal} submitLabel="Mark payout paid">
                  <input type="hidden" name="request_id" value={withdrawal.id} />
                  <input type="hidden" name="decision" value="paid" />
                  <label className="block text-sm">Payment reference / note
                    <input name="reason" required maxLength={500} className="input mt-1" />
                  </label>
                </AdminActionForm>
                <AdminActionForm action={adminReviewGalacticWithdrawal} submitLabel="Reject and return balance">
                  <input type="hidden" name="request_id" value={withdrawal.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <label className="block text-sm">Reason
                    <input name="reason" maxLength={500} className="input mt-1" />
                  </label>
                </AdminActionForm>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
