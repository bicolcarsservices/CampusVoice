import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import PasswordResetForm from "@/components/community/PasswordResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const { user } = await getAuthUser(createClient());
  if (!user) redirect("/login?error=verification");
  return <PasswordResetForm />;
}
