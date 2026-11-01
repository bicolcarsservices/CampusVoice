import { notFound, redirect } from "next/navigation";
import SubscriptionPaymentStatus from "@/components/SubscriptionPaymentStatus";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SubscriptionPaymentStatusPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { receipt?: string | string[] };
}) {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError) throw new Error(`Could not verify your account: ${authError.message}`);
  if (!user) redirect("/login");

  const { data: request, error } = await supabase.from("subscriptions")
    .select("id,status,created_at,payment_reference,subscription_plans(name,price_php)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load payment status: ${error.message}`);
  if (!request) notFound();

  const plan = Array.isArray(request.subscription_plans)
    ? request.subscription_plans[0]
    : request.subscription_plans;

  return (
    <SubscriptionPaymentStatus
      pageMode
      showReceiptInitially={searchParams?.receipt === "1"}
      initialRequest={{
        id: request.id,
        status: request.status,
        planName: plan?.name ?? "CampusVoice",
        amount: Number(plan?.price_php ?? 0),
        createdAt: request.created_at,
        paymentReference: request.payment_reference,
      }}
    />
  );
}
