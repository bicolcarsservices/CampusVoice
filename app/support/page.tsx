import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import SupportChat, { type SupportMessage } from "@/components/support/SupportChat";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const { data: conversationId, error: conversationError } = await supabase.rpc("get_my_support_conversation");
  const setupNeeded = conversationError?.code === "PGRST202" || conversationError?.code === "42883";
  if (conversationError && !setupNeeded) throw new Error(`Could not open KanyaKanyaNa Support: ${conversationError.message}`);
  if (!setupNeeded && typeof conversationId !== "string") {
    throw new Error("The KanyaKanyaNa Support conversation response was invalid.");
  }

  let messages: SupportMessage[] = [];
  if (typeof conversationId === "string") {
    const { data, error } = await supabase.from("support_messages")
      .select("id,sender_role,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(`Could not load support messages: ${error.message}`);
    messages = (data ?? []) as SupportMessage[];
  }

  return (
    <section className="support-page mx-auto max-w-4xl">
      <header className="support-page-header">
        <Link href="/messages" className="text-sm font-semibold text-brand">← Messages</Link>
        <div className="support-page-title">
          <span className="support-team-avatar" aria-hidden="true">KK</span>
          <div>
            <p className="eyebrow">Private help desk</p>
            <h1 className="text-2xl font-extrabold">KanyaKanyaNa Support</h1>
            <p className="text-sm text-slate-500">Replies come from the support team, not an individual admin account.</p>
          </div>
        </div>
      </header>
      {setupNeeded ? (
        <div className="card mt-4">
          <h2 className="font-bold">Support chat is being set up</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            An administrator needs to run <code>supabase/admin-support.sql</code> in the Supabase SQL Editor.
          </p>
        </div>
      ) : (
        <SupportChat messages={messages} />
      )}
    </section>
  );
}
