"use client";

import { useState, useTransition } from "react";
import { setNotificationPreference } from "@/server/settings-actions";

export default function NotificationSettings({
  enabled,
  setupNeeded,
}: {
  enabled: boolean;
  setupNeeded: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const nextValue = !isEnabled;
    setError(null);
    startTransition(async () => {
      const result = await setNotificationPreference(nextValue);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEnabled(nextValue);
    });
  }

  return (
    <section className="card notification-settings-card">
      <div className="min-w-0">
        <p className="eyebrow">Your preferences</p>
        <h2 className="text-xl font-bold">In-app notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          {setupNeeded
            ? "Run the support settings migration to control notifications."
            : isEnabled
              ? "KanyaKanyaNa can add new alerts to your notifications inbox."
              : "New in-app alerts are paused. Existing alerts stay in your inbox."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label="In-app notifications"
        className={`notification-toggle${isEnabled ? " notification-toggle-on" : ""}`}
        disabled={setupNeeded || isPending}
        onClick={toggle}
      >
        <span />
      </button>
      {error && <p role="alert" className="col-span-full text-sm text-red-700">{error}</p>}
    </section>
  );
}
