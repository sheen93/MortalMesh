import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell } from '@/components/SeoShell';

export const metadata: Metadata = {
  title: 'Free 3D Timed Gesture Drawing Timer & Sketchpad',
  description:
    'Run timed 3D figure drawing drills offline in your browser with rotating camera angles, 2-Value Notan shadows, Loomis blue-pencil construction, and comic ink outlines.',
  alternates: { canonical: '/gesture-timer' },
};

const INTERVAL_CARDS: ReadonlyArray<{
  interval: '30' | '60' | '120' | '300' | 'class';
  badge: string;
  title: string;
  summary: string;
  bestFor: string;
}> = [
  {
    interval: '30',
    badge: '30 SEC',
    title: 'Line-of-Action Sprint',
    summary:
      'Capture primary C/S torso rhythm, ribcage tilt, and plumb weight in 3–5 continuous strokes before time expires.',
    bestFor: 'Warmups, flow energy, breaking stiffness',
  },
  {
    interval: '60',
    badge: '1 MIN',
    title: 'Proportion & Silhouettes',
    summary:
      'Block head ovoid, ribcage prism, pelvic keystone, and decisive shadow massing without getting caught in contour details.',
    bestFor: 'Mass gesture & rapid volumetric block-ins',
  },
  {
    interval: '120',
    badge: '2 MIN',
    title: 'Structural Construction',
    summary:
      'Establish overlapping cross-contours, landmarks (C7, ASIS, acromion), and limb foreshortening against a randomized 3D horizon.',
    bestFor: 'Constructive Loomis / Bridgman studies',
  },
  {
    interval: '300',
    badge: '5 MIN',
    title: 'Rendered Study & Value',
    summary:
      'Pair directional rim lighting or 2-Value Notan separation with clean form shadows and anatomical joint transitions.',
    bestFor: 'Longer studio figure rendering',
  },
  {
    interval: 'class',
    badge: 'CLASS MODE',
    title: 'Classic Life Drawing Curve',
    summary:
      'Progressive 10-pose session curve: 4× 30s warmups → 3× 1m blocks → 2× 2m structural → 1× 5m finished centerpiece.',
    bestFor: 'Full daily 15-minute life-drawing workout',
  },
];

export default function GestureTimerPage() {
  return (
    <SeoShell activeNav="gesture-timer">
      <div className="space-y-8">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-400">
            Distraction-Free · Offline 3D Life Drawing Gym
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            3D Timed Gesture Drawing Gym
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Unlike flat photo slideshows, Mortal Mesh lets you draw from calibrated 3D poses with randomized orbit horizons, switch to <strong className="text-zinc-100">2-Value Notan</strong> or <strong className="text-zinc-100">Loomis Blue-Pencil</strong> mid-session, and orbit around the figure after every pose finishes. Works 100% offline with zero accounts.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/?mode=gym&interval=60"
              data-testid="seo-start-gym-cta"
              className="rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Launch 1-Min Gesture Gym Now →
            </Link>
            <Link
              href="/poses"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-100 hover:bg-white/10 transition-colors"
            >
              Preview All 50 Poses
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {INTERVAL_CARDS.map((card) => (
            <Link
              key={card.interval}
              href={`/?mode=gym&interval=${card.interval}`}
              className="group flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 hover:border-emerald-400/50 hover:bg-zinc-900/80 transition-colors"
            >
              <div className="space-y-2">
                <span className="inline-block rounded-md bg-emerald-400/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                  {card.badge}
                </span>
                <h2 className="text-base font-semibold text-zinc-100 group-hover:text-emerald-300">
                  {card.title}
                </h2>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {card.summary}
                </p>
              </div>
              <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">Focus:</span>{' '}
                  {card.bestFor}
                </div>
                <div className="font-mono text-[11px] font-semibold text-emerald-400">
                  Start {card.badge} Session →
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </SeoShell>
  );
}
