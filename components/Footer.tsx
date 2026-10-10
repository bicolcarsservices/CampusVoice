"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="site-footer mt-12 border-t border-slate-800 bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex rounded-xl bg-black p-2">
            <Image src="/campusvoice-logo.jpg" alt="CampusVoice" width={635} height={202} className="h-[42px] w-[132px] rounded-lg object-contain" />
          </Link>
          <p className="mt-2 max-w-sm text-sm text-slate-400">Your Voice. Your Space. Your Story. A community space for campus stories, ideas, and connection.</p>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/wall">Freedom Wall</Link></li>
            <li><Link href="/schools">Schools</Link></li>
            <li><Link href="/games">Games</Link></li>
            <li><Link href="/games/campus-coin-rush">Campus Coin Rush</Link></li>
            <li><Link href="/games/galactic-striker">Galactic Striker</Link></li>
            <li><Link href="/subscription">Plans</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Policies &amp; help</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><Link href="/terms">Terms of Use</Link></li>
            <li><Link href="/guidelines">Community Guidelines</Link></li>
            <li><Link href="/about">About CampusVoice</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          © {new Date().getFullYear()} CampusVoice. Be kind, protect privacy, and use your voice responsibly.
        </p>
      </div>
    </footer>
  );
}
