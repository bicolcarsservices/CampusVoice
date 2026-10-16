"use client";

import { useEffect } from "react";

const preferenceKey = "campusvoice-appearance";

type Appearance = "system" | "light" | "dark";

function getAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}

function applyAppearance(preference: Appearance) {
  const useDark = preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", useDark);
  document.documentElement.style.colorScheme = useDark ? "dark" : "light";
}

export default function AppearanceController() {
  useEffect(() => {
    const applySavedAppearance = () => {
      try {
        applyAppearance(getAppearance(localStorage.getItem(preferenceKey)));
      } catch (error) {
        console.error("Could not read the saved appearance preference.", error);
        applyAppearance("system");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey) applySavedAppearance();
    };
    const onPreferenceChange = (event: Event) => {
      const preference = (event as CustomEvent<Appearance>).detail;
      if (preference === "system" || preference === "light" || preference === "dark") applyAppearance(preference);
    };
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    applySavedAppearance();
    systemTheme.addEventListener("change", applySavedAppearance);
    window.addEventListener("storage", onStorage);
    window.addEventListener("campusvoice-appearance-change", onPreferenceChange);
    return () => {
      systemTheme.removeEventListener("change", applySavedAppearance);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("campusvoice-appearance-change", onPreferenceChange);
    };
  }, []);

  return null;
}
