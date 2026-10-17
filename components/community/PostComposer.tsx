"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPost } from "@/server/community-actions";
import EmojiPicker from "@/components/EmojiPicker";

type Option = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="post-composer-publish" disabled={pending} aria-busy={pending}>
      {pending && <span className="post-composer-spinner" aria-hidden="true" />}
      {pending ? "Posting..." : "Post"}
    </button>
  );
}

type ComposerTool = "photo" | "category" | "school" | "identity";

export default function PostComposer({
  categories,
  schools,
}: {
  categories: Option[];
  schools: Option[];
}) {
  const [state, action] = useFormState(createPost, null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [activeTool, setActiveTool] = useState<ComposerTool | null>("photo");

  function toggleTool(tool: ComposerTool) {
    setActiveTool((active) => active === tool ? null : tool);
  }

  return (
    <form action={action} className="post-composer-form card">
      <header className="post-composer-header">
        <Link href="/wall" className="post-composer-cancel">Cancel</Link>
        <h1>Create post</h1>
        <SubmitButton />
      </header>

      <div className="post-composer-identity">
        <span className="post-composer-avatar" aria-hidden="true">CV</span>
        <div>
          <p className="post-composer-audience">Share with the community</p>
          <p className="post-composer-privacy">Choose your identity below</p>
        </div>
      </div>

      <label className="post-composer-content">
        <span className="sr-only">What’s on your mind?</span>
        <textarea
          name="content"
          ref={contentRef}
          required
          minLength={1}
          maxLength={2000}
          rows={7}
          placeholder="What would you like to share?"
          className="post-composer-textarea"
        />
      </label>

      <section className="post-composer-additions" aria-labelledby="post-composer-additions-title">
        <h2 id="post-composer-additions-title">Add to your post</h2>
        <div className="post-composer-tools">
          <button type="button" className={`post-composer-tool${activeTool === "photo" ? " post-composer-tool-active" : ""}`} aria-pressed={activeTool === "photo"} onClick={() => toggleTool("photo")}>
            <span className="post-composer-tool-icon post-composer-tool-photo" aria-hidden="true">▧</span>
            <span>Photo</span>
          </button>
          <button type="button" className={`post-composer-tool${activeTool === "category" ? " post-composer-tool-active" : ""}`} aria-pressed={activeTool === "category"} onClick={() => toggleTool("category")}>
            <span className="post-composer-tool-icon post-composer-tool-category" aria-hidden="true">▤</span>
            <span>Category</span>
          </button>
          <button type="button" className={`post-composer-tool${activeTool === "school" ? " post-composer-tool-active" : ""}`} aria-pressed={activeTool === "school"} onClick={() => toggleTool("school")}>
            <span className="post-composer-tool-icon post-composer-tool-school" aria-hidden="true">⌂</span>
            <span>School</span>
          </button>
          <button type="button" className={`post-composer-tool${activeTool === "identity" ? " post-composer-tool-active" : ""}`} aria-pressed={activeTool === "identity"} onClick={() => toggleTool("identity")}>
            <span className="post-composer-tool-icon post-composer-tool-identity" aria-hidden="true">◉</span>
            <span>Identity</span>
          </button>
          <div className="post-composer-emoji-tool">
            <EmojiPicker inputRef={contentRef} label="Emoji" />
          </div>
        </div>

        <div className="post-composer-tool-panel" hidden={activeTool !== "photo"}>
          <label className="block text-sm font-medium">
            Add a photo
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input mt-2"
            />
            <span className="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP; maximum 3 MB.</span>
          </label>
        </div>
        <div className="post-composer-tool-panel" hidden={activeTool !== "category"}>
          <label className="block text-sm font-medium">
            Category
            <select name="category_id" className="input mt-2" defaultValue="">
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="post-composer-tool-panel" hidden={activeTool !== "school"}>
          <label className="block text-sm font-medium">
            School
            <select name="school_id" className="input mt-2" defaultValue="">
              <option value="">Use my profile school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="post-composer-tool-panel post-composer-identity-options" hidden={activeTool !== "identity"}>
          <legend className="text-sm font-semibold">Post identity</legend>
          <label>
            <input type="radio" name="is_anonymous" value="false" defaultChecked />
            <span>Post as my account</span>
          </label>
          <label>
            <input type="radio" name="is_anonymous" value="true" />
            <span>Post anonymously</span>
          </label>
          <p className="text-xs text-slate-500">
            Anonymous posts hide your public profile, but administrators may investigate serious safety reports.
          </p>
        </fieldset>
        <p className="post-composer-limit">Up to 2,000 characters.</p>
      </section>

      <div className="post-composer-messages" aria-live="polite">
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      </div>
    </form>
  );
}
