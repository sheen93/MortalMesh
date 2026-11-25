'use client';

import { useRef, useState, type RefObject } from 'react';
import {
  BookmarkIcon,
  HomeIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import {
  CAMERA_PRESETS,
  type CameraPreset,
  type StudioThemeId,
} from '@/types/anatomy';
import { MAX_CAMERA_BOOKMARKS, type CameraBookmark } from '@/types/sceneIO';

interface ViewportGizmoProps {
  cubeRef: RefObject<HTMLDivElement>;
  studioTheme: StudioThemeId;
  activePreset: CameraPreset;
  viewport: ViewportProfile;
  bookmarks: readonly CameraBookmark[];
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onSelectFace: (direction: [number, number, number]) => void;
  onOrbitDrag: (deltaX: number, deltaY: number) => void;
  onAddBookmark: () => void;
  onSelectBookmark: (bookmark: CameraBookmark) => void;
  onDeleteBookmark: (id: string) => void;
}

interface CubeFaceConfig {
  id: string;
  label: string;
  direction: [number, number, number];
  rotatePrefix: string;
}

const CUBE_FACES: ReadonlyArray<CubeFaceConfig> = [
  {
    id: 'front',
    label: 'FRONT',
    direction: [0, 0, 1],
    rotatePrefix: '',
  },
  {
    id: 'back',
    label: 'BACK',
    direction: [0, 0, -1],
    rotatePrefix: 'rotateY(180deg) ',
  },
  {
    id: 'right',
    label: 'RIGHT',
    direction: [1, 0, 0],
    rotatePrefix: 'rotateY(90deg) ',
  },
  {
    id: 'left',
    label: 'LEFT',
    direction: [-1, 0, 0],
    rotatePrefix: 'rotateY(-90deg) ',
  },
  {
    id: 'top',
    label: 'TOP',
    direction: [0, 1, 0.001],
    rotatePrefix: 'rotateX(90deg) ',
  },
  {
    id: 'bottom',
    label: 'BOTTOM',
    direction: [0, -1, 0.001],
    rotatePrefix: 'rotateX(-90deg) ',
  },
];

const COMPACT_CAMERA_PILLS: ReadonlyArray<{
  id: CameraPreset;
  shortLabel: string;
}> = [
  { id: '1-point', shortLabel: '1-PT' },
  { id: '2-point', shortLabel: '2-PT' },
  { id: '3-point', shortLabel: '3-PT' },
];

export function ViewportGizmo({
  cubeRef,
  studioTheme,
  activePreset,
  viewport,
  bookmarks,
  onSelectCameraPreset,
  onSelectFace,
  onOrbitDrag,
  onAddBookmark,
  onSelectBookmark,
  onDeleteBookmark,
}: ViewportGizmoProps) {
  const theme = STUDIO_THEMES[studioTheme];
  const { ui, viewCube } = theme;
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  const [isDraggingCube, setIsDraggingCube] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  const compact = viewport.isMobile || viewport.isCompactLandscape;
  const cubeSize = compact ? 46 : 60;
  const halfDepth = cubeSize / 2;
  const atBookmarkLimit = bookmarks.length >= MAX_CAMERA_BOOKMARKS;

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
    if (!state.moved && Math.hypot(totalDx, totalDy) > 4) {
      state.moved = true;
      setIsDraggingCube(true);
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

  const pillBtnSize = compact || viewport.isCoarsePointer ? 'h-8' : 'h-7';
  const iconBtnSize =
    compact || viewport.isCoarsePointer ? 'h-8 w-8' : 'h-7 w-7';

  return (
    <div
      className="fixed z-20 flex flex-col items-end gap-2 pointer-events-none select-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
    >
      {/* Interactive 3D ViewCube Stage */}
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
            setHoveredFace(null);
          }
        }}
        className={`pointer-events-auto relative flex items-center justify-center rounded-2xl viewcube-scene ${
          compact ? 'h-[70px] w-[70px]' : 'h-[96px] w-[96px]'
        } ${isDraggingCube ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
      >
        <div
          ref={cubeRef}
          className="viewcube-cube relative"
          style={{ width: cubeSize, height: cubeSize }}
        >
          {CUBE_FACES.map((face) => {
            const isHovered = hoveredFace === face.id && !isDraggingCube;
            return (
              <button
                key={face.id}
                type="button"
                aria-label={`Snap camera to ${face.label.toLowerCase()} view`}
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
                    pendingDirection: face.direction,
                  };
                }}
                onPointerEnter={() => setHoveredFace(face.id)}
                onPointerLeave={() =>
                  setHoveredFace((prev) => (prev === face.id ? null : prev))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectFace(face.direction);
                  }
                }}
                className={`viewcube-face absolute inset-0 flex items-center justify-center rounded-[5px] font-mono font-semibold uppercase transition-colors duration-150 focus-visible:outline-none ${
                  compact
                    ? 'text-[7.5px] tracking-[0.06em]'
                    : 'text-[9.5px] tracking-[0.1em]'
                }`}
                style={{
                  transform: `${face.rotatePrefix}translateZ(${halfDepth}px)`,
                  backgroundColor: isHovered
                    ? viewCube.faceHoverBg
                    : viewCube.faceBg,
                  color: isHovered
                    ? viewCube.faceHoverText
                    : viewCube.faceText,
                  border: `1px solid ${viewCube.faceBorder}`,
                  boxShadow: viewCube.faceShadow,
                }}
              >
                {face.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Frosted Camera Snap & Bookmarks Pill Bar */}
      <div
        role="toolbar"
        aria-label="Camera perspective shortcuts"
        onPointerDown={(event) => event.stopPropagation()}
        className={`pointer-events-auto flex items-center gap-0.5 rounded-xl p-1 sm:gap-1 ${ui.dock}`}
      >
        <button
          type="button"
          onClick={() => onSelectCameraPreset('1-point')}
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
        {COMPACT_CAMERA_PILLS.map((pill) => {
          const isSelected = activePreset === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              aria-pressed={isSelected}
              title={CAMERA_PRESETS[pill.id].description}
              onClick={() => onSelectCameraPreset(pill.id)}
              className={`${pillBtnSize} rounded-lg font-mono font-semibold tracking-tight transition-all duration-150 ${
                compact ? 'px-1.5 text-[9.5px]' : 'px-2 text-[10.5px]'
              } ${isSelected ? ui.dockButtonActive : ui.dockButton}`}
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

      {/* Saved Camera Bookmarks Popover */}
      {bookmarksOpen && (
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
