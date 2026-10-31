"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "disabled" | "enabled" | "blocked" | "setup";

function getApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function PushNotificationSettings({ setupNeeded }: { setupNeeded: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setupNeeded) {
      setStatus("setup");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    navigator.serviceWorker.register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setStatus(subscription ? "enabled" : "disabled"))
      .catch((registrationError: unknown) => {
        console.error("Could not check browser push settings.", registrationError);
        setError("Could not check this browser's notification settings.");
        setStatus("disabled");
      });
  }, [setupNeeded]);

  async function togglePush() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      if (status === "enabled") {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push-subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || "Could not turn off push notifications.");
          }
          await subscription.unsubscribe();
        }
        setStatus("disabled");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "disabled");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push notifications are not configured on the server yet.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: getApplicationServerKey(publicKey),
      });
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        const result = await response.json();
        await subscription.unsubscribe();
        throw new Error(result.error || "Could not save push settings.");
      }
      setStatus("enabled");
    } catch (toggleError) {
      console.error("Could not update browser push settings.", toggleError);
      setError(toggleError instanceof Error ? toggleError.message : "Could not update push settings.");
    } finally {
      setBusy(false);
    }
  }

  const description = status === "unsupported"
    ? "This browser does not support push notifications. On iPhone/iPad, install the site to your Home Screen and use iOS/iPadOS 16.4 or newer."
    : status === "blocked"
      ? "Notifications are blocked in this browser. Allow them in browser settings to turn push alerts on."
      : status === "setup"
        ? "Push notifications need VAPID keys and the Supabase setup before users can enable them."
      : status === "enabled"
        ? "This device can receive alerts for new posts, announcements, and messages."
        : status === "checking"
          ? "Checking this browser's notification settings…"
          : "Allow this browser to send alerts for new posts, announcements, and messages.";

  return (
    <section className="card notification-settings-card">
      <div className="min-w-0">
        <p className="eyebrow">This device</p>
        <h2 className="text-xl font-bold">Phone/browser push notifications</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        className={`notification-toggle${status === "enabled" ? " notification-toggle-on" : ""}`}
        role="switch"
        aria-checked={status === "enabled"}
        aria-label="Phone/browser push notifications"
        disabled={busy || status === "checking" || status === "unsupported" || status === "blocked" || status === "setup"}
        onClick={togglePush}
      >
        <span />
      </button>
      {error && <p role="alert" className="col-span-full text-sm text-red-700">{error}</p>}
    </section>
  );
}
