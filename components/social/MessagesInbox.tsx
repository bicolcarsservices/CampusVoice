"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import NewGroupChatForm, { type GroupChatProfile } from "@/components/social/NewGroupChatForm";
import type { DirectConversationLink, GroupConversationLink } from "@/components/social/MessageSidebar";

type InboxFriend = {
  id: string;
  username: string;
  display_name: string;
  avatarUrl: string | null;
  online: boolean;
};

export default function MessagesInbox({
  friends,
  directThreads,
  groupThreads,
  profiles,
  groupChatNeedsSetup,
}: {
  friends: InboxFriend[];
  directThreads: DirectConversationLink[];
  groupThreads: GroupConversationLink[];
  profiles: GroupChatProfile[];
  groupChatNeedsSetup: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const query = search.trim().toLocaleLowerCase();

  const visibleDirectThreads = useMemo(() => directThreads.filter((thread) => {
    const name = `${thread.display_name ?? ""} ${thread.username ?? ""} ${thread.last_body ?? ""}`;
    return name.toLocaleLowerCase().includes(query);
  }), [directThreads, query]);
  const visibleGroupThreads = useMemo(() => groupThreads.filter((thread) => {
    return `${thread.name} ${thread.last_body ?? ""}`.toLocaleLowerCase().includes(query);
  }), [groupThreads, query]);

  return (
    <section className="messages-home">
      <div className="messages-inbox">
        <header className="messages-inbox-header">
          <div className="messages-inbox-title">
            <p className="eyebrow">Your campus chats</p>
            <h1>Messages</h1>
          </div>
          <div className="messages-inbox-actions">
            <button
              type="button"
              className="messages-icon-button"
              aria-label={searchOpen ? "Close search" : "Search messages"}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((open) => !open);
                setSearch("");
              }}
            >
              {searchOpen ? "×" : (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 5 5" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="messages-icon-button messages-new-chat-button"
              aria-label={createGroupOpen ? "Close new group chat" : "Create a group chat"}
              aria-expanded={createGroupOpen}
              onClick={() => setCreateGroupOpen((open) => !open)}
            >
              {createGroupOpen ? "×" : "+"}
            </button>
          </div>
        </header>

        {searchOpen && (
          <label className="messages-search">
            <span className="sr-only">Search conversations</span>
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations..."
            />
          </label>
        )}

        {createGroupOpen && (
          <section className="messages-create-group" aria-label="Create a group chat">
            <h2>Create a group chat</h2>
            {groupChatNeedsSetup
              ? <p>Group chats need a one-time database setup. Run <code>supabase/messaging-enhancements.sql</code> in Supabase SQL Editor.</p>
              : <NewGroupChatForm profiles={profiles} />}
          </section>
        )}

        <section className="messages-stories" aria-labelledby="messages-stories-heading">
          <div className="messages-section-heading">
            <h2 id="messages-stories-heading">Stories</h2>
            <span>{friends.length} friends</span>
          </div>
          <div className="messages-story-list">
            {friends.map((friend) => (
              <Link
                key={friend.id}
                href={`/messages/${friend.id}`}
                className="messages-story"
                aria-label={`${friend.display_name}, ${friend.online ? "online" : "offline"}`}
                title={friend.online ? "Online" : "Offline"}
              >
                <span className={`messages-story-avatar${friend.online ? " messages-story-online" : ""}`}>
                  {friend.avatarUrl
                    ? <img src={friend.avatarUrl} alt="" />
                    : <span>{friend.display_name.slice(0, 1).toUpperCase()}</span>}
                  <span className={`messages-online-dot${friend.online ? " messages-online-dot-active" : ""}`} />
                </span>
                <span className="messages-story-name">{friend.display_name.split(/\s+/)[0]}</span>
              </Link>
            ))}
            {!friends.length && (
              <Link href="/dating#online-users" className="messages-story messages-stories-empty">
                <span className="messages-story-avatar messages-story-add">＋</span>
                <span className="messages-story-name">Add friends</span>
              </Link>
            )}
          </div>
        </section>

        <div className="messages-tabs" role="tablist" aria-label="Conversation type">
          <button
            type="button"
            role="tab"
            id="messages-tab-chats"
            aria-selected={activeTab === "chats"}
            aria-controls="messages-panel-chats"
            className={activeTab === "chats" ? "messages-tab messages-tab-active" : "messages-tab"}
            onClick={() => setActiveTab("chats")}
          >
            Chats
          </button>
          <button
            type="button"
            role="tab"
            id="messages-tab-groups"
            aria-selected={activeTab === "groups"}
            aria-controls="messages-panel-groups"
            className={activeTab === "groups" ? "messages-tab messages-tab-active" : "messages-tab"}
            onClick={() => setActiveTab("groups")}
          >
            Groups
          </button>
        </div>

        {activeTab === "chats" ? (
          <div id="messages-panel-chats" role="tabpanel" aria-labelledby="messages-tab-chats" className="messages-conversation-list">
            {visibleDirectThreads.map((thread) => {
              const preview = thread.last_unsent
                ? "This message was unsent"
                : thread.last_body || (thread.last_image ? "Photo" : "Start a conversation");
              return (
                <Link key={thread.other_user_id} href={`/messages/${thread.other_user_id}`} className="messages-conversation">
                  <span className="messages-conversation-avatar">
                    {thread.avatarUrl
                      ? <img src={thread.avatarUrl} alt="" />
                      : <span>{String(thread.display_name ?? "?").slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span className="messages-conversation-copy">
                    <span className="messages-conversation-name">{thread.display_name ?? "Campus member"}</span>
                    <span className="messages-conversation-preview">{preview}</span>
                  </span>
                  {Number(thread.unread_count) > 0 && (
                    <span className="messages-unread-count" aria-label={`${Number(thread.unread_count)} unread messages`}>
                      {Number(thread.unread_count)}
                    </span>
                  )}
                  <span className="messages-conversation-chevron" aria-hidden="true">›</span>
                </Link>
              );
            })}
            {!visibleDirectThreads.length && (
              <div className="messages-empty-list">
                <span aria-hidden="true">✉</span>
                <p>{query ? "No conversations match your search." : "Your private conversations will appear here."}</p>
                {!query && <Link href="/dating#online-users">Find people to message</Link>}
              </div>
            )}
          </div>
        ) : (
          <div id="messages-panel-groups" role="tabpanel" aria-labelledby="messages-tab-groups" className="messages-conversation-list">
            {visibleGroupThreads.map((thread) => (
              <Link key={thread.group_id} href={`/messages/group/${thread.group_id}`} className="messages-conversation">
                <span className="messages-conversation-avatar messages-group-conversation-avatar" aria-hidden="true">✦</span>
                <span className="messages-conversation-copy">
                  <span className="messages-conversation-name">{thread.name}</span>
                  <span className="messages-conversation-preview">{thread.last_body || `${thread.member_count} members`}</span>
                </span>
                <span className="messages-conversation-chevron" aria-hidden="true">›</span>
              </Link>
            ))}
            {!visibleGroupThreads.length && (
              <div className="messages-empty-list">
                <span aria-hidden="true">✦</span>
                <p>{query ? "No groups match your search." : "Your group conversations will appear here."}</p>
                {!query && <button type="button" onClick={() => setCreateGroupOpen(true)}>Create a group chat</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
