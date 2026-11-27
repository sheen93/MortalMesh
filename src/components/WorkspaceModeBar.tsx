'use client';

import {
  BoxIcon,
  GraduationCapIcon,
  PencilIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';
import type { WorkspaceTier } from '@/types/pad';

interface WorkspaceModeBarProps {
  tier: WorkspaceTier;
  onSelectTier: (tier: WorkspaceTier) => void;
  studioTheme: StudioThemeId;
  inline?: boolean;
  isHudMinimized?: boolean;
  offsetLeftPx?: number;
}

const TIER_OPTIONS: ReadonlyArray<{
  id: WorkspaceTier;
  label: string;
  title: string;
}> = [
  { id: 'studio', label: 'Studio', title: '3D Figure & Posing Studio' },
  { id: 'pad', label: 'Pad', title: 'Atelier 2D Drawing Pad alongside 3D' },
  { id: 'school', label: 'School', title: 'Anatomy School & Guided Drills' },
];

function TierIcon({ id }: { id: WorkspaceTier }) {
  if (id === 'studio') return <BoxIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />;
  if (id === 'pad') return <PencilIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />;
  return <GraduationCapIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />;
}

export function WorkspaceModeBar({
  tier,
  onSelectTier,
  studioTheme,
  inline = false,
  isHudMinimized = false,
  offsetLeftPx = 0,
}: WorkspaceModeBarProps) {
  if (!inline && isHudMinimized) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  const segmented = (
    <nav
      role="tablist"
      aria-label="Workspace mode switcher"
      data-testid="workspace-mode-bar"
      onPointerDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-0.5 rounded-xl p-0.5 select-none ${ui.dock}`}
    >
      {TIER_OPTIONS.map((opt) => {
        const active = tier === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            data-testid={`tier-btn-${opt.id}`}
            title={opt.title}
            onClick={() => onSelectTier(opt.id)}
            className={`flex items-center gap-1 rounded-[9px] px-1.5 py-1 text-[10px] sm:px-2.5 sm:text-[11px] font-semibold transition-all duration-150 ${
              active ? ui.segmentedItemActive : ui.segmentedItem
            }`}
          >
            <TierIcon id={opt.id} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </nav>
  );

  if (inline) {
    return segmented;
  }

  return (
    <div
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: offsetLeftPx ? `calc(50% + ${offsetLeftPx}px)` : '50%',
      }}
      className="fixed -translate-x-1/2 z-30 pointer-events-auto"
    >
      {segmented}
    </div>
  );
}
