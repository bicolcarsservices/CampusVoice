"use client";
import { useFormState, useFormStatus } from "react-dom";
import { register } from "@/server/auth-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Creating..." : "Create Account"}</button>;
}

export default function RegisterForm({ schools, next }: { schools: { id: string; name: string }[]; next?: string }) {
  const [state, action] = useFormState(register, null);
  return (
    <form action={action} className="space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block text-sm">Full name<input name="full_name" required className="input mt-1" /></label>
      <label className="block text-sm">Username<input name="username" required className="input mt-1" /></label>
      <label className="block text-sm">Email<input name="email" type="email" required className="input mt-1" /></label>
      <label className="block text-sm">Password<input name="password" type="password" required minLength={8} className="input mt-1" /></label>
      <label className="block text-sm">School <span className="text-slate-500">(optional)</span>
        <input name="school_name" list="registration-schools" maxLength={100} className="input mt-1" placeholder="Type your school or leave blank" />
        <datalist id="registration-schools">
          {schools.map((school) => <option key={school.id} value={school.name} />)}
        </datalist>
      </label>
      <label className="block text-sm">Grade / Year level<input name="grade_level" required className="input mt-1" /></label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
