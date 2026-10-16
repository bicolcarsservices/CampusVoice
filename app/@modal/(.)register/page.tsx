import FloatingModal from "@/components/FloatingModal";
import RegisterPage from "@/app/(auth)/register/page";

export default function RegisterModalPage({ searchParams }: { searchParams?: { next?: string } }) {
  return <FloatingModal><RegisterPage searchParams={searchParams} /></FloatingModal>;
}
