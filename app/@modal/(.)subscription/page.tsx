import FloatingModal from "@/components/FloatingModal";
import SubscriptionPage from "@/app/subscription/page";

export default function SubscriptionModalPage({
  searchParams,
}: {
  searchParams?: { intent_id?: string | string[] };
}) {
  return <FloatingModal><SubscriptionPage searchParams={searchParams} compact /></FloatingModal>;
}
