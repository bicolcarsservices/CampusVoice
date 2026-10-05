"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProfile } from "@/server/community-actions";

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
  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-xl font-bold">Edit profile</h2>
      {avatarUrl && <img src={avatarUrl} alt="Your profile avatar" className="avatar-fallback h-20 w-20 object-cover" />}
      <label className="block text-sm font-medium">Profile picture
        <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="input mt-1" />
        <span className="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP; maximum 2 MB. Custom avatars require an eligible plan.</span>
      </label>
      {avatarUrl && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remove_avatar" value="true" />
          Remove current avatar
        </label>
      )}
      <label className="block text-sm font-medium">Display name
        <input name="display_name" required minLength={2} maxLength={60} defaultValue={profile.display_name} className="input mt-1" />
      </label>
      <label className="block text-sm font-medium">Username
        <input name="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" defaultValue={profile.username} className="input mt-1" />
      </label>
      <label className="block text-sm font-medium">School <span className="text-slate-500">(optional)</span>
        <input name="school_name" list="profile-schools" maxLength={100} defaultValue={profile.school_name ?? ""} className="input mt-1" placeholder="Type your school or leave blank" />
        <datalist id="profile-schools">
          {schools.map((school) => <option key={school.id} value={school.name} />)}
        </datalist>
      </label>
      <label className="block text-sm font-medium">Grade / Year level
        <input name="grade_level" maxLength={30} defaultValue={profile.grade_level ?? ""} className="input mt-1" />
      </label>
      <label className="block text-sm font-medium">Bio
        <textarea name="bio" maxLength={300} rows={3} defaultValue={profile.bio ?? ""} className="input mt-1" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      <SaveButton />
    </form>
  );
}
