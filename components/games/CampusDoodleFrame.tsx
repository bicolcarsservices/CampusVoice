"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function CampusDoodleFrame({ gameUrl }: { gameUrl: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  const gameOrigin = new URL(gameUrl).origin;

  const sendTicket = useCallback(async () => {
    try {
      let guestId = window.sessionStorage.getItem("campus-doodle-guest-id");
      if (!guestId) {
        guestId = window.crypto.randomUUID();
        window.sessionStorage.setItem("campus-doodle-guest-id", guestId);
      }
      const response = await fetch("/api/campus-doodle/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not authenticate Campus Doodle.");
      iframe.current?.contentWindow?.postMessage(
        { type: "campus-doodle-ticket", ticket: data.ticket },
        gameOrigin,
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not authenticate Campus Doodle.");
    }
  }, [gameOrigin]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== gameOrigin || event.source !== iframe.current?.contentWindow ||
          event.data?.type !== "campus-doodle-auth-request") return;
      void sendTicket();
    }
    window.addEventListener("message", handleMessage);
    const refresh = window.setInterval(() => void sendTicket(), 4 * 60 * 1000);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(refresh);
    };
  }, [gameOrigin, sendTicket]);

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <iframe
        ref={iframe}
        title="Campus Doodle multiplayer game"
        src={gameUrl}
        className="h-[82vh] min-h-[680px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
        allow="fullscreen; clipboard-write"
        onLoad={() => void sendTicket()}
      />
    </div>
  );
}
