import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PasswordResetForm from "@/components/community/PasswordResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login?error=verification");
  return <PasswordResetForm />;
}
