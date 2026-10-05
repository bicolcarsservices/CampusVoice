import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import RegisterForm from "@/components/RegisterForm";

export default async function RegisterPage() {
  if (!hasSupabaseConfig()) {
    return (
      <div className="card mx-auto max-w-lg">
        <h1 className="mb-3 text-2xl font-bold">Create Account</h1>
        <p className="text-slate-600">
          Supabase is not configured yet. Add your project URL and anon key to <code>.env.local</code> to enable registration.
        </p>
      </div>
    );
  }

  const { data } = await createClient().from("schools").select("id,name").order("name");
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">Create Account</h1>
      <RegisterForm schools={data ?? []} />
    </div>
  );
}
