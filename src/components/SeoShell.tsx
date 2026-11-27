import Link from 'next/link';
import type { ReactNode } from 'react';

interface SeoShellProps {
  activeNav?: 'poses' | 'hands' | 'gesture-timer';
  children: ReactNode;
}

export function SeoShell({ activeNav, children }: SeoShellProps) {
  const navCls = (id: 'poses' | 'hands' | 'gesture-timer') =>
    activeNav === id
      ? 'rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors'
      : 'rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors';

  return (
    <div className="min-h-[100dvh] bg-[#16181D] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#1B1D21]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-zinc-100"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-black text-zinc-950">
              M
            </span>
            <span>Mortal Mesh</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <Link href="/poses" className={navCls('poses')}>
              50 3D Poses
            </Link>
            <Link href="/hands" className={navCls('hands')}>
              12 Hand Gestures
            </Link>
            <Link href="/gesture-timer" className={navCls('gesture-timer')}>
              Gesture Timer
            </Link>
            <Link
              href="/"
              className="rounded-lg bg-emerald-400 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Launch 3D Studio
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-white/10 bg-[#1B1D21]/60 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-zinc-400 sm:px-6">
          <span>
            Mortal Mesh — Free Interactive 3D Anatomy &amp; Gesture Reference Studio
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/poses" className="hover:text-zinc-200">
              Pose Library
            </Link>
            <Link href="/hands" className="hover:text-zinc-200">
              Hand Study
            </Link>
            <Link href="/gesture-timer" className="hover:text-zinc-200">
              Gesture Gym
            </Link>
            <Link href="/sitemap.xml" className="hover:text-zinc-200">
              Sitemap
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
