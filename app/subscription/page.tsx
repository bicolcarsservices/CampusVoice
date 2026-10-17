import SubscriptionPlans from "@/components/SubscriptionPlans";

export const dynamic = "force-dynamic";

export default function SubscriptionPage({
  searchParams,
}: {
  searchParams?: { intent_id?: string | string[] };
}) {
  return <SubscriptionPlans searchParams={searchParams} />;
}
