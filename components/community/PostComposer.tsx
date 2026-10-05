"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createPost } from "@/server/community-actions";

type Option = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Publishing..." : "Publish post"}
    </button>
  );
}

export default function PostComposer({
  categories,
  schools,
}: {
  categories: Option[];
  schools: Option[];
}) {
  const [state, action] = useFormState(createPost, null);

  return (
    <form action={action} className="card space-y-4">
      <label className="block text-sm font-medium">
        What’s on your mind?
        <textarea
          name="content"
          required
          minLength={1}
          maxLength={2000}
          rows={6}
          placeholder="Share your thoughts with the community..."
          className="input mt-2 min-h-36 resize-y"
        />
        <span className="mt-1 block text-xs text-slate-500">Up to 2,000 characters.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Category
          <select name="category_id" className="input mt-2" defaultValue="">
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
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

      <label className="block text-sm font-medium">
        Optional image
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="input mt-2"
        />
        <span className="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP; maximum 3 MB.</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post identity</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="is_anonymous" value="false" defaultChecked />
          Post as my account
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="is_anonymous" value="true" />
          Post anonymously
        </label>
        <p className="text-xs text-slate-500">
          Anonymous posts hide your public profile, but administrators may investigate serious safety reports.
        </p>
      </fieldset>

      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      <SubmitButton />
    </form>
  );
}
