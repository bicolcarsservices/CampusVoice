"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addComment, reportContent, toggleReaction } from "@/server/community-actions";
import DeleteCommentForm from "@/components/community/DeleteCommentForm";

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  reaction_count: number;
  isMine: boolean;
  liked: boolean;
};

type Post = {
  id: string;
  created_at: string;
  content: string;
  image_path: string | null;
  school_id: string | null;
  category_id: string | null;
  reaction_count: number;
  comment_count: number;
  is_anonymous: boolean;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
};

const postReactions = [
  { kind: "like", label: "Like", emoji: "👍" },
  { kind: "love", label: "Love", emoji: "❤️" },
  { kind: "haha", label: "Haha", emoji: "😂" },
  { kind: "sad", label: "Cry", emoji: "😢" },
  { kind: "angry", label: "Angry", emoji: "😡" },
] as const;

const categoryToneByName: Record<string, number> = {
  rant: 0,
  shoutout: 1,
  confession: 2,
  question: 3,
  advice: 4,
  experience: 5,
  appreciation: 6,
  achievement: 7,
};

function getCategoryTone(name: string) {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const assignedTone = categoryToneByName[normalizedName];
  if (assignedTone !== undefined) return assignedTone;

  let hash = 0;
  for (const character of normalizedName) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % 8;
}

function PendingButton({
  children,
  className,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className} aria-label={ariaLabel} aria-pressed={ariaPressed} title={title}>{pending ? "Sending..." : children}</button>;
}

export default function PostCard({
  post,
  schoolName,
  categoryName,
  imageUrl,
  comments,
  canInteract,
  reactionKind,
}: {
  post: Post;
  schoolName: string;
  categoryName: string;
  imageUrl: string | null;
  comments: CommentItem[];
  canInteract: boolean;
  reactionKind: string | null;
}) {
  const [commentState, commentAction] = useFormState(addComment, null);
  const [reportState, reportAction] = useFormState(reportContent, null);
  const [reactionState, reactionAction] = useFormState(toggleReaction, null);
  const [shareMessage, setShareMessage] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const selectedReaction = postReactions.find((reaction) => reaction.kind === reactionKind);
  const name = post.is_anonymous ? "Anonymous" : post.display_name || post.username || "Community member";

  async function sharePost() {
    const url = `${window.location.origin}/wall#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} on KanyaKanyaNa`, url });
        setShareMessage("Post shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Post link copied.");
      }
      window.setTimeout(() => setShareMessage(""), 2200);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Could not share this post.", error);
      setShareMessage("Could not share this post.");
    }
  }

  function toggleComments() {
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    window.setTimeout(() => commentInputRef.current?.focus(), 0);
  }

  return (
    <article id={`post-${post.id}`} className="card feed-post-card space-y-4">
      <header className="feed-post-header flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {post.is_anonymous || !post.avatar_path ? (
            <div className={`avatar-fallback feed-post-avatar${post.is_anonymous ? " feed-post-avatar-anonymous" : ""}`} aria-hidden="true">{post.is_anonymous ? "?" : name.slice(0, 1).toUpperCase()}</div>
          ) : (
            <img src={post.avatar_path} alt="" className="avatar-fallback feed-post-avatar object-cover" />
          )}
          <div className="feed-post-author-block min-w-0">
            <p className="feed-post-author truncate font-semibold">
              {post.is_anonymous || !post.username ? name : <Link href={`/profile/${encodeURIComponent(post.username)}`} className="hover:text-brand">{name}</Link>}
            </p>
            <p className="feed-post-meta text-xs text-slate-500">
              {schoolName} · {new Date(post.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <span className={`tag feed-post-category post-category-badge post-category-badge--${getCategoryTone(categoryName)}`}>
          {categoryName}
        </span>
      </header>

      {imageUrl && <img src={imageUrl} alt="Image attached to post" className="post-image feed-post-image" />}
      <p className="feed-post-content whitespace-pre-wrap break-words">
        <strong className="feed-post-caption-author">{name}</strong>{" "}{post.content}
      </p>

      <div className="feed-post-actions">
        {canInteract ? (
          <details className="feed-post-reaction-picker">
            <summary
              aria-label={selectedReaction ? `Change reaction, currently ${selectedReaction.label}` : "Choose a reaction"}
              title={selectedReaction?.label ?? "React"}
              className={`feed-post-action-button feed-post-like${selectedReaction ? " feed-post-action-selected" : ""}`}
            >
              {selectedReaction ? selectedReaction.emoji : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                </svg>
              )}
            </summary>
            <div className="feed-post-reaction-options" role="group" aria-label="Choose a reaction">
              {postReactions.map((reaction) => (
              <form action={reactionAction} key={reaction.kind}>
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="kind" value={reaction.kind} />
                <PendingButton
                  className={`feed-post-reaction-option${reactionKind === reaction.kind ? " feed-post-reaction-selected" : ""}`}
                  aria-label={`${reaction.label}, ${post.reaction_count} reactions`}
                  aria-pressed={reactionKind === reaction.kind}
                  title={reaction.label}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                </PendingButton>
              </form>
              ))}
            </div>
          </details>
        ) : (
          <span className="feed-post-action-button feed-post-like" aria-label={`${post.reaction_count} reactions`} title="Reactions">
            {selectedReaction?.emoji ?? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
              </svg>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={toggleComments}
          aria-expanded={commentsOpen}
          aria-label={`${post.comment_count} comments`}
          title="Comments"
          className="feed-post-action-button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.2-4.2A8.4 8.4 0 0 1 3.3 13 8.5 8.5 0 0 1 8 5.4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 7Z" />
          </svg>
        </button>
        <button type="button" className="feed-post-action-button" aria-label="Share post" title="Share post" onClick={sharePost}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
      {(shareMessage || reactionState?.error) && (
        <div className="feed-post-action-feedback" aria-live="polite">
          {shareMessage && <span role="status">{shareMessage}</span>}
          {reactionState?.error && <span role="alert" className="text-red-700">{reactionState.error}</span>}
        </div>
      )}

      <p className="feed-post-likes">{post.reaction_count} {post.reaction_count === 1 ? "like" : "likes"}</p>
      {commentsOpen && (
        <section className="feed-post-comments" aria-label="Post comments">
          <h3 className="feed-post-comments-title">Comments</h3>
          {comments.length > 0 ? (
            <div className="feed-post-comment-list">
              {comments.slice(0, 3).map((comment) => (
                <div key={comment.id} className="comment-bubble">
                  <span className="text-xs font-semibold text-slate-500">Community member</span>
                  <p className="whitespace-pre-wrap break-words">{comment.content}</p>
                  <form action={reactionAction} className="mt-1">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="kind" value="like" />
                    <PendingButton className={`text-xs font-semibold ${comment.liked ? "text-brand" : "text-slate-500"}`}>
                      {comment.liked ? "♥ Liked" : "♡ Like"} · {comment.reaction_count}
                    </PendingButton>
                  </form>
                  {canInteract && comment.isMine && <DeleteCommentForm commentId={comment.id} />}
                  {canInteract && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <details>
                        <summary className="cursor-pointer text-xs text-brand">Reply</summary>
                        <form action={commentAction} className="mt-2 flex gap-2">
                          <input type="hidden" name="post_id" value={post.id} />
                          <input type="hidden" name="parent_id" value={comment.id} />
                          <input name="content" required maxLength={1000} className="input" aria-label="Write a reply" placeholder="Write a reply..." />
                          <PendingButton className="btn-ghost">Send</PendingButton>
                        </form>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-500">Report comment</summary>
                        <form action={reportAction} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="comment_id" value={comment.id} />
                          <label className="sr-only" htmlFor={`comment-report-${comment.id}`}>Report reason</label>
                          <select id={`comment-report-${comment.id}`} name="reason" required className="input">
                            <option value="">Choose reason</option><option value="bullying">Bullying</option>
                            <option value="harassment">Harassment</option><option value="hate_speech">Hate speech</option>
                            <option value="threat">Threat</option><option value="sexual_content">Sexual content</option>
                            <option value="spam">Spam</option><option value="scam">Scam</option>
                            <option value="personal_information">Personal information</option><option value="doxxing">Doxxing</option>
                            <option value="misinformation">Misinformation</option><option value="other">Other</option>
                          </select>
                          <PendingButton className="btn-ghost">Report</PendingButton>
                        </form>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="feed-post-no-comments">No comments yet.</p>}

          {canInteract ? (
            <form action={commentAction} className="feed-post-comment-form">
              <input type="hidden" name="post_id" value={post.id} />
              <label className="sr-only" htmlFor={`comment-${post.id}`}>Write a comment</label>
              <input
                ref={commentInputRef}
                id={`comment-${post.id}`}
                name="content"
                required
                maxLength={1000}
                className="input"
                placeholder="Write a comment..."
              />
              <PendingButton className="btn-primary feed-post-comment-submit">Comment</PendingButton>
            </form>
          ) : (
            <p className="feed-post-login-prompt"><Link href="/login">Log in</Link> to comment.</p>
          )}
          {commentState?.error && <p role="alert" className="feed-post-form-error">{commentState.error}</p>}
          {commentState?.success && <p role="status" className="feed-post-form-success">{commentState.success}</p>}
        </section>
      )}
      {canInteract && (
        <details>
          <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-800">Report this post</summary>
          <form action={reportAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="post_id" value={post.id} />
            <label className="text-sm">
              Reason
              <select name="reason" required className="input mt-1">
                <option value="">Choose a reason</option>
                <option value="bullying">Bullying</option>
                <option value="harassment">Harassment</option>
                <option value="hate_speech">Hate speech</option>
                <option value="threat">Threat</option>
                <option value="sexual_content">Sexual content</option>
                <option value="spam">Spam</option>
                <option value="scam">Scam</option>
                <option value="personal_information">Personal information</option>
                <option value="doxxing">Doxxing</option>
                <option value="misinformation">Misinformation</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm">
              Details (optional)
              <input name="details" maxLength={500} className="input mt-1" />
            </label>
            {reportState?.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{reportState.error}</p>}
            {reportState?.success && <p role="status" className="text-sm text-green-700 sm:col-span-2">{reportState.success}</p>}
            <PendingButton className="btn-ghost sm:col-span-2">Submit report</PendingButton>
          </form>
        </details>
      )}
    </article>
  );
}
