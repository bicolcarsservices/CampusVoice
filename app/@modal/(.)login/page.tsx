import FloatingModal from "@/components/FloatingModal";
import LoginPage from "@/app/(auth)/login/page";

export default function LoginModalPage({
  searchParams,
}: {
  searchParams?: { error?: string; registered?: string; next?: string; notice?: string };
}) {
  return <FloatingModal><LoginPage searchParams={searchParams} /></FloatingModal>;
}
