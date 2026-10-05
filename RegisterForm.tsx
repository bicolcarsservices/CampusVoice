"use client";
import { useFormState, useFormStatus } from "react-dom";
import { register } from "@/server/auth-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating..." : "Create Account"}</button>;
}

export default function RegisterForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, action] = useFormState(register, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">Full name<input name="full_name" required className="input mt-1" /></label>
      <label className="block text-sm">Username<input name="username" required className="input mt-1" /></label>
      <label className="block text-sm">Email<input name="email" type="email" required className="input mt-1" /></label>
      <label className="block text-sm">Password<input name="password" type="password" required minLength={8} className="input mt-1" /></label>
      <label className="block text-sm">School
        <select name="school_id" required defaultValue="" className="input mt-1">
          <option value="" disabled>Choose your school</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Grade / Year level<input name="grade_level" required className="input mt-1" /></label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
