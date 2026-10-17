import FloatingModal from "@/components/FloatingModal";
import SubscriptionPlans from "@/components/SubscriptionPlans";

export default function SubscriptionModalPage({
  searchParams,
}: {
  searchParams?: { intent_id?: string | string[] };
}) {
  return <FloatingModal><SubscriptionPlans searchParams={searchParams} compact /></FloatingModal>;
}
