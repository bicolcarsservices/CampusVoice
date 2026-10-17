"use client";

import { useEffect, useState } from "react";

export default function WallPopupTicker({ texts }: { texts: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!texts.length) return;

    let transitionTimer: ReturnType<typeof setTimeout>;
    let cycleTimer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setVisible(false);
      transitionTimer = setTimeout(() => {
        setActiveIndex((index) => (index + 1) % texts.length);
        setVisible(true);
        cycleTimer = setTimeout(cycle, 4500);
      }, 700);
    };

    cycleTimer = setTimeout(cycle, 4500);
    return () => {
      clearTimeout(transitionTimer);
      clearTimeout(cycleTimer);
    };
  }, [texts.length]);

  if (!texts.length) return null;
  const text = texts[activeIndex % texts.length];

  return (
    <aside
      className={`wall-popup-text${visible ? " wall-popup-text-visible" : ""}`}
      aria-label="Freedom Wall pop-up text"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="wall-popup-text-icon" aria-hidden="true">✦</span>
      <span className="wall-popup-text-message" key={`${activeIndex}-${text}`}>{text}</span>
    </aside>
  );
}
