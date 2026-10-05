"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteMyPost } from "@/server/community-actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="text-xs font-semibold text-red-700" disabled={pending}>{pending ? "Deleting..." : "Delete"}</button>;
}

export default function DeletePostForm({ postId }: { postId: string }) {
  const [state, action] = useFormState(deleteMyPost, null);
  return (
    <form action={action}>
      <input type="hidden" name="post_id" value={postId} />
      <DeleteButton />
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
