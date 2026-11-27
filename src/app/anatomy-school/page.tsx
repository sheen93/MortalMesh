import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell } from '@/components/SeoShell';
import { KINETIC_MODULES, LANDMARK_ORDER, LANDMARK_TIPS } from '@/data/kineticCurriculum';
import { SITE_URL } from '@/data/seoContent';

export const metadata: Metadata = {
  title: 'KINETIC-5 Interactive 3D Anatomy School (8 Modules)',
  description:
    'Master figure drawing with 8 free offline-ready 3D + S-Pen Study Pad missions covering Force & Plumb lines, Bridgman Three Masses, 8 Bony Landmarks, Fisheye Foreshortening, IK Muscle Origins, Hand Wedges, and 2-Value Notan.',
  alternates: { canonical: '/anatomy-school' },
  openGraph: {
    title: 'KINETIC-5 Interactive 3D Anatomy School | Mortal Mesh',
    description:
      '8 interactive figure-drawing drills uniting live 3D mannequins, X-Ray Skeleton checks, and an S-Pen sketchbook in your browser.',
    url: `${SITE_URL}/anatomy-school`,
    type: 'website',
  },
};

export default function AnatomySchoolPage() {
  const courseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'KINETIC-5 Interactive 3D Anatomy & Figure Drawing Course',
    description:
      'Free 8-module interactive 3D and digital sketchbook curriculum teaching PULSE -> ANCHOR -> BOX -> WRAP -> CARVE figure construction.',
    provider: {
      '@type': 'Organization',
      name: 'Mortal Mesh',
      url: SITE_URL,
    },
    isAccessibleForFree: true,
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
    },
  };

  return (
    <SeoShell activeNav="anatomy-school">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
      />

      <div className="space-y-8">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-400">
            Free 8-Module Interactive Course · 100% Offline PWA
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The KINETIC-5 Interactive 3D Anatomy School
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Train the complete <strong className="text-white">PULSE → ANCHOR → BOX → WRAP → CARVE</strong> drawing rhythm directly inside your browser. Sketch over Vellum overlays or in 50/50 split-screen alongside live 3D rigs, verify landmarks with instant X-Ray Sight skeleton reveals, and export layered <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">.PSD</code> and <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">.SVG</code> study sheets.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/?mode=school"
              data-testid="seo-launch-school-cta"
              className="rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Open KINETIC-5 School in App →
            </Link>
            <Link
              href="/gesture-timer"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-100 hover:bg-white/10 transition-colors"
            >
              Launch 3D Gesture Gym
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {KINETIC_MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={`/?mode=school&lesson=${mod.id}`}
              data-testid={`seo-module-link-${mod.id}`}
              className="group flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 hover:border-emerald-400/50 hover:bg-zinc-900/80 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                    Module {mod.index}/8 · {mod.phaseTag}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {mod.durationLabel}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-zinc-100 group-hover:text-emerald-300">
                  {mod.title} — <span className="font-normal text-zinc-400">{mod.missionName}</span>
                </h2>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {mod.corePrinciple}
                </p>
              </div>
              <div className="border-t border-white/10 pt-3 font-mono text-[11px] font-semibold text-emerald-400">
                Launch Interactive Mission →
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-100">
            The 8 Master Artist Surface Landmarks (Module 3 Reference)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LANDMARK_ORDER.map((id) => {
              const tip = LANDMARK_TIPS[id];
              return (
                <div
                  key={id}
                  className="rounded-xl border border-white/10 bg-zinc-950/40 p-3.5 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[10px] font-bold text-emerald-300">
                      {tip.number}
                    </span>
                    <span className="text-xs font-semibold text-zinc-100">
                      {tip.title}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    {tip.artistTip}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </SeoShell>
  );
}
