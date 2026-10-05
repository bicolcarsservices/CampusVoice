"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteMyComment } from "@/server/community-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="text-xs font-semibold text-red-700" disabled={pending}>{pending ? "Deleting..." : "Delete"}</button>;
}

export default function DeleteCommentForm({ commentId }: { commentId: string }) {
  const [state, action] = useFormState(deleteMyComment, null);
  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="comment_id" value={commentId} />
      <SubmitButton />
      {state?.error && <span className="ml-2 text-xs text-red-700" role="alert">{state.error}</span>}
    </form>
  );
}
