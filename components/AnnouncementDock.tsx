"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type PublicAnnouncement = {
  id: string;
  title: string;
  body: string;
};

function AnnouncementIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13V8a2 2 0 0 1 2-2h2l9-3v17l-9-3H6a2 2 0 0 1-2-2v-1" />
      <path d="m8 17 1.5 4h3L11 17m10-8 2-2m-2 7 2 2" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2 1.2-4.2A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01" />
    </svg>
  );
}

export default function AnnouncementDock({
  announcements,
  signedIn,
}: {
  announcements: PublicAnnouncement[];
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("campusvoice-announcement-dismissed") === "1") setOpen(false);
    } catch {
      setOpen(true);
    }
  }, []);

  if (pathname.startsWith("/admin") || (!announcements.length && !signedIn)) return null;

  function closeAnnouncement() {
    setOpen(false);
    try {
      sessionStorage.setItem("campusvoice-announcement-dismissed", "1");
    } catch {
      setOpen(false);
    }
  }

  function reopenAnnouncement() {
    setOpen(true);
    try {
      sessionStorage.removeItem("campusvoice-announcement-dismissed");
    } catch {
      setOpen(true);
    }
  }

  const selectedIndex = announcements.length ? selected % announcements.length : 0;
  const announcement = announcements[selectedIndex];

  return (
    <aside className="announcement-dock" aria-label="KanyaKanyaNa announcements and support">
      {open && announcement && (
        <section className="announcement-dock-panel" aria-label="Announcement">
          <header className="announcement-dock-header">
            <span className="announcement-dock-kicker"><AnnouncementIcon />Announcement</span>
            <button type="button" className="announcement-dock-close" aria-label="Close announcement" onClick={closeAnnouncement}>×</button>
          </header>
          <h2>{announcement.title}</h2>
          <p>{announcement.body}</p>
          {announcements.length > 1 && (
            <nav className="announcement-dock-pagination" aria-label="Choose announcement">
              <button
                type="button"
                aria-label="Previous announcement"
                onClick={() => setSelected((index) => (index - 1 + announcements.length) % announcements.length)}
              >‹</button>
              <span>{selectedIndex + 1} / {announcements.length}</span>
              <button
                type="button"
                aria-label="Next announcement"
                onClick={() => setSelected((index) => (index + 1) % announcements.length)}
              >›</button>
            </nav>
          )}
        </section>
      )}
      {announcements.length > 0 && (
        <button
          type="button"
          className={`announcement-dock-launcher${open ? " announcement-dock-launcher-open" : ""}`}
          aria-label={open ? "Announcement is open" : "Open announcements"}
          title={open ? "Announcement" : "Open announcements"}
          onClick={open ? closeAnnouncement : reopenAnnouncement}
        >
          <AnnouncementIcon />
          {!open && <span className="announcement-dock-dot" aria-hidden="true" />}
        </button>
      )}
      {signedIn && (
        <Link href="/support" className="support-launcher" aria-label="KanyaKanyaNa Support chat" title="KanyaKanyaNa Support">
          <SupportIcon />
        </Link>
      )}
    </aside>
  );
}
