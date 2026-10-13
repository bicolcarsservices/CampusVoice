import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ChatThread from "@/components/social/ChatThread";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({ params }: { params: { userId: string } }) {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");
  if (params.userId === user.id) redirect("/messages");

  const { data: profile, error: profileError } = await supabase.from("public_profiles")
    .select("id,username,display_name,avatar_path")
    .eq("id", params.userId)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load chat: ${profileError.message}`);
  if (!profile) notFound();

  await supabase.rpc("mark_thread_read", { p_other_user_id: profile.id });

  const { data: rows, error } = await supabase.from("direct_messages")
    .select("id,sender_id,recipient_id,body,image_path,created_at,unsent_at")
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${user.id})`)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not load messages: ${error.message}`);

  const messages = (rows ?? []).map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    body: row.body,
    image_path: row.image_path,
    created_at: row.created_at,
    unsent_at: row.unsent_at,
    imageUrl: row.image_path
      ? supabase.storage.from("chat-images").getPublicUrl(row.image_path).data.publicUrl
      : null,
  }));

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/dating#messages" className="text-sm font-semibold text-brand">← Messages</Link>
          <h1 className="text-2xl font-extrabold">{profile.display_name}</h1>
          <Link href={`/dating/${profile.username}`} className="text-sm text-slate-500">@{profile.username} · View</Link>
        </div>
      </div>
      <ChatThread recipientId={profile.id} currentUserId={user.id} messages={messages} />
    </section>
  );
}
