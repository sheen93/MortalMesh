'use client';

import {
  ArrowDownToLineIcon,
  ContrastIcon,
  GridFloorIcon,
  LightbulbIcon,
  MoonIcon,
  PinIcon,
  RotateCcwIcon,
  SunIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import {
  PrecisionSlider,
  SegmentedControl,
  ToggleSwitch,
  type SegmentedOption,
} from '@/components/StudioPrimitives';
import { STUDIO_THEME_ORDER, STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type {
  DampingPreset,
  KeyLightSettings,
  StudioThemeId,
} from '@/types/anatomy';

export type RightRailTab = 'physics' | 'lighting' | 'theme';

interface StudioRightRailProps {
  studioTheme: StudioThemeId;
  activeTab: RightRailTab | null;
  viewport: ViewportProfile;
  isHudMinimized?: boolean;
  isLocked: boolean;
  gravityEnabled: boolean;
  dampingPreset: DampingPreset;
  pinnedBonesCount: number;
  groundEnabled: boolean;
  groundSnapEnabled: boolean;
  elevationY: number;
  keyLight: KeyLightSettings;
  onToggleTab: (tab: RightRailTab) => void;
  onCloseTab: () => void;
  onSelectStudioTheme: (theme: StudioThemeId) => void;
  onToggleGravity: () => void;
  onChangeDampingPreset: (preset: DampingPreset) => void;
  onClearAllPins: () => void;
  onToggleGround: () => void;
  onToggleGroundSnap: () => void;
  onChangeElevation: (elevationY: number) => void;
  onCommitSliderHistory: () => void;
  onDropToFloor: () => void;
  onChangeKeyLight: (patch: Partial<KeyLightSettings>) => void;
  onResetKeyLight: () => void;
}

const DAMPING_OPTIONS: ReadonlyArray<SegmentedOption<DampingPreset>> = [
  { id: 'soft', label: 'Soft', title: 'Loose ragdoll damping' },
  { id: 'natural', label: 'Natural', title: 'Balanced biomechanical damping' },
  { id: 'heavy', label: 'Heavy', title: 'Thick viscous damping' },
];

function ThemeIcon({
  id,
  className = 'w-4 h-4',
}: {
  id: StudioThemeId;
  className?: string;
}) {
  if (id === 'light') return <SunIcon className={className} />;
  if (id === 'gray') return <ContrastIcon className={className} />;
  return <MoonIcon className={className} />;
}

export function StudioRightRail({
  studioTheme,
  activeTab,
  viewport,
  isHudMinimized = false,
  isLocked,
  gravityEnabled,
  dampingPreset,
  pinnedBonesCount,
  groundEnabled,
  groundSnapEnabled,
  elevationY,
  keyLight,
  onToggleTab,
  onCloseTab,
  onSelectStudioTheme,
  onToggleGravity,
  onChangeDampingPreset,
  onClearAllPins,
  onToggleGround,
  onToggleGroundSnap,
  onChangeElevation,
  onCommitSliderHistory,
  onDropToFloor,
  onChangeKeyLight,
  onResetKeyLight,
}: StudioRightRailProps) {
  const theme = STUDIO_THEMES[studioTheme];
  const { ui } = theme;
  const minElevation = groundEnabled ? 0 : -2;
  const hasActivePhysicsOrFloor = gravityEnabled || !groundEnabled;

  const railWrapperClass = viewport.isCompactLandscape
    ? 'fixed z-30 right-2.5 bottom-[70px] flex items-end'
    : 'fixed z-30 right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center';

  const asidePositionClass = viewport.isCompactLandscape
    ? 'relative mr-2.5 w-[244px] max-w-[calc(100vw-4.5rem)] max-h-[calc(100dvh-232px)]'
    : 'relative mr-2.5 w-[244px] max-w-[calc(100vw-4.5rem)] max-h-[min(450px,calc(100dvh-8.5rem))]';

  return (
    <div
      data-testid="studio-right-rail"
      aria-hidden={isHudMinimized}
      onPointerDown={(e) => {
        if (!isHudMinimized) e.stopPropagation();
      }}
      className={`${railWrapperClass} transition-all duration-200 ${
        isHudMinimized
          ? 'opacity-0 translate-x-4 pointer-events-none'
          : 'opacity-100 translate-x-0'
      }`}
    >
      {activeTab !== null && !isHudMinimized && (
        <aside
          role="dialog"
          aria-label={
            activeTab === 'physics'
              ? 'Physics & Floor'
              : activeTab === 'lighting'
                ? 'Studio Lighting'
                : 'Studio Theme'
          }
          className={`rounded-2xl border backdrop-blur-xl transition-colors duration-200 overflow-hidden flex flex-col ${asidePositionClass} ${ui.panel}`}
        >
          <div
            className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${ui.header}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${ui.textSecondary}`}
            >
              {activeTab === 'physics'
                ? 'Physics & Floor'
                : activeTab === 'lighting'
                  ? 'Studio Lighting'
                  : 'Studio Theme'}
            </span>
            <button
              type="button"
              onClick={onCloseTab}
              title="Close panel"
              aria-label="Close panel"
              className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${ui.iconButton}`}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="studio-scroll flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2.5">
            {activeTab === 'physics' && (
              <>
                <div className="space-y-2">
                  <ToggleSwitch
                    id="rail-gravity-toggle"
                    label="Gravity Physics"
                    checked={gravityEnabled}
                    onChange={onToggleGravity}
                    theme={theme}
                  />

                  <SegmentedControl
                    label="Joint Damping"
                    options={DAMPING_OPTIONS}
                    value={dampingPreset}
                    onChange={onChangeDampingPreset}
                    theme={theme}
                  />

                  {pinnedBonesCount > 0 && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={onClearAllPins}
                      className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        isLocked ? ui.pillButtonDisabled : ui.pillButton
                      }`}
                    >
                      <PinIcon className="h-3 w-3 shrink-0" />
                      <span>Clear All Pins ({pinnedBonesCount})</span>
                    </button>
                  )}
                </div>

                <div className={`border-t pt-2.5 space-y-2 ${ui.hairline}`}>
                  <ToggleSwitch
                    id="rail-ground-floor-toggle"
                    label="Ground Floor"
                    checked={groundEnabled}
                    onChange={onToggleGround}
                    theme={theme}
                  />

                  <ToggleSwitch
                    id="rail-ground-snap-toggle"
                    label="Ground Snap"
                    checked={groundSnapEnabled}
                    disabled={isLocked}
                    onChange={onToggleGroundSnap}
                    theme={theme}
                  />

                  <PrecisionSlider
                    id="rail-elevation-y-slider"
                    label="Elevation (Y)"
                    value={elevationY}
                    min={minElevation}
                    max={2}
                    step={0.01}
                    disabled={isLocked}
                    displayValue={`${elevationY.toFixed(2)}m`}
                    onChange={onChangeElevation}
                    onCommit={onCommitSliderHistory}
                    theme={theme}
                  />

                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={onDropToFloor}
                    className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                      isLocked ? ui.pillButtonDisabled : ui.pillButton
                    }`}
                  >
                    <ArrowDownToLineIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Drop</span>
                  </button>
                </div>
              </>
            )}

            {activeTab === 'lighting' && (
              <div className="space-y-2.5">
                <PrecisionSlider
                  id="rail-key-light-azimuth"
                  label="Key Azimuth"
                  value={keyLight.azimuth}
                  min={0}
                  max={360}
                  step={1}
                  displayValue={`${keyLight.azimuth}°`}
                  onChange={(azimuth) => onChangeKeyLight({ azimuth })}
                  theme={theme}
                />

                <PrecisionSlider
                  id="rail-key-light-elevation"
                  label="Key Elevation"
                  value={keyLight.elevation}
                  min={15}
                  max={85}
                  step={1}
                  displayValue={`${keyLight.elevation}°`}
                  onChange={(elevation) => onChangeKeyLight({ elevation })}
                  theme={theme}
                />

                <PrecisionSlider
                  id="rail-key-light-intensity"
                  label="Key Intensity"
                  value={keyLight.intensity}
                  min={0.4}
                  max={2.8}
                  step={0.05}
                  displayValue={keyLight.intensity.toFixed(2)}
                  onChange={(intensity) => onChangeKeyLight({ intensity })}
                  theme={theme}
                />

                <button
                  type="button"
                  onClick={onResetKeyLight}
                  className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <RotateCcwIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Reset Light</span>
                </button>
              </div>
            )}

            {activeTab === 'theme' && (
              <div
                role="radiogroup"
                aria-label="Studio Theme"
                className="grid grid-cols-3 gap-1.5"
              >
                {STUDIO_THEME_ORDER.map((id) => {
                  const spec = STUDIO_THEMES[id];
                  const isActive = studioTheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onSelectStudioTheme(id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors ${
                        isActive ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      <ThemeIcon id={id} className="w-4 h-4 shrink-0" />
                      <span>{spec.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}

      <div
        className={`flex flex-col items-center gap-1 rounded-2xl border p-1 backdrop-blur-xl transition-colors duration-200 ${ui.dock}`}
      >
        <button
          type="button"
          onClick={() => onToggleTab('physics')}
          title="Physics & Floor"
          aria-label="Physics & Floor"
          aria-expanded={activeTab === 'physics'}
          className={`relative flex items-center justify-center rounded-xl transition-colors ${
            viewport.isCompactLandscape ? 'h-8 w-8' : 'h-9 w-9'
          } ${activeTab === 'physics' ? ui.dockButtonActive : ui.dockButton}`}
        >
          <GridFloorIcon className="w-4 h-4" />
          {hasActivePhysicsOrFloor && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleTab('lighting')}
          title="Studio Lighting"
          aria-label="Studio Lighting"
          aria-expanded={activeTab === 'lighting'}
          className={`flex items-center justify-center rounded-xl transition-colors ${
            viewport.isCompactLandscape ? 'h-8 w-8' : 'h-9 w-9'
          } ${activeTab === 'lighting' ? ui.dockButtonActive : ui.dockButton}`}
        >
          <LightbulbIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onToggleTab('theme')}
          title={`Studio Theme (${theme.label})`}
          aria-label="Studio Theme"
          aria-expanded={activeTab === 'theme'}
          className={`flex items-center justify-center rounded-xl transition-colors ${
            viewport.isCompactLandscape ? 'h-8 w-8' : 'h-9 w-9'
          } ${activeTab === 'theme' ? ui.dockButtonActive : ui.dockButton}`}
        >
          <ThemeIcon id={studioTheme} className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
