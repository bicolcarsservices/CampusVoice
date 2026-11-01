import type { User } from "@supabase/supabase-js";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";
import PublicNavbar from "@/components/PublicNavbar";
import AnnouncementDock, { type PublicAnnouncement } from "@/components/AnnouncementDock";
import PresenceHeartbeat from "@/components/social/PresenceHeartbeat";
import SubscriptionApprovalToast from "@/components/SubscriptionApprovalToast";
import SubscriptionPaymentStatus from "@/components/SubscriptionPaymentStatus";
import WalletTopupStatus, { type WalletTopupRequest } from "@/components/WalletTopupStatus";
import WalletWithdrawalStatus, { type WalletWithdrawalRequest } from "@/components/WalletWithdrawalStatus";

export default async function Navbar() {
  let user: User | null = null;
  let isAdmin = false;
  let announcements: PublicAnnouncement[] = [];
  let paymentStatusError = false;
  let latestTopupRequest: WalletTopupRequest | null = null;
  let latestWithdrawalRequest: WalletWithdrawalRequest | null = null;
  let latestPaymentRequest: {
    id: string;
    status: string;
    planName: string;
    amount: number;
    createdAt: string;
    paymentReference: string | null;
  } | null = null;
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const [
      { user: sessionUser, error },
      { data: adminAccess, error: adminError },
      { data, error: announcementsError },
    ] = await Promise.all([
      getAuthUser(supabase),
      supabase.rpc("is_admin"),
      supabase.from("announcements")
        .select("id,title,body")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (error) console.error("Could not verify the signed-in user for navigation.", error);
    user = sessionUser;
    if (user && adminError) console.error("Could not verify administrator access for navigation.", adminError);
    else isAdmin = Boolean(user && adminAccess === true);
    if (announcementsError) throw new Error(`Could not load KanyaKanyaNa announcements: ${announcementsError.message}`);
    announcements = data ?? [];
    if (user) {
      const { data: paymentRequest, error: paymentRequestError } = await supabase.from("subscriptions")
        .select("id,status,created_at,payment_method,payment_reference,subscription_plans(name,price_php)")
        .eq("user_id", user.id)
        .in("payment_method", ["maya", "gcash"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (paymentRequestError) {
        console.error("Could not load payment status for navigation.", paymentRequestError);
        paymentStatusError = true;
      } else if (paymentRequest) {
        const plan = Array.isArray(paymentRequest.subscription_plans)
          ? paymentRequest.subscription_plans[0]
          : paymentRequest.subscription_plans;
        latestPaymentRequest = {
          id: paymentRequest.id,
          status: paymentRequest.status,
          planName: plan?.name ?? "CampusVoice",
          amount: Number(plan?.price_php ?? 0),
          createdAt: paymentRequest.created_at,
          paymentReference: paymentRequest.payment_reference,
        };
      }
      const { data: topupRequest, error: topupRequestError } = await supabase.from("wallet_topup_requests")
        .select("id,amount_centavos,received_centavos,fee_centavos,credited_centavos,status,payment_reference,review_note,created_at,reviewed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (topupRequestError) {
        console.error("Could not load wallet top-up status for navigation.", topupRequestError);
      } else if (topupRequest) {
        latestTopupRequest = {
          ...topupRequest,
          status: topupRequest.status as WalletTopupRequest["status"],
        };
      }
      const { data: withdrawalRequest, error: withdrawalRequestError } = await supabase.from("wallet_withdrawal_requests")
        .select("id,amount_centavos,payout_method,status,review_note,created_at,reviewed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (withdrawalRequestError) {
        console.error("Could not load wallet withdrawal status for navigation.", withdrawalRequestError);
      } else if (withdrawalRequest) {
        latestWithdrawalRequest = {
          ...withdrawalRequest,
          status: withdrawalRequest.status as WalletWithdrawalRequest["status"],
        };
      }
    }
  }

  return (
    <>
      {user && <PresenceHeartbeat />}
      {user && !isAdmin && <SubscriptionApprovalToast />}
      {user && <SubscriptionPaymentStatus initialRequest={latestPaymentRequest} />}
      {user && latestTopupRequest && <WalletTopupStatus initialRequest={latestTopupRequest} />}
      {user && latestWithdrawalRequest && <WalletWithdrawalStatus initialRequest={latestWithdrawalRequest} />}
      {user && paymentStatusError && (
        <p
          role="status"
          className="fixed bottom-24 right-4 z-[60] max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          Payment status is temporarily unavailable. Please try again later.
        </p>
      )}
      <PublicNavbar signedIn={Boolean(user)} />
      <AnnouncementDock announcements={announcements} signedIn={Boolean(user)} />
    </>
  );
}
