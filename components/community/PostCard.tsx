"use client";

import Link from "next/link";
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

function PendingButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className}>{pending ? "Sending..." : children}</button>;
}

export default function PostCard({
  post,
  schoolName,
  categoryName,
  imageUrl,
  comments,
  canInteract,
  liked,
}: {
  post: Post;
  schoolName: string;
  categoryName: string;
  imageUrl: string | null;
  comments: CommentItem[];
  canInteract: boolean;
  liked: boolean;
}) {
  const [commentState, commentAction] = useFormState(addComment, null);
  const [reportState, reportAction] = useFormState(reportContent, null);
  const [reactionState, reactionAction] = useFormState(toggleReaction, null);
  const name = post.is_anonymous ? "Anonymous" : post.display_name || post.username || "Community member";

  return (
    <article className="card space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {post.is_anonymous || !post.avatar_path ? (
            <div className="avatar-fallback" aria-hidden="true">{post.is_anonymous ? "?" : name.slice(0, 1).toUpperCase()}</div>
          ) : (
            <img src={post.avatar_path} alt="" className="avatar-fallback object-cover" />
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {post.is_anonymous || !post.username ? name : <Link href={`/profile/${encodeURIComponent(post.username)}`} className="hover:text-brand">{name}</Link>}
            </p>
            <p className="text-xs text-slate-500">
              {schoolName} · {new Date(post.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <span className="tag">{categoryName}</span>
      </header>

      <p className="whitespace-pre-wrap break-words">{post.content}</p>
      {imageUrl && <img src={imageUrl} alt="Image attached to post" className="post-image" />}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
        {canInteract ? (
          <form action={reactionAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <PendingButton className={`text-action ${liked ? "text-brand" : ""}`}>
              {liked ? "♥ Liked" : "♡ Like"} · {post.reaction_count}
            </PendingButton>
          </form>
        ) : <span>♥ {post.reaction_count} reactions</span>}
        <span>{post.comment_count} comments</span>
        {reactionState?.error && <span role="alert" className="text-red-700">{reactionState.error}</span>}
        {reactionState?.success && <span role="status">{reactionState.success}</span>}
      </div>

      {comments.length > 0 && (
        <section aria-label="Recent comments" className="space-y-2">
          {comments.slice(0, 3).map((comment) => (
            <div key={comment.id} className="comment-bubble">
              <span className="text-xs font-semibold text-slate-500">Community member</span>
              <p className="whitespace-pre-wrap break-words">{comment.content}</p>
              <form action={reactionAction} className="mt-1">
                <input type="hidden" name="comment_id" value={comment.id} />
                <PendingButton className={`text-xs font-semibold ${comment.liked ? "text-brand" : "text-slate-500"}`}>
                  {comment.liked ? "♥ Liked" : "♡ Like"} · {comment.reaction_count}
                </PendingButton>
              </form>
              {canInteract && comment.isMine && (
                <DeleteCommentForm commentId={comment.id} />
              )}
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
        </section>
      )}

      {canInteract && (
        <>
          <form action={commentAction} className="flex gap-2">
            <input type="hidden" name="post_id" value={post.id} />
            <label className="sr-only" htmlFor={`comment-${post.id}`}>Write a comment</label>
            <input
              id={`comment-${post.id}`}
              name="content"
              required
              maxLength={1000}
              className="input"
              placeholder="Write a comment..."
            />
            <PendingButton className="btn-ghost shrink-0">Comment</PendingButton>
          </form>
          {commentState?.error && <p role="alert" className="text-sm text-red-700">{commentState.error}</p>}
          {commentState?.success && <p role="status" className="text-sm text-green-700">{commentState.success}</p>}

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
        </>
      )}
    </article>
  );
}
