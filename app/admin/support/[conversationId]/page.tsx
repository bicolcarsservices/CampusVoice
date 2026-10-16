import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupportReplyForm from "@/components/support/SupportReplyForm";
import type { SupportMessage } from "@/components/support/SupportChat";

export const dynamic = "force-dynamic";

export default async function AdminSupportConversationPage({ params }: { params: { conversationId: string } }) {
  const supabase = createClient();
  const { data: conversation, error: conversationError } = await supabase.from("support_conversations")
    .select("id,user_id,created_at")
    .eq("id", params.conversationId)
    .maybeSingle();
  if (conversationError) throw new Error(`Could not load support conversation: ${conversationError.message}`);
  if (!conversation) notFound();

  const [{ data: profile, error: profileError }, { data, error: messagesError }] = await Promise.all([
    supabase.from("public_profiles").select("username,display_name").eq("id", conversation.user_id).maybeSingle(),
    supabase.from("support_messages")
      .select("id,sender_role,body,created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);
  if (profileError) throw new Error(`Could not load support member: ${profileError.message}`);
  if (messagesError) throw new Error(`Could not load support messages: ${messagesError.message}`);
  if (!profile) notFound();
  const messages = (data ?? []) as SupportMessage[];

  return (
    <section className="support-admin-thread">
      <header className="support-admin-header">
        <div>
          <Link href="/admin/support" className="text-sm font-semibold text-brand">← Support inbox</Link>
          <p className="eyebrow mt-3">Private support conversation</p>
          <h2 className="text-2xl font-extrabold">{profile.display_name}</h2>
          <p className="text-sm text-slate-500">@{profile.username}</p>
        </div>
        <span className="support-team-avatar" aria-label="Replying as CampusVoice Support">CV</span>
      </header>
      <div className="support-admin-messages">
        {!messages.length && <p className="text-sm text-slate-500">The member has not sent a message yet.</p>}
        {messages.map((message) => {
          const fromSupport = message.sender_role === "support";
          return (
            <article key={message.id} className={`support-message-row${fromSupport ? " support-message-row-user" : " support-message-row-team"}`}>
              {!fromSupport && <span className="support-team-avatar support-team-avatar-small" aria-hidden="true">{profile.display_name.slice(0, 1).toUpperCase()}</span>}
              <div className={`support-message-bubble${fromSupport ? " support-message-bubble-user" : " support-message-bubble-team"}`}>
                <p className="support-message-sender">{fromSupport ? "CampusVoice Support" : profile.display_name}</p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <time className="support-message-time" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
              </div>
            </article>
          );
        })}
      </div>
      <SupportReplyForm conversationId={conversation.id} />
    </section>
  );
}
