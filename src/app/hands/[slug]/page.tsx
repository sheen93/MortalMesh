import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoShell } from '@/components/SeoShell';
import { HAND_GESTURES } from '@/data/handGestures';
import { getHandSeoGuide, SITE_URL } from '@/data/seoContent';

interface HandDetailPageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return HAND_GESTURES.map((gesture) => ({ slug: gesture.id }));
}

export function generateMetadata({ params }: HandDetailPageProps): Metadata {
  const gesture = HAND_GESTURES.find((g) => g.id === params.slug);
  if (!gesture) {
    return { title: 'Hand Reference — Mortal Mesh' };
  }
  const title = `${gesture.label} Hand — Free 3D Hand Drawing Reference | Mortal Mesh`;
  const description = `${gesture.description}. Orbit in 3D, check palm wedges and curved MCP knuckle arches, and refine individual finger joints offline.`;
  return {
    title,
    description,
    alternates: { canonical: `/hands/${gesture.id}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/hands/${gesture.id}`,
      type: 'article',
    },
  };
}

export default function HandDetailPage({ params }: HandDetailPageProps) {
  const gesture = HAND_GESTURES.find((g) => g.id === params.slug);
  if (!gesture) {
    notFound();
  }

  const guide = getHandSeoGuide(gesture);
  const studioHref = `/?hand=${encodeURIComponent(gesture.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Construct a ${gesture.label} Hand in 3D`,
    description: gesture.description,
    step: [
      { '@type': 'HowToStep', position: 1, text: guide.palmWedgeTip },
      { '@type': 'HowToStep', position: 2, text: guide.knuckleArcTip },
      { '@type': 'HowToStep', position: 3, text: guide.thumbOppositionTip },
    ],
  };

  return (
    <SeoShell activeNav="hands">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="space-y-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <Link href="/hands" className="hover:text-zinc-200">
            12 Hand Gestures
          </Link>
          <span>/</span>
          <span className="text-zinc-200">{gesture.label}</span>
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 sm:p-8">
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
            Articulated 15-Bone Hand Study
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {gesture.label} — 3D Hand Anatomy Reference
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-300">
            {gesture.description}. Launch Mortal Mesh directly framed on this gesture to orbit the palm planes, test dramatic key lighting, and pose individual phalanges.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={studioHref}
              data-testid="seo-open-hand-studio-cta"
              className="rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Inspect {gesture.shortLabel} in 3D Studio →
            </Link>
            <Link
              href="/poses"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors"
            >
              Browse Full-Body Poses
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              1. Palm Wedge Block
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.palmWedgeTip}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              2. Curved Knuckle Arches
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.knuckleArcTip}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              3. Thenar &amp; Thumb Opposition
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.thumbOppositionTip}
            </p>
          </div>
        </section>

        {guide.related.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-100">
              More 3D Hand Gestures
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {guide.related.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/hands/${rel.id}`}
                  className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 hover:border-emerald-400/50 transition-colors"
                >
                  <div className="text-xs font-semibold text-zinc-100">
                    {rel.label}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                    {rel.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </SeoShell>
  );
}
