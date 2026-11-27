import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell } from '@/components/SeoShell';
import { POSE_CATEGORIES, POSE_PRESETS } from '@/data/poses';

export const metadata: Metadata = {
  title: '50 Free 3D Pose References for Artists — Mortal Mesh',
  description:
    'Browse 50 anatomically calibrated 3D figure drawing poses across Classical, Action, Combat, Dance, and Gesture categories. Inspect, orbit, light, and sketch in 3D.',
  alternates: { canonical: '/poses' },
};

export default function PosesDirectoryPage() {
  return (
    <SeoShell activeNav="poses">
      <div className="space-y-8">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-400">
            Free 3D Reference Library · 50 Calibrated Poses
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            50 Interactive 3D Pose References for Artists
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Every pose is anatomically validated with physiological joint ROM limits across 5 rigged models (Classic, Female, M2, M3, and Skeleton). Open any pose directly in the interactive 3D studio with Loomis construction, 2-Value Notan lighting, and Fisheye perspective.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/"
              data-testid="seo-launch-studio-cta"
              className="rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Launch 3D Studio →
            </Link>
            <Link
              href="/gesture-timer"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-100 hover:bg-white/10 transition-colors"
            >
              Open Timed Gesture Gym
            </Link>
          </div>
        </section>

        {POSE_CATEGORIES.map((category) => {
          const items = POSE_PRESETS.filter((p) => p.category === category.id);
          return (
            <section key={category.id} className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <h2 className="text-lg font-semibold text-zinc-100">
                  {category.fullLabel}
                </h2>
                <span className="font-mono text-xs text-zinc-400">
                  {items.length} poses
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((pose) => (
                  <Link
                    key={pose.id}
                    href={`/poses/${pose.id}`}
                    className="group flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 hover:border-emerald-400/50 hover:bg-zinc-900/80 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-300">
                          {pose.name}
                        </h3>
                        {!pose.groundSnap && pose.elevationY > 0 && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            AIR
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                        {pose.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1 font-mono text-[11px] text-emerald-400">
                      <span>Study Guide + 3D View</span>
                      <span>→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </SeoShell>
  );
}
