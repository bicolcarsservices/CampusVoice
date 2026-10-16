import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SupportConversation = {
  conversation_id: string;
  user_id: string;
  username: string;
  display_name: string;
  last_message: string | null;
  last_message_at: string | null;
  message_count: number;
};

export default async function AdminSupportPage() {
  const { data, error } = await createClient().rpc("list_support_conversations");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return (
        <section className="card">
          <h2 className="font-bold">Support inbox is not set up</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Run <code>supabase/admin-support.sql</code> in the Supabase SQL Editor to enable the private support inbox.
          </p>
        </section>
      );
    }
    throw new Error(`Could not load the support inbox: ${error.message}`);
  }
  const conversations = (data ?? []) as SupportConversation[];

  return (
    <section className="space-y-4">
      <header>
        <p className="eyebrow">CampusVoice Support</p>
        <h2 className="text-2xl font-extrabold">Support inbox</h2>
        <p className="mt-1 text-sm text-slate-500">Reply as the CampusVoice Support team. Personal admin identities are not shown to members.</p>
      </header>
      {!conversations.length && <p className="card text-sm text-slate-500">There are no support conversations yet.</p>}
      <div className="support-inbox-list">
        {conversations.map((conversation) => (
          <Link key={conversation.conversation_id} href={`/admin/support/${conversation.conversation_id}`} className="support-inbox-item">
            <span className="avatar-fallback h-12 w-12">{conversation.display_name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{conversation.display_name} <span className="font-normal text-slate-500">@{conversation.username}</span></span>
                <time className="text-xs text-slate-500">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : "New"}</time>
              </span>
              <span className="block truncate text-sm text-slate-500">{conversation.last_message || "No messages yet"}</span>
            </span>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">{conversation.message_count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
