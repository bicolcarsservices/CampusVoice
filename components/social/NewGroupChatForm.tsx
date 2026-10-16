"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createGroupChat } from "@/server/dating-actions";

export type GroupChatProfile = { id: string; username: string; display_name: string };

function CreateButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Creating..." : "Create group"}</button>;
}

export default function NewGroupChatForm({ profiles }: { profiles: GroupChatProfile[] }) {
  const router = useRouter();
  const [state, action] = useFormState(createGroupChat, null);
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state?.redirectTo, router]);

  return (
    <form action={action} className="new-group-form">
      <label className="block text-sm font-semibold">
        Group name
        <input name="name" required minLength={2} maxLength={60} className="input mt-1" placeholder="e.g. Campus Creators" />
      </label>
      <div>
        <p className="mb-2 text-sm font-semibold">Choose members <span className="font-normal text-slate-500">({selectedCount}/49)</span></p>
        <div className="new-group-member-list">
          {profiles.map((profile) => (
            <label key={profile.id} className="new-group-member">
              <input
                type="checkbox"
                name="member_id"
                value={profile.id}
                onChange={(event) => {
                  if (event.target.checked && selectedCount >= 49) {
                    event.target.checked = false;
                    return;
                  }
                  setSelectedCount((count) => count + (event.target.checked ? 1 : -1));
                }}
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{profile.display_name}</span>
                <span className="block truncate text-xs text-slate-500">@{profile.username}</span>
              </span>
            </label>
          ))}
          {!profiles.length && <p className="text-sm text-slate-500">No other members are available yet.</p>}
        </div>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <CreateButton />
    </form>
  );
}
