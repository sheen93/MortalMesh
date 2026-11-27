import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell } from '@/components/SeoShell';
import { HAND_GESTURES } from '@/data/handGestures';

export const metadata: Metadata = {
  title: '12 3D Hand Anatomy & Gesture References for Artists',
  description:
    'Study 12 articulated 3D hand poses (Relaxed, Open, Spread, Fist, Grab, Hold, Point, Peace, Rock, Thumb Up, Pinch) with orbit camera, knuckle wedges, and Notan lighting.',
  alternates: { canonical: '/hands' },
};

export default function HandsDirectoryPage() {
  return (
    <SeoShell activeNav="hands">
      <div className="space-y-8">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-400">
            Free 3D Hand Reference Library · 12 Articulated Gestures
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            12 Interactive 3D Hand References for Artists
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Inspect full 15-bone finger articulation from any angle. Every gesture opens directly centered on the right hand inside Mortal Mesh with independent phalange curl, thumb opposition, and 2-Value Notan planar shadows.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/?hand=open"
              className="rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Inspect Hand in 3D Studio →
            </Link>
            <Link
              href="/poses"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-100 hover:bg-white/10 transition-colors"
            >
              Browse 50 Full-Body Poses
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HAND_GESTURES.map((gesture) => (
            <Link
              key={gesture.id}
              href={`/hands/${gesture.id}`}
              className="group flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 hover:border-emerald-400/50 hover:bg-zinc-900/80 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-300">
                    {gesture.label}
                  </h2>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {gesture.shortLabel}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {gesture.description}
                </p>
              </div>
              <div className="flex items-center justify-between pt-1 font-mono text-[11px] text-emerald-400">
                <span>Construction Notes + 3D Hand</span>
                <span>→</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </SeoShell>
  );
}
