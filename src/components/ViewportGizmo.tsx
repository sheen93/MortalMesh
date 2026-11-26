'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  BookmarkIcon,
  ChevronDownIcon,
  HomeIcon,
  PlusIcon,
  PrecisionSlider,
  ToggleSwitch,
  TrashIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import {
  CAMERA_PRESET_ORDER,
  CAMERA_PRESETS,
  isFisheyePreset,
  type CameraPreset,
  type StudioThemeId,
} from '@/types/anatomy';
import { MAX_CAMERA_BOOKMARKS, type CameraBookmark } from '@/types/sceneIO';
import { MAX_LENS_CURVATURE, MIN_LENS_CURVATURE } from '@/utils/lensWarp';

interface ViewportGizmoProps {
  cubeRef: RefObject<HTMLDivElement>;
  studioTheme: StudioThemeId;
  activePreset: CameraPreset;
  lensCurvature: number;
  showPerspectiveGuides: boolean;
  viewport: ViewportProfile;
  isHudMinimized?: boolean;
  bookmarks: readonly CameraBookmark[];
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onChangeLensCurvature: (value: number) => void;
  onTogglePerspectiveGuides: (enabled: boolean) => void;
  onSelectFace: (direction: [number, number, number]) => void;
  onOrbitDrag: (deltaX: number, deltaY: number) => void;
  onAddBookmark: () => void;
  onSelectBookmark: (bookmark: CameraBookmark) => void;
  onDeleteBookmark: (id: string) => void;
}

type AxisTuple = readonly [number, number, number];

interface CubeFaceConfig {
  id: string;
  label: string;
  rotatePrefix: string;
  normal: AxisTuple;
  uAxis: AxisTuple; // Left-to-right across CSS columns (col 0 -> col 2)
  vAxis: AxisTuple; // Bottom-to-top across CSS rows (row 2 -> row 0)
}

interface CubeZoneDescriptor {
  zoneId: string;
  kind: 'face' | 'edge' | 'corner';
  label: string;
  faceLabel?: string;
  direction: [number, number, number];
  row: number;
  col: number;
}

const CUBE_FACES: ReadonlyArray<CubeFaceConfig> = [
  {
    id: 'front',
    label: 'FRONT',
    rotatePrefix: '',
    normal: [0, 0, 1],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
  },
  {
    id: 'back',
    label: 'BACK',
    rotatePrefix: 'rotateY(180deg) ',
    normal: [0, 0, -1],
    uAxis: [-1, 0, 0],
    vAxis: [0, 1, 0],
  },
  {
    id: 'right',
    label: 'RIGHT',
    rotatePrefix: 'rotateY(90deg) ',
    normal: [1, 0, 0],
    uAxis: [0, 0, -1],
    vAxis: [0, 1, 0],
  },
  {
    id: 'left',
    label: 'LEFT',
    rotatePrefix: 'rotateY(-90deg) ',
    normal: [-1, 0, 0],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
  },
  {
    id: 'top',
    label: 'TOP',
    rotatePrefix: 'rotateX(90deg) ',
    normal: [0, 1, 0],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, -1],
  },
  {
    id: 'bottom',
    label: 'BOTTOM',
    rotatePrefix: 'rotateX(-90deg) ',
    normal: [0, -1, 0],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
  },
];

function formatZoneLabel(dx: number, dy: number, dz: number): string {
  const parts: string[] = [];
  if (dz > 0) parts.push('FRONT');
  else if (dz < 0) parts.push('BACK');
  if (dy > 0) parts.push('TOP');
  else if (dy < 0) parts.push('BOTTOM');
  if (dx > 0) parts.push('RIGHT');
  else if (dx < 0) parts.push('LEFT');
  return parts.join(' · ');
}

function buildFaceZones(face: CubeFaceConfig): CubeZoneDescriptor[] {
  const zones: CubeZoneDescriptor[] = [];
  for (let row = 0; row < 3; row += 1) {
    const vSign = 1 - row; // +1 top row, 0 center row, -1 bottom row
    for (let col = 0; col < 3; col += 1) {
      const uSign = col - 1; // -1 left col, 0 center col, +1 right col
      const dx = face.normal[0] + uSign * face.uAxis[0] + vSign * face.vAxis[0];
      const dy = face.normal[1] + uSign * face.uAxis[1] + vSign * face.vAxis[1];
      const dz = face.normal[2] + uSign * face.uAxis[2] + vSign * face.vAxis[2];
      const axisCount = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      const kind: 'face' | 'edge' | 'corner' =
        axisCount === 1 ? 'face' : axisCount === 2 ? 'edge' : 'corner';
      const safeZ = dx === 0 && dz === 0 ? 0.001 : dz;
      zones.push({
        zoneId: `zone_${dx}_${dy}_${dz}`,
        kind,
        label: formatZoneLabel(dx, dy, dz),
        faceLabel: kind === 'face' ? face.label : undefined,
        direction: [dx, dy, safeZ],
        row,
        col,
      });
    }
  }
  return zones;
}

const FACE_ZONES_MAP: Record<string, CubeZoneDescriptor[]> = Object.fromEntries(
  CUBE_FACES.map((face) => [face.id, buildFaceZones(face)])
);

export function ViewportGizmo({
  cubeRef,
  studioTheme,
  activePreset,
  lensCurvature,
  showPerspectiveGuides,
  viewport,
  isHudMinimized = false,
  bookmarks,
  onSelectCameraPreset,
  onChangeLensCurvature,
  onTogglePerspectiveGuides,
  onSelectFace,
  onOrbitDrag,
  onAddBookmark,
  onSelectBookmark,
  onDeleteBookmark,
}: ViewportGizmoProps) {
  const theme = STUDIO_THEMES[studioTheme];
  const { ui, viewCube } = theme;
  const [hoveredZone, setHoveredZone] = useState<{
    zoneId: string;
    label: string;
  } | null>(null);
  const [isDraggingCube, setIsDraggingCube] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [compactCameraOpen, setCompactCameraOpen] = useState(false);
  const [desktopLensCardOpen, setDesktopLensCardOpen] = useState(false);

  const compact = viewport.isMobile || viewport.isCompactLandscape;
  const cubeSize = compact ? 46 : 64;
  const halfDepth = cubeSize / 2;
  const atBookmarkLimit = bookmarks.length >= MAX_CAMERA_BOOKMARKS;
  const isFisheye = isFisheyePreset(activePreset);
  const curvaturePct = Math.round(lensCurvature * 100);
  const pointerClass = isHudMinimized
    ? 'pointer-events-none'
    : 'pointer-events-auto';

  useEffect(() => {
    if (isHudMinimized) {
      setBookmarksOpen(false);
      setCompactCameraOpen(false);
      setHoveredZone(null);
    }
  }, [isHudMinimized]);

  useEffect(() => {
    if (!isFisheye) {
      setDesktopLensCardOpen(false);
    }
  }, [isFisheye]);

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    pendingDirection: [number, number, number] | null;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    pendingDirection: null,
  });

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active) return;

    const totalDx = event.clientX - state.startX;
    const totalDy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(totalDx, totalDy) > 5) {
      state.moved = true;
      setIsDraggingCube(true);
      setHoveredZone(null);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable
      }
    }

    if (state.moved) {
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      onOrbitDrag(dx, dy);
    }

    state.lastX = event.clientX;
    state.lastY = event.clientY;
  };

  const finishInteraction = (
    event: React.PointerEvent<HTMLDivElement>,
    allowSnap: boolean
  ) => {
    const state = dragStateRef.current;
    if (!state.active) return;

    const direction = state.pendingDirection;
    const didMove = state.moved;

    state.active = false;
    state.pointerId = null;
    state.moved = false;
    state.pendingDirection = null;
    setIsDraggingCube(false);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    if (allowSnap && !didMove && direction) {
      onSelectFace(direction);
    }
  };

  const compactPills = useMemo(
    () =>
      CAMERA_PRESET_ORDER.map((id) => ({
        id,
        shortLabel: CAMERA_PRESETS[id].label,
        description: CAMERA_PRESETS[id].description,
      })),
    []
  );

  const pillBtnSize = compact || viewport.isCoarsePointer ? 'h-8' : 'h-7';
  const iconBtnSize =
    compact || viewport.isCoarsePointer ? 'h-8 w-8' : 'h-7 w-7';

  const handleSelectPresetClick = (presetId: CameraPreset) => {
    if (presetId === 'fisheye') {
      if (isFisheye) {
        if (!compact) {
          setDesktopLensCardOpen((prev) => !prev);
        }
      } else {
        onSelectCameraPreset('fisheye');
        if (!compact) {
          setDesktopLensCardOpen(true);
        }
      }
      return;
    }
    setDesktopLensCardOpen(false);
    onSelectCameraPreset(presetId);
  };

  return (
    <div
      aria-hidden={isHudMinimized}
      className={`fixed z-20 flex flex-col items-end gap-1.5 pointer-events-none select-none transition-all duration-200 ${
        isHudMinimized ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
    >
      {/* Interactive 26-Zone 3D ViewCube Stage */}
      <div className="flex flex-col items-end gap-0.5">
        <div
          role="region"
          aria-label="3D Viewport Orientation Cube"
          onPointerMove={handleStagePointerMove}
          onPointerUp={(event) => {
            event.stopPropagation();
            finishInteraction(event, true);
          }}
          onPointerCancel={(event) => {
            event.stopPropagation();
            finishInteraction(event, false);
          }}
          onPointerLeave={() => {
            if (!dragStateRef.current.active) {
              setHoveredZone(null);
            }
          }}
          className={`${pointerClass} relative flex items-center justify-center rounded-2xl viewcube-scene ${
            compact ? 'h-[64px] w-[64px]' : 'h-[104px] w-[104px]'
          } ${isDraggingCube ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ touchAction: 'none' }}
        >
          <div
            ref={cubeRef}
            className="viewcube-cube relative"
            style={{ width: cubeSize, height: cubeSize }}
          >
            {CUBE_FACES.map((face) => {
              const zones = FACE_ZONES_MAP[face.id];
              return (
                <div
                  key={face.id}
                  className="viewcube-face absolute inset-0 grid overflow-hidden rounded-[5px]"
                  style={{
                    transform: `${face.rotatePrefix}translateZ(${halfDepth}px)`,
                    gridTemplateColumns: '24% 52% 24%',
                    gridTemplateRows: '24% 52% 24%',
                    backgroundColor: viewCube.faceBg,
                    border: `1px solid ${viewCube.faceBorder}`,
                    boxShadow: viewCube.faceShadow,
                  }}
                >
                  {zones.map((zone) => {
                    const isZoneHovered =
                      hoveredZone?.zoneId === zone.zoneId && !isDraggingCube;
                    const hoverBg =
                      zone.kind === 'corner'
                        ? viewCube.cornerHoverBg
                        : zone.kind === 'edge'
                          ? viewCube.edgeHoverBg
                          : viewCube.faceHoverBg;

                    return (
                      <button
                        key={`${face.id}-${zone.zoneId}`}
                        type="button"
                        data-viewcube-zone={zone.zoneId}
                        aria-label={`Snap camera to ${zone.label.toLowerCase()} view`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          dragStateRef.current = {
                            active: true,
                            pointerId: event.pointerId,
                            startX: event.clientX,
                            startY: event.clientY,
                            lastX: event.clientX,
                            lastY: event.clientY,
                            moved: false,
                            pendingDirection: zone.direction,
                          };
                        }}
                        onPointerEnter={() =>
                          setHoveredZone({
                            zoneId: zone.zoneId,
                            label: zone.label,
                          })
                        }
                        onPointerLeave={() =>
                          setHoveredZone((prev) =>
                            prev?.zoneId === zone.zoneId ? null : prev
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectFace(zone.direction);
                          }
                        }}
                        className="relative flex items-center justify-center p-0 transition-colors duration-100 focus-visible:outline-none"
                        style={{
                          backgroundColor: isZoneHovered
                            ? hoverBg
                            : 'transparent',
                          color: isZoneHovered
                            ? viewCube.faceHoverText
                            : viewCube.faceText,
                        }}
                      >
                        {zone.kind === 'face' ? (
                          <span
                            className={`font-mono font-semibold uppercase leading-none ${
                              compact
                                ? 'text-[7px] tracking-[0.04em]'
                                : 'text-[8.5px] tracking-[0.07em]'
                            }`}
                          >
                            {zone.faceLabel}
                          </span>
                        ) : zone.kind === 'corner' ? (
                          <span
                            aria-hidden="true"
                            className="h-1 w-1 rounded-full opacity-35"
                            style={{
                              backgroundColor: isZoneHovered
                                ? viewCube.faceHoverText
                                : viewCube.faceText,
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Non-shifting hover readout pill (fixed height slot) */}
        <div className="flex h-4 items-center justify-end pr-0.5">
          {hoveredZone && !isDraggingCube && (
            <span
              data-testid="viewcube-readout"
              className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.08em] uppercase leading-none ${ui.monoPill}`}
            >
              {hoveredZone.label}
            </span>
          )}
        </div>
      </div>

      {/* Compact Mobile Camera Pill vs Full Desktop Perspective Bar */}
      {compact ? (
        <div
          role="toolbar"
          aria-label="Camera perspective controls"
          onPointerDown={(event) => event.stopPropagation()}
          className={`${pointerClass} flex items-center gap-0.5 rounded-xl p-1 ${ui.dock}`}
        >
          <button
            type="button"
            data-testid="compact-camera-trigger"
            aria-expanded={compactCameraOpen}
            aria-label="Camera perspective options"
            onClick={() => {
              setBookmarksOpen(false);
              setCompactCameraOpen((prev) => !prev);
            }}
            className={`flex h-7 items-center gap-1 rounded-lg px-2 font-mono text-[10px] font-semibold whitespace-nowrap transition-colors ${
              compactCameraOpen ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <span>
              {isFisheye ? `Fisheye · ${curvaturePct}%` : CAMERA_PRESETS[activePreset].label}
            </span>
            <ChevronDownIcon
              className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
                compactCameraOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <span
            className={`h-4 w-px shrink-0 ${ui.verticalDivider}`}
            aria-hidden="true"
          />

          <button
            type="button"
            aria-label="Camera bookmarks"
            aria-expanded={bookmarksOpen}
            title="Saved Camera Views"
            onClick={() => {
              setCompactCameraOpen(false);
              setBookmarksOpen((prev) => !prev);
            }}
            className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
              bookmarksOpen ? ui.dockButtonActive : ui.iconButton
            }`}
          >
            <BookmarkIcon className="h-3.5 w-3.5" />
            {bookmarks.length > 0 && (
              <span
                className={`absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 font-mono text-[8.5px] font-bold leading-none ${ui.monoPill}`}
              >
                {bookmarks.length}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div
          role="toolbar"
          aria-label="Camera perspective shortcuts"
          onPointerDown={(event) => event.stopPropagation()}
          className={`${pointerClass} flex items-center gap-0.5 rounded-xl p-1 sm:gap-1 ${ui.dock}`}
        >
          <button
            type="button"
            onClick={() => handleSelectPresetClick('1-point')}
            aria-label="Reset camera view"
            title="Reset View (Home)"
            className={`flex ${iconBtnSize} items-center justify-center rounded-lg transition-colors duration-150 ${ui.iconButton}`}
          >
            <HomeIcon className="h-3.5 w-3.5" />
          </button>
          <span
            className={`h-4 w-px shrink-0 ${ui.verticalDivider}`}
            aria-hidden="true"
          />
          {compactPills.map((pill) => {
            const isSelected = activePreset === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                aria-pressed={isSelected}
                title={pill.description}
                onClick={() => handleSelectPresetClick(pill.id)}
                className={`${pillBtnSize} rounded-lg font-mono font-semibold tracking-tight transition-all duration-150 px-2 text-[10px] ${
                  isSelected ? ui.dockButtonActive : ui.dockButton
                }`}
              >
                {pill.shortLabel}
              </button>
            );
          })}
          <span
            className={`h-4 w-px shrink-0 ${ui.verticalDivider}`}
            aria-hidden="true"
          />
          <button
            type="button"
            aria-label="Camera bookmarks"
            aria-expanded={bookmarksOpen}
            title="Saved Camera Views"
            onClick={() => setBookmarksOpen((prev) => !prev)}
            className={`relative flex ${iconBtnSize} items-center justify-center rounded-lg transition-colors duration-150 ${
              bookmarksOpen ? ui.dockButtonActive : ui.iconButton
            }`}
          >
            <BookmarkIcon className="h-3.5 w-3.5" />
            {bookmarks.length > 0 && (
              <span
                className={`absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 font-mono text-[8.5px] font-bold leading-none ${ui.monoPill}`}
              >
                {bookmarks.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Compact Mobile Camera & Lens Popover */}
      {compact && compactCameraOpen && !isHudMinimized && (
        <div
          role="dialog"
          aria-label="Camera & Lens"
          onPointerDown={(event) => event.stopPropagation()}
          className={`pointer-events-auto w-[236px] max-w-[calc(100vw-1.5rem)] rounded-2xl p-3 space-y-2.5 ${ui.panel}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10.5px] font-semibold uppercase tracking-[0.11em] ${ui.textPrimary}`}
            >
              Camera &amp; Lens
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleSelectPresetClick('1-point')}
                aria-label="Reset camera view"
                title="Reset View"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
              >
                <HomeIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCompactCameraOpen(false)}
                aria-label="Close camera options"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            role="group"
            aria-label="Camera perspective shortcuts"
            className={`grid grid-cols-4 gap-1 rounded-xl p-1 ${ui.segmentedTrack}`}
          >
            {compactPills.map((pill) => {
              const isSelected = activePreset === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectPresetClick(pill.id)}
                  className={`h-7 rounded-lg font-mono text-[10px] font-semibold transition-colors ${
                    isSelected ? ui.segmentedItemActive : ui.segmentedItem
                  }`}
                >
                  {pill.shortLabel}
                </button>
              );
            })}
          </div>

          {isFisheye && (
            <div className="space-y-2 pt-0.5">
              <PrecisionSlider
                id="lens-curvature-slider"
                label="Fisheye Dome"
                value={lensCurvature}
                min={MIN_LENS_CURVATURE}
                max={MAX_LENS_CURVATURE}
                step={0.05}
                displayValue={`${curvaturePct}%`}
                theme={theme}
                onChange={onChangeLensCurvature}
              />
              <ToggleSwitch
                id="perspective-guides-toggle"
                label="Perspective Guides"
                checked={showPerspectiveGuides}
                theme={theme}
                onChange={() => onTogglePerspectiveGuides(!showPerspectiveGuides)}
              />
            </div>
          )}
        </div>
      )}

      {/* Desktop Fisheye Lens Options Card */}
      {!compact && isFisheye && desktopLensCardOpen && !isHudMinimized && (
        <div
          role="region"
          aria-label="Fisheye lens controls"
          onPointerDown={(event) => event.stopPropagation()}
          className={`pointer-events-auto w-[216px] max-w-[calc(100vw-1.5rem)] rounded-2xl px-3 py-2.5 space-y-2 ${ui.panel}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.11em] ${ui.textMuted}`}
            >
              Fisheye Lens
            </span>
            <button
              type="button"
              onClick={() => setDesktopLensCardOpen(false)}
              aria-label="Hide lens controls"
              className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
          <PrecisionSlider
            id="lens-curvature-slider"
            label="Fisheye Dome"
            value={lensCurvature}
            min={MIN_LENS_CURVATURE}
            max={MAX_LENS_CURVATURE}
            step={0.05}
            displayValue={`${curvaturePct}%`}
            theme={theme}
            onChange={onChangeLensCurvature}
          />
          <ToggleSwitch
            id="perspective-guides-toggle"
            label="Perspective Guides"
            checked={showPerspectiveGuides}
            theme={theme}
            onChange={() => onTogglePerspectiveGuides(!showPerspectiveGuides)}
          />
        </div>
      )}

      {/* Saved Camera Bookmarks Popover */}
      {bookmarksOpen && !isHudMinimized && (
        <div
          role="dialog"
          aria-label="Camera Bookmarks"
          onPointerDown={(event) => event.stopPropagation()}
          className={`pointer-events-auto w-[236px] max-w-[calc(100vw-1.5rem)] rounded-2xl p-3 space-y-2.5 ${ui.panel}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <BookmarkIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textMuted}`} />
              <span
                className={`text-[11px] font-semibold uppercase tracking-[0.11em] ${ui.textPrimary}`}
              >
                Camera Views
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-medium tabular-nums ${ui.monoPill}`}
              >
                {bookmarks.length}/{MAX_CAMERA_BOOKMARKS}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBookmarksOpen(false)}
              aria-label="Close camera bookmarks"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            disabled={atBookmarkLimit}
            onClick={onAddBookmark}
            className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              atBookmarkLimit ? ui.pillButtonDisabled : ui.pillButtonActive
            }`}
          >
            <PlusIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              {atBookmarkLimit
                ? `Limit ${MAX_CAMERA_BOOKMARKS} views reached`
                : 'Save View'}
            </span>
          </button>

          {bookmarks.length > 0 ? (
            <div className="studio-scroll studio-modal-scroll max-h-[172px] space-y-1 overflow-y-auto pr-0.5">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBookmark(bookmark);
                      if (compact) setBookmarksOpen(false);
                    }}
                    className={`flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium truncate transition-colors ${ui.pillButton}`}
                  >
                    {bookmark.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${bookmark.name}`}
                    onClick={() => onDeleteBookmark(bookmark.id)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={`text-[10.5px] leading-snug ${ui.textMuted}`}>
              Orbit to any angle and tap Save View to recall it smoothly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
