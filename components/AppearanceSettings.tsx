"use client";

import { useEffect, useState } from "react";

type Appearance = "system" | "light" | "dark";
const preferenceKey = "campusvoice-appearance";
const options: { id: Appearance; label: string; detail: string }[] = [
  { id: "system", label: "System", detail: "Follow your device" },
  { id: "light", label: "Light", detail: "Bright campus theme" },
  { id: "dark", label: "Dark", detail: "Comfortable in low light" },
];

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncAppearance = () => {
      try {
        const saved = localStorage.getItem(preferenceKey);
        setAppearance(saved === "light" || saved === "dark" ? saved : "system");
        setError(null);
      } catch (storageError) {
        console.error("Could not read the saved appearance preference.", storageError);
        setError("Your browser could not load the saved appearance setting.");
      }
    };
    const onPreferenceChange = (event: Event) => {
      const preference = (event as CustomEvent<Appearance>).detail;
      if (preference === "system" || preference === "light" || preference === "dark") setAppearance(preference);
    };

    syncAppearance();
    window.addEventListener("storage", syncAppearance);
    window.addEventListener("campusvoice-appearance-change", onPreferenceChange);
    return () => {
      window.removeEventListener("storage", syncAppearance);
      window.removeEventListener("campusvoice-appearance-change", onPreferenceChange);
    };
  }, []);

  function chooseAppearance(value: Appearance) {
    try {
      localStorage.setItem(preferenceKey, value);
      setAppearance(value);
      setError(null);
      window.dispatchEvent(new CustomEvent<Appearance>("campusvoice-appearance-change", { detail: value }));
    } catch (storageError) {
      console.error("Could not save the appearance preference.", storageError);
      setError("Your browser could not save this setting. Check your browser storage permissions.");
    }
  }

  return (
    <section className="card appearance-settings">
      <p className="eyebrow">Preferences</p>
      <h2 className="text-xl font-bold">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500">Piliin kung paano ipapakita ang KanyaKanyaNa sa device na ito.</p>
      <div className="appearance-options" role="group" aria-label="Appearance preference">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`appearance-option${appearance === option.id ? " appearance-option-active" : ""}`}
            aria-pressed={appearance === option.id}
            onClick={() => chooseAppearance(option.id)}
          >
            <span className="font-semibold">{option.label}</span>
            <span className="text-xs text-slate-500">{option.detail}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
