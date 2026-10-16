"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { replyToSupportConversation, type SupportActionState } from "@/server/support-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Sending..." : "Reply as Support"}</button>;
}

export default function SupportReplyForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useFormState<SupportActionState, FormData>(replyToSupportConversation, null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form ref={formRef} action={action} className="support-chat-composer">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <label htmlFor="support-reply" className="sr-only">Reply as CampusVoice Support</label>
      <textarea id="support-reply" name="body" required maxLength={2000} rows={3} className="input" placeholder="Reply as CampusVoice Support…" />
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton /></div>
    </form>
  );
}
