"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addProfilePhoto } from "@/server/dating-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Posting..." : "Post photo"}</button>;
}

export default function ProfilePhotoComposer() {
  const [state, action] = useFormState(addProfilePhoto, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="text-xl font-bold">Profile photos</h2>
      <p className="text-sm text-slate-500">These photos stay on your profile view. They are not posted to the Freedom Wall.</p>
      <label className="block text-sm font-medium">Photo
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="input mt-1" />
      </label>
      <label className="block text-sm font-medium">Caption <span className="text-slate-500">(optional)</span>
        <input name="caption" maxLength={200} className="input mt-1" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      <Submit />
    </form>
  );
}
