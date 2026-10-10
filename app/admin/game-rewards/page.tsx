import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { adminReviewGameReward } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const rewardLabels: Record<string, string> = {
  load10: "₱10 mobile load",
  gosurf59: "₱59 GoSURF load",
};

export default async function AdminGameRewardsPage() {
  const { data: claims, error } = await createClient().from("game_reward_claims")
    .select("id,user_id,reward_code,required_coins,recipient_name,recipient_email,recipient_phone,status,created_at,review_note")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load Campus Coin Rush reward claims: ${error.message}`);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-bold">Campus Coin Rush reward claims</h2>
        <p className="text-sm text-slate-500">
          Review claims and manually send the requested load around 9 PM. Mark a claim fulfilled only after sending the load; no mobile load is sent automatically.
        </p>
      </header>
      {!claims?.length && <p className="card text-slate-500">No game reward claims yet.</p>}
      {(claims ?? []).map((claim) => (
        <article className="card space-y-3" key={claim.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-bold">{rewardLabels[claim.reward_code] ?? claim.reward_code}</h3>
            <span className="tag capitalize">{claim.status}</span>
          </div>
          <p className="text-sm">Recipient: <strong>{claim.recipient_name}</strong></p>
          <p className="text-sm">Email: <a className="text-brand underline" href={`mailto:${claim.recipient_email}`}>{claim.recipient_email}</a></p>
          <p className="text-sm">Phone: <a className="text-brand underline" href={`tel:${claim.recipient_phone}`}>{claim.recipient_phone}</a></p>
          <p className="text-xs text-slate-500">
            Submitted {new Date(claim.created_at).toLocaleString()} · requires {claim.required_coins.toLocaleString("en-US")} Coins · user {claim.user_id}
          </p>
          {claim.review_note && <p className="text-sm text-slate-500">Admin note: {claim.review_note}</p>}
          {claim.status === "pending" && (
            <div className="grid gap-3 md:grid-cols-2">
              {(["fulfilled", "rejected"] as const).map((decision) => (
                <AdminActionForm
                  key={decision}
                  action={adminReviewGameReward}
                  submitLabel={decision === "fulfilled" ? "Mark load sent" : "Reject claim"}
                >
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <input type="hidden" name="decision" value={decision} />
                  <label className="block text-sm">Admin note
                    <input
                      name="reason"
                      required={decision === "fulfilled"}
                      maxLength={500}
                      className="input mt-1"
                      placeholder={decision === "fulfilled" ? "Load reference / fulfillment note" : "Reason for rejection"}
                    />
                  </label>
                </AdminActionForm>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
