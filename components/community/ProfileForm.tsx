"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateProfile } from "@/server/community-actions";
import { AVATAR_PRESET_OPTIONS } from "@/lib/avatar-presets";

type Option = { id: string; name: string };

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving..." : "Save profile"}</button>;
}

export default function ProfileForm({
  profile,
  schools,
  avatarUrl,
}: {
  profile: { username: string; display_name: string; school_name: string | null; grade_level: string | null; bio: string | null };
  schools: Option[];
  avatarUrl: string | null;
}) {
  const [state, action] = useFormState(updateProfile, null);
  const [selectedPreset, setSelectedPreset] = useState(
    AVATAR_PRESET_OPTIONS.find((option) => option.src === avatarUrl)?.id ?? "",
  );

  return (
    <form action={action} className="card settings-edit-form">
      <h2 className="text-xl font-bold">Edit profile</h2>
      {avatarUrl && <img src={avatarUrl} alt="Your profile avatar" className="avatar-fallback settings-edit-avatar h-20 w-20 object-cover" />}
      <input type="hidden" name="avatar_preset" value={selectedPreset} />
      <div className="settings-form-field settings-form-field-wide">
        <p className="mb-2 text-sm font-medium">Choose a profile avatar</p>
        <div className="flex flex-wrap gap-3">
          {AVATAR_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedPreset(option.id)}
              className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 transition ${selectedPreset === option.id ? "border-brand ring-2 ring-brand/30" : "border-slate-200 hover:border-brand/60"}`}
              aria-label={option.label}
              aria-pressed={selectedPreset === option.id}
              title={option.label}
            >
              <img src={option.src} alt={option.label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      <label className="settings-form-field settings-form-field-wide block text-sm font-medium">Profile picture
        <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="input mt-1" />
        <span className="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP; maximum 2 MB.</span>
      </label>
      {avatarUrl && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remove_avatar" value="true" />
          Remove current avatar
        </label>
      )}
      <label className="settings-form-field block text-sm font-medium">Display name
        <input name="display_name" required minLength={2} maxLength={60} defaultValue={profile.display_name} className="input mt-1" />
      </label>
      <label className="settings-form-field block text-sm font-medium">Username
        <input name="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" defaultValue={profile.username} className="input mt-1" />
      </label>
      <label className="settings-form-field block text-sm font-medium">School <span className="text-slate-500">(optional)</span>
        <input name="school_name" list="profile-schools" maxLength={100} defaultValue={profile.school_name ?? ""} className="input mt-1" placeholder="Type your school or leave blank" />
        <datalist id="profile-schools">
          {schools.map((school) => <option key={school.id} value={school.name} />)}
        </datalist>
      </label>
      <label className="settings-form-field block text-sm font-medium">Grade / Year level
        <input name="grade_level" maxLength={30} defaultValue={profile.grade_level ?? ""} className="input mt-1" />
      </label>
      <label className="settings-form-field settings-form-field-wide block text-sm font-medium">Bio
        <textarea name="bio" maxLength={300} rows={3} defaultValue={profile.bio ?? ""} className="input mt-1" />
      </label>
      {state?.error && <p role="alert" className="settings-form-message text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="settings-form-message text-sm text-green-700">{state.success}</p>}
      <div className="settings-form-submit"><SaveButton /></div>
    </form>
  );
}
