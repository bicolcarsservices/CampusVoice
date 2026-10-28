"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { sendSupportMessage, type SupportActionState } from "@/server/support-actions";

export type SupportMessage = {
  id: string;
  sender_role: "user" | "support";
  body: string;
  created_at: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Sending..." : "Send message"}</button>;
}

export default function SupportChat({ messages }: { messages: SupportMessage[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [state, action] = useFormState<SupportActionState, FormData>(sendSupportMessage, null);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 6000);
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

  return (
    <div className="support-chat-panel">
      <div className="support-message-list" aria-live="polite">
        {!messages.length && (
          <div className="support-welcome">
            <span className="support-team-avatar" aria-hidden="true">KK</span>
            <h2 className="text-lg font-bold">Welcome to KanyaKanyaNa Support</h2>
            <p className="max-w-sm text-sm text-slate-500">Send us a message and our support team will reply here. This is a separate support inbox, not a personal admin chat.</p>
          </div>
        )}
        {messages.map((message) => {
          const fromSupport = message.sender_role === "support";
          return (
            <article key={message.id} className={`support-message-row${fromSupport ? " support-message-row-team" : " support-message-row-user"}`}>
              {fromSupport && <span className="support-team-avatar support-team-avatar-small" aria-label="KanyaKanyaNa Support">KK</span>}
              <div className={`support-message-bubble${fromSupport ? " support-message-bubble-team" : " support-message-bubble-user"}`}>
                {fromSupport && <p className="support-message-sender">KanyaKanyaNa Support</p>}
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <time className="support-message-time" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      <form ref={formRef} action={action} className="support-chat-composer">
        <label htmlFor="support-message" className="sr-only">Message KanyaKanyaNa Support</label>
        <textarea id="support-message" name="body" required maxLength={2000} rows={2} className="input" placeholder="Message KanyaKanyaNa Support…" />
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <div className="flex justify-end"><SubmitButton /></div>
      </form>
    </div>
  );
}
