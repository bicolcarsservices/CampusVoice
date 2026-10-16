import Link from "next/link";

export type DirectConversationLink = {
  other_user_id: string;
  username: string | null;
  display_name: string | null;
  avatarUrl: string | null;
  last_body: string | null;
  last_image: boolean | null;
  last_unsent: boolean | null;
  unread_count: number | null;
};

export type GroupConversationLink = {
  group_id: string;
  name: string;
  last_body: string | null;
  member_count: number;
};

export default function MessageSidebar({
  directThreads,
  groupThreads,
  activeThreadId,
}: {
  directThreads: DirectConversationLink[];
  groupThreads: GroupConversationLink[];
  activeThreadId: string;
}) {
  return (
    <aside className="messenger-thread-sidebar">
      <div className="messenger-thread-sidebar-heading">
        <div>
          <p className="eyebrow">CampusVoice</p>
          <h2 className="text-lg font-extrabold">Chats</h2>
        </div>
        <Link href="/dating#new-group-chat" className="messenger-new-chat" aria-label="Create a group chat" title="Create group chat">＋</Link>
      </div>
      <div className="messenger-thread-list">
        {groupThreads.map((thread) => (
          <Link key={thread.group_id} href={`/messages/group/${thread.group_id}`} className={`messenger-conversation${activeThreadId === thread.group_id ? " messenger-conversation-active" : ""}`}>
            <span className="messenger-group-avatar" aria-hidden="true">✦</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{thread.name}</span>
              <span className="block truncate text-sm text-slate-500">{thread.last_body || `${thread.member_count} members`}</span>
            </span>
          </Link>
        ))}
        {directThreads.map((thread) => (
          <Link key={thread.other_user_id} href={`/messages/${thread.other_user_id}`} className={`messenger-conversation${activeThreadId === thread.other_user_id ? " messenger-conversation-active" : ""}`}>
            {thread.avatarUrl
              ? <img src={thread.avatarUrl} alt="" className="avatar-fallback h-12 w-12 object-cover" />
              : <span className="avatar-fallback h-12 w-12">{String(thread.display_name ?? "?").slice(0, 1).toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{thread.display_name ?? "Campus member"}</span>
              <span className="block truncate text-sm text-slate-500">
                {thread.last_unsent ? "This message was unsent" : thread.last_body || (thread.last_image ? "Photo" : "Message")}
              </span>
            </span>
            {Number(thread.unread_count) > 0 && <span className="rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">{Number(thread.unread_count)}</span>}
          </Link>
        ))}
        {!directThreads.length && !groupThreads.length && <p className="p-4 text-sm text-slate-500">Your conversations will appear here.</p>}
      </div>
      <Link href="/dating#messages" className="messenger-all-chats">All messages</Link>
    </aside>
  );
}
