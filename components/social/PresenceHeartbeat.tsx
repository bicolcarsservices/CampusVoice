"use client";

import { useEffect } from "react";
import { touchPresence } from "@/server/dating-actions";

export default function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      if (!cancelled) void touchPresence();
    };
    ping();
    const timer = window.setInterval(ping, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
