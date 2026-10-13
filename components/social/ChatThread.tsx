"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { sendDirectMessage, unsendDirectMessage } from "@/server/dating-actions";

export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  unsent_at: string | null;
  imageUrl: string | null;
};

function SendButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Sending..." : "Send"}</button>;
}

function UnsendButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="text-xs font-semibold text-slate-500 hover:text-red-700" disabled={pending}>{pending ? "Unsending..." : "Unsend"}</button>;
}

export default function ChatThread({
  recipientId,
  currentUserId,
  messages,
}: {
  recipientId: string;
  currentUserId: string;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const [state, action] = useFormState(sendDirectMessage, null);
  const [unsendState, unsendAction] = useFormState(unsendDirectMessage, null);
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state?.success, router]);

  useEffect(() => {
    if (unsendState?.success) router.refresh();
  }, [unsendState?.success, router]);

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
        {!messages.length && <p className="text-sm text-slate-500">No messages yet. Say hello.</p>}
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          const unsent = Boolean(message.unsent_at);
          return (
            <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] space-y-1 ${mine ? "text-right" : "text-left"}`}>
                <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"} ${unsent ? "chat-bubble-unsent" : ""}`}>
                  {unsent ? (
                    <p className="italic">This message was unsent</p>
                  ) : (
                    <>
                      {message.imageUrl && (
                        <img src={message.imageUrl} alt="" className="mb-2 max-h-64 rounded-xl object-cover" />
                      )}
                      {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{new Date(message.created_at).toLocaleString()}</p>
                {mine && !unsent && (
                  <form action={unsendAction}>
                    <input type="hidden" name="message_id" value={message.id} />
                    <UnsendButton />
                  </form>
                )}
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      {unsendState?.error && <p role="alert" className="mt-2 text-sm text-red-700">{unsendState.error}</p>}
      <form ref={formRef} action={action} className="mt-4 space-y-3">
        <input type="hidden" name="recipient_id" value={recipientId} />
        <label className="block text-sm">Message
          <textarea name="body" maxLength={2000} rows={3} className="input mt-1" placeholder="Write a message" />
        </label>
        <label className="block text-sm">Photo <span className="text-slate-500">(optional)</span>
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="input mt-1" />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <SendButton />
      </form>
    </div>
  );
}
