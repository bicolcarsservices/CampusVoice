"use client";

import { useEffect, useState } from "react";

type Appearance = "system" | "light" | "dark";
const preferenceKey = "campusvoice-appearance";

export default function AppearanceToggle({ compact = false }: { compact?: boolean }) {
  const [isDark, setIsDark] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncTheme = () => setIsDark(document.documentElement.classList.contains("dark"));
    const onPreferenceChange = (event: Event) => {
      const preference = (event as CustomEvent<Appearance>).detail;
      if (preference === "dark" || preference === "light") setIsDark(preference === "dark");
      else syncTheme();
    };

    syncTheme();
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener("change", syncTheme);
    window.addEventListener("storage", syncTheme);
    window.addEventListener("campusvoice-appearance-change", onPreferenceChange);
    return () => {
      systemTheme.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("campusvoice-appearance-change", onPreferenceChange);
    };
  }, []);

  function toggleAppearance() {
    const preference: Appearance = isDark ? "light" : "dark";
    setIsDark(preference === "dark");
    setError(null);
    try {
      localStorage.setItem(preferenceKey, preference);
    } catch (storageError) {
      console.error("Could not save the appearance preference.", storageError);
      setError("Theme changed for this visit, but your browser could not save the preference.");
    }
    window.dispatchEvent(new CustomEvent<Appearance>("campusvoice-appearance-change", { detail: preference }));
  }

  return (
    <>
      <button
        type="button"
        className={`appearance-toggle public-nav-icon${compact ? " appearance-toggle-compact" : ""}`}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        aria-pressed={isDark}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
        onClick={toggleAppearance}
      >
        {isDark ? (
          <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          </svg>
        ) : (
          <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
            <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
          </svg>
        )}
      </button>
      {error && <span className="sr-only" role="status">{error}</span>}
    </>
  );
}
