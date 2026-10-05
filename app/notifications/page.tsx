import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MarkNotificationRead from "@/components/community/MarkNotificationRead";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: notifications, error } = await supabase.from("notifications")
    .select("id,type,message,link,is_read,created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header><p className="eyebrow">Your updates</p><h1 className="text-3xl font-bold">Notifications</h1></header>
      {!notifications?.length && <p className="card text-slate-500">You have no notifications yet.</p>}
      {(notifications ?? []).map((notification) => (
        <article className={`card flex flex-wrap items-start justify-between gap-3 ${notification.is_read ? "opacity-75" : "border-violet-300"}`} key={notification.id}>
          <div><p className="font-semibold">{notification.message}</p><p className="mt-1 text-xs capitalize text-slate-500">{notification.type.replaceAll("_", " ")} · {new Date(notification.created_at).toLocaleString()}</p></div>
          <div className="flex gap-2">
            {notification.link && <a className="btn-ghost" href={notification.link}>Open</a>}
            {!notification.is_read && (
              <MarkNotificationRead notificationId={notification.id} />
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
