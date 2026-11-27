import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoShell } from '@/components/SeoShell';
import { getPosePreset, POSE_PRESETS } from '@/data/poses';
import { getPoseSeoGuide, SITE_URL } from '@/data/seoContent';

interface PosePageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return POSE_PRESETS.map((pose) => ({ slug: pose.id }));
}

export function generateMetadata({ params }: PosePageProps): Metadata {
  const preset = getPosePreset(params.slug);
  if (!preset) {
    return { title: 'Pose Reference — Mortal Mesh' };
  }
  const title = `${preset.name} — Free 3D Pose Reference for Artists`;
  const description = `${preset.description}. Rotate 360°, toggle 2-Value Notan lighting, inspect Skeleton landmarks, and draw from ${preset.name} in Mortal Mesh 3D Studio.`;
  return {
    title,
    description,
    alternates: { canonical: `/poses/${preset.id}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/poses/${preset.id}`,
      type: 'article',
    },
  };
}

export default function PoseDetailPage({ params }: PosePageProps) {
  const preset = getPosePreset(params.slug);
  if (!preset) {
    notFound();
  }

  const guide = getPoseSeoGuide(preset);
  const studioHref = `/?pose=${encodeURIComponent(preset.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Draw ${preset.name} in 3D`,
    description: preset.description,
    step: guide.constructionSteps.map((text, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      text,
    })),
  };

  return (
    <SeoShell activeNav="poses">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="space-y-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <Link href="/poses" className="hover:text-zinc-200">
            50 3D Poses
          </Link>
          <span>/</span>
          <span>{guide.categoryLabel}</span>
          <span>/</span>
          <span className="text-zinc-200">{preset.name}</span>
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
              {guide.categoryLabel}
            </span>
            {preset.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
              >
                #{tag}
              </span>
            ))}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {preset.name} — 3D Figure Reference
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-300">
            {preset.description}. Launch directly inside Mortal Mesh to rotate the 3D mannequin 360°, switch between Female, Classic, and Skeleton, toggle Loomis construction or 2-Value Notan, and export transparent PNG or layered SVG study sheets.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={studioHref}
              data-testid="seo-open-in-studio-cta"
              className="rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 transition-colors"
            >
              Pose &amp; Rotate in 3D Studio →
            </Link>
            <Link
              href="/?mode=gym&interval=60"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors"
            >
              Sketch in 3D Gesture Gym →
            </Link>
            <Link
              href="/anatomy-school"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors"
            >
              KINETIC-5 Anatomy Course
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Weight &amp; Center of Balance
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.weightAndBalance}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Line of Action Rhythm
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.lineOfAction}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Foreshortening &amp; Camera Study
            </h2>
            <p className="text-xs leading-relaxed text-zinc-300">
              {guide.foreshorteningTip}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 space-y-3">
          <h2 className="text-base font-semibold text-zinc-100">
            Structural Drawing Checklist
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-zinc-300">
            {guide.constructionSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {guide.related.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-100">
              Related {guide.categoryLabel} Poses
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {guide.related.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/poses/${rel.id}`}
                  className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 hover:border-emerald-400/50 transition-colors"
                >
                  <div className="text-xs font-semibold text-zinc-100">
                    {rel.name}
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
