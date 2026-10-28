import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; registered?: string; next?: string };
}) {
  return <LoginForm searchParams={searchParams} />;
}
