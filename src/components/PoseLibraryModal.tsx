'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SearchIcon,
  SparklesIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import {
  filterPosePresets,
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
} from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';

interface PoseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTheme: StudioThemeId;
  activePosePresetId: string | null;
  isLocked: boolean;
  onSelectPosePreset: (presetId: string) => void;
}

export function PoseLibraryModal({
  isOpen,
  onClose,
  studioTheme,
  activePosePresetId,
  isLocked,
  onSelectPosePreset,
}: PoseLibraryModalProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PoseCategory | 'all'>('all');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setCategory('all');
    }
  }, [isOpen]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: POSE_PRESETS.length };
    for (const cat of POSE_CATEGORIES) {
      counts[cat.id] = 0;
    }
    for (const preset of POSE_PRESETS) {
      counts[preset.category] = (counts[preset.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const filteredPoses = useMemo(
    () => filterPosePresets(query, category),
    [query, category]
  );

  if (!isOpen) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="50 Famous Poses Library"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={`flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl select-none sm:max-h-[85dvh] ${ui.panel}`}
      >
        {/* Header */}
        <header
          className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 ${ui.header}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <SparklesIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
            <h2
              className={`text-xs font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
            >
              Pose Library
            </h2>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${ui.monoPill}`}
            >
              {filteredPoses.length} / {POSE_PRESETS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pose library"
            className={`flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Search & Category Strip */}
        <div className={`shrink-0 space-y-2.5 border-b px-4 py-3 ${ui.hairline}`}>
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${ui.card}`}
          >
            <SearchIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textMuted}`} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search 50 poses, styles, tags..."
              aria-label="Search pose library"
              className={`w-full bg-transparent text-[12px] outline-none placeholder:opacity-60 ${ui.textPrimary}`}
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search query"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${ui.iconButton}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="studio-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              aria-pressed={category === 'all'}
              onClick={() => {
                setCategory('all');
                setQuery('');
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                category === 'all' ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              All ({categoryCounts.all})
            </button>
            {POSE_CATEGORIES.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setCategory(cat.id);
                    if (
                      query.trim().length > 0 &&
                      filterPosePresets(query, cat.id).length === 0
                    ) {
                      setQuery('');
                    }
                  }}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    isSelected ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  {cat.label} ({categoryCounts[cat.id] ?? 0})
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Card Grid */}
        <div className="studio-scroll studio-modal-scroll flex-1 overflow-y-auto p-4">
          {filteredPoses.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPoses.map((preset) => {
                const isSelected = activePosePresetId === preset.id;
                const isAerial = !preset.groundSnap && preset.elevationY > 0;
                const catMeta = POSE_CATEGORIES.find(
                  (c) => c.id === preset.category
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-disabled={isLocked}
                    aria-pressed={isSelected}
                    onClick={() => onSelectPosePreset(preset.id)}
                    className={`flex flex-col items-start justify-between gap-2 rounded-xl p-3 text-left transition-all duration-150 ${
                      isLocked
                        ? `${ui.pillButtonDisabled} opacity-75`
                        : isSelected
                          ? ui.pillButtonActive
                          : ui.pillButton
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold leading-snug">
                        {preset.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isAerial && (
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase ${ui.monoPill}`}
                          >
                            AIR
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase ${
                            isSelected && !isLocked
                              ? 'border border-current opacity-75'
                              : ui.badgeMuted
                          }`}
                        >
                          {catMeta?.label ?? preset.category}
                        </span>
                      </div>
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isSelected && !isLocked ? 'opacity-85' : ui.textMuted
                      }`}
                    >
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className={`flex h-40 flex-col items-center justify-center gap-2.5 rounded-xl text-xs ${ui.card} ${ui.textMuted}`}
            >
              <span>No poses match your filter</span>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                className={`rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${ui.pillButton}`}
              >
                Show all 50 poses
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
