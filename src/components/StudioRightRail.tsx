'use client';

import { useRef } from 'react';
import {
  ArrowDownToLineIcon,
  ContrastIcon,
  FlipHorizontalIcon,
  FrameGuidesIcon,
  GridFloorIcon,
  ImageIcon,
  LightbulbIcon,
  LockIcon,
  MoonIcon,
  PinIcon,
  PrecisionSlider,
  RotateCcwIcon,
  RulerIcon,
  SegmentedControl,
  SunIcon,
  ToggleSwitch,
  TrashIcon,
  XIcon,
  type SegmentedOption,
} from '@/components/StudioPrimitives';
import {
  LIGHTING_PRESET_ORDER,
  LIGHTING_PRESETS,
} from '@/data/lightingPresets';
import { STUDIO_THEME_ORDER, STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type {
  CompositionCropRatio,
  CompositionGridType,
  DampingPreset,
  KeyLightSettings,
  LightingPresetId,
  ReferenceOverlayMode,
  ReferenceOverlayState,
  StudioThemeId,
} from '@/types/anatomy';

export type RightRailTab = 'physics' | 'lighting' | 'guides' | 'theme';

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
  showHeadRuler: boolean;
  compositionCrop: CompositionCropRatio;
  compositionGrid: CompositionGridType;
  goldenSpiralFlip: boolean;
  referenceImage: ReferenceOverlayState | null;
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
  onSelectLightingPreset: (presetId: LightingPresetId) => void;
  onResetKeyLight: () => void;
  onToggleHeadRuler: () => void;
  onChangeCompositionCrop: (crop: CompositionCropRatio) => void;
  onChangeCompositionGrid: (grid: CompositionGridType) => void;
  onToggleGoldenSpiralFlip: () => void;
  onImportReferenceImage: (file: File) => void;
  onUpdateReferenceImage: (patch: Partial<ReferenceOverlayState>) => void;
  onRemoveReferenceImage: () => void;
}

const DAMPING_OPTIONS: ReadonlyArray<SegmentedOption<DampingPreset>> = [
  { id: 'soft', label: 'Soft', title: 'Loose ragdoll damping' },
  { id: 'natural', label: 'Natural', title: 'Balanced biomechanical damping' },
  { id: 'heavy', label: 'Heavy', title: 'Thick viscous damping' },
];

const CROP_RATIO_OPTIONS: readonly CompositionCropRatio[] = [
  'off',
  '4:5',
  '16:9',
  '1:1',
  '9:16',
];

const COMP_GRID_OPTIONS: ReadonlyArray<{
  id: CompositionGridType;
  label: string;
}> = [
  { id: 'off', label: 'Off' },
  { id: 'thirds', label: 'Thirds' },
  { id: 'cross', label: 'Cross' },
  { id: 'golden', label: 'Golden' },
];

const REF_MODE_OPTIONS: ReadonlyArray<SegmentedOption<ReferenceOverlayMode>> = [
  { id: 'backdrop', label: 'Backdrop', title: 'Overlay behind/over canvas for tracing' },
  { id: 'pip', label: 'Corner PiP', title: 'Compact floating corner viewer' },
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
  showHeadRuler,
  compositionCrop,
  compositionGrid,
  goldenSpiralFlip,
  referenceImage,
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
  onSelectLightingPreset,
  onResetKeyLight,
  onToggleHeadRuler,
  onChangeCompositionCrop,
  onChangeCompositionGrid,
  onToggleGoldenSpiralFlip,
  onImportReferenceImage,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
}: StudioRightRailProps) {
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const theme = STUDIO_THEMES[studioTheme];
  const { ui } = theme;
  const minElevation = groundEnabled ? 0 : -2;
  const hasActivePhysicsOrFloor = gravityEnabled || !groundEnabled;
  const hasActiveNotan = keyLight.notanEnabled;
  const hasActiveGuidesOrRef =
    showHeadRuler ||
    compositionCrop !== 'off' ||
    compositionGrid !== 'off' ||
    referenceImage !== null;

  const railWrapperClass = viewport.isCompactLandscape
    ? 'fixed z-30 right-2.5 bottom-[70px] flex items-end'
    : 'fixed z-30 right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center';

  const asidePositionClass = viewport.isCompactLandscape
    ? 'relative mr-2.5 w-[248px] max-w-[calc(100vw-4.5rem)] max-h-[calc(100dvh-232px)]'
    : 'relative mr-2.5 w-[248px] max-w-[calc(100vw-4.5rem)] max-h-[min(470px,calc(100dvh-8.5rem))]';

  const dialogTitle =
    activeTab === 'physics'
      ? 'Physics & Floor'
      : activeTab === 'lighting'
        ? 'Lighting & Value'
        : activeTab === 'guides'
          ? 'Guides & Ref'
          : 'Studio Theme';

  const dialogAriaLabel =
    activeTab === 'physics'
      ? 'Physics & Floor'
      : activeTab === 'lighting'
        ? 'Studio Lighting'
        : activeTab === 'guides'
          ? 'Guides & Ref'
          : 'Studio Theme';

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
          aria-label={dialogAriaLabel}
          className={`rounded-2xl border backdrop-blur-xl transition-colors duration-200 overflow-hidden flex flex-col ${asidePositionClass} ${ui.panel}`}
        >
          <div
            className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${ui.header}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${ui.textSecondary}`}
            >
              {dialogTitle}
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
                <div className="space-y-1">
                  <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
                    Lighting Presets
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {LIGHTING_PRESET_ORDER.map((presetId) => {
                      const preset = LIGHTING_PRESETS[presetId];
                      const isActive = keyLight.presetId === presetId;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          data-lighting-preset={presetId}
                          aria-pressed={isActive}
                          title={preset.description}
                          onClick={() => onSelectLightingPreset(presetId)}
                          className={`rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
                            isActive ? ui.pillButtonActive : ui.pillButton
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`border-t pt-2 space-y-2 ${ui.hairline}`}>
                  <ToggleSwitch
                    id="rail-notan-toggle"
                    label="2-Value Shadow (Notan)"
                    checked={keyLight.notanEnabled}
                    onChange={() =>
                      onChangeKeyLight({ notanEnabled: !keyLight.notanEnabled })
                    }
                    theme={theme}
                  />

                  {keyLight.notanEnabled && (
                    <PrecisionSlider
                      id="rail-notan-split"
                      label="Shadow Split"
                      value={keyLight.notanSplit}
                      min={0.2}
                      max={0.8}
                      step={0.02}
                      displayValue={`${Math.round(keyLight.notanSplit * 100)}%`}
                      onChange={(notanSplit) =>
                        onChangeKeyLight({ notanSplit })
                      }
                      theme={theme}
                    />
                  )}
                </div>

                <div className={`border-t pt-2 space-y-2 ${ui.hairline}`}>
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

                  <PrecisionSlider
                    id="rail-rim-light-intensity"
                    label="Rim Intensity"
                    value={keyLight.rimIntensity}
                    min={0}
                    max={2.4}
                    step={0.05}
                    displayValue={keyLight.rimIntensity.toFixed(2)}
                    onChange={(rimIntensity) =>
                      onChangeKeyLight({ rimIntensity })
                    }
                    theme={theme}
                  />

                  <PrecisionSlider
                    id="rail-rim-light-angle"
                    label="Rim Angle"
                    value={keyLight.rimAzimuthOffset}
                    min={90}
                    max={270}
                    step={1}
                    displayValue={`${keyLight.rimAzimuthOffset}°`}
                    onChange={(rimAzimuthOffset) =>
                      onChangeKeyLight({ rimAzimuthOffset })
                    }
                    theme={theme}
                  />

                  <PrecisionSlider
                    id="rail-fill-light-intensity"
                    label="Fill / Bounce"
                    value={keyLight.fillIntensity}
                    min={0.05}
                    max={1.2}
                    step={0.02}
                    displayValue={keyLight.fillIntensity.toFixed(2)}
                    onChange={(fillIntensity) =>
                      onChangeKeyLight({ fillIntensity })
                    }
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
              </div>
            )}

            {activeTab === 'guides' && (
              <div className="space-y-2.5">
                <ToggleSwitch
                  id="rail-head-ruler-toggle"
                  label="Head-Unit Ruler"
                  checked={showHeadRuler}
                  onChange={onToggleHeadRuler}
                  theme={theme}
                />

                <div className={`border-t pt-2 space-y-1.5 ${ui.hairline}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10.5px] font-medium ${ui.textSecondary}`}>
                      Composition Frame
                    </span>
                    <RulerIcon className={`h-3 w-3 ${ui.textMuted}`} />
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {CROP_RATIO_OPTIONS.map((ratio) => {
                      const active = compositionCrop === ratio;
                      return (
                        <button
                          key={ratio}
                          type="button"
                          data-crop-ratio={ratio}
                          aria-pressed={active}
                          onClick={() => onChangeCompositionCrop(ratio)}
                          className={`rounded-md px-1 py-1 font-mono text-[10px] font-medium transition-colors ${
                            active ? ui.pillButtonActive : ui.pillButton
                          }`}
                        >
                          {ratio === 'off' ? 'Off' : ratio}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`border-t pt-2 space-y-1.5 ${ui.hairline}`}>
                  <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
                    Composition Grid
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {COMP_GRID_OPTIONS.map((opt) => {
                      const active = compositionGrid === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-comp-grid={opt.id}
                          aria-pressed={active}
                          onClick={() => onChangeCompositionGrid(opt.id)}
                          className={`rounded-md px-1 py-1 text-[10px] font-medium transition-colors ${
                            active ? ui.pillButtonActive : ui.pillButton
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {compositionGrid === 'golden' && (
                    <ToggleSwitch
                      id="rail-golden-flip-toggle"
                      label="Flip Spiral"
                      checked={goldenSpiralFlip}
                      onChange={onToggleGoldenSpiralFlip}
                      theme={theme}
                    />
                  )}
                </div>

                <div className={`border-t pt-2 space-y-2 ${ui.hairline}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10.5px] font-medium ${ui.textSecondary}`}>
                      Reference Image
                    </span>
                    <ImageIcon className={`h-3.5 w-3.5 ${ui.textMuted}`} />
                  </div>

                  <input
                    ref={refFileInputRef}
                    type="file"
                    accept="image/*"
                    data-testid="reference-image-input"
                    aria-label="Import local reference image"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) {
                        onImportReferenceImage(file);
                      }
                    }}
                  />

                  <button
                    type="button"
                    data-testid="import-reference-btn"
                    onClick={() => refFileInputRef.current?.click()}
                    className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
                  >
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {referenceImage ? 'Replace Image' : 'Import Image'}
                    </span>
                  </button>

                  {referenceImage && (
                    <div className="space-y-2">
                      <SegmentedControl
                        label="Display Mode"
                        options={REF_MODE_OPTIONS}
                        value={referenceImage.mode}
                        onChange={(mode) =>
                          onUpdateReferenceImage({
                            mode,
                            opacity: mode === 'backdrop' ? 0.35 : 0.95,
                            offsetX: 0,
                            offsetY: 0,
                          })
                        }
                        theme={theme}
                      />

                      <PrecisionSlider
                        id="rail-ref-opacity"
                        label="Opacity"
                        value={referenceImage.opacity}
                        min={0.1}
                        max={0.95}
                        step={0.05}
                        displayValue={`${Math.round(referenceImage.opacity * 100)}%`}
                        onChange={(opacity) =>
                          onUpdateReferenceImage({ opacity })
                        }
                        theme={theme}
                      />

                      <PrecisionSlider
                        id="rail-ref-scale"
                        label="Scale"
                        value={referenceImage.scale}
                        min={0.25}
                        max={1.8}
                        step={0.05}
                        displayValue={`${Math.round(referenceImage.scale * 100)}%`}
                        onChange={(scale) => onUpdateReferenceImage({ scale })}
                        theme={theme}
                      />

                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          aria-pressed={referenceImage.flipH}
                          onClick={() =>
                            onUpdateReferenceImage({
                              flipH: !referenceImage.flipH,
                            })
                          }
                          className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
                            referenceImage.flipH
                              ? ui.pillButtonActive
                              : ui.pillButton
                          }`}
                        >
                          <FlipHorizontalIcon className="h-3 w-3 shrink-0" />
                          <span>Flip H</span>
                        </button>

                        <button
                          type="button"
                          data-testid="reference-lock-toggle"
                          aria-pressed={referenceImage.locked}
                          onClick={() =>
                            onUpdateReferenceImage({
                              locked: !referenceImage.locked,
                            })
                          }
                          className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
                            referenceImage.locked
                              ? ui.pillButtonActive
                              : ui.pillButton
                          }`}
                        >
                          <LockIcon className="h-3 w-3 shrink-0" />
                          <span>Lock</span>
                        </button>

                        <button
                          type="button"
                          data-testid="reference-remove-btn"
                          onClick={onRemoveReferenceImage}
                          className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${ui.pillButton}`}
                        >
                          <TrashIcon className="h-3 w-3 shrink-0" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
          title="Lighting & Value"
          aria-label="Studio Lighting"
          aria-expanded={activeTab === 'lighting'}
          className={`relative flex items-center justify-center rounded-xl transition-colors ${
            viewport.isCompactLandscape ? 'h-8 w-8' : 'h-9 w-9'
          } ${activeTab === 'lighting' ? ui.dockButtonActive : ui.dockButton}`}
        >
          <LightbulbIcon className="w-4 h-4" />
          {hasActiveNotan && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleTab('guides')}
          title="Guides & Ref"
          aria-label="Guides & Ref"
          aria-expanded={activeTab === 'guides'}
          className={`relative flex items-center justify-center rounded-xl transition-colors ${
            viewport.isCompactLandscape ? 'h-8 w-8' : 'h-9 w-9'
          } ${activeTab === 'guides' ? ui.dockButtonActive : ui.dockButton}`}
        >
          <FrameGuidesIcon className="w-4 h-4" />
          {hasActiveGuidesOrRef && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-400"
            />
          )}
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
