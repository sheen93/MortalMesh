'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDownToLineIcon,
  FlipHorizontalIcon,
  LockIcon,
  PinIcon,
  PrecisionSlider,
  RotateCcwIcon,
  SegmentedControl,
  TrashIcon,
  UnlockIcon,
  XIcon,
  type SegmentedOption,
} from '@/components/StudioPrimitives';
import { HAND_GESTURES } from '@/data/handGestures';
import { getJointSpec } from '@/data/jointLimits';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import { getIKHandleLabel } from '@/physics/runtimeIK';
import {
  isCoreBoneName,
  type AxisKey,
  type ContextualAnchor,
  type HandGestureId,
  type HandSide,
  type IKHandleId,
  type JointAngles,
  type JointsDisplayMode,
  type StudioThemeId,
} from '@/types/anatomy';
import type { PropTransformMode, StudioProp } from '@/types/props';

interface JointControlPopoverProps {
  anchor: ContextualAnchor | null;
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  isHudMinimized?: boolean;
  isSidebarOpen: boolean;
  jointsDisplay: JointsDisplayMode;
  jointLimitsEnabled: boolean;
  selectedBoneName: string | null;
  selectedBoneAngles: JointAngles;
  selectedIKHandle: IKHandleId | null;
  moveBodyEnabled: boolean;
  pinnedBones: readonly string[];
  activeHandGestureId: HandGestureId | null;
  hasFingerBones?: boolean;
  selectedProp: StudioProp | null;
  propTransformMode: PropTransformMode;
  ikPinFeet: boolean;
  ikSwivelDeg: number;
  onChangeAxisAngle: (axis: AxisKey, value: number) => void;
  onCommitSliderHistory: () => void;
  onTogglePinSelectedJoint: () => void;
  onResetSelectedJoint: () => void;
  onSetMoveBody: (enabled: boolean) => void;
  onDropToFloor: () => void;
  onApplyHandGesture: (side: HandSide, gestureId: HandGestureId) => void;
  onMirrorHandGesture: (fromSide: HandSide) => void;
  onToggleIKPinFeet: () => void;
  onChangeIKSwivel: (deg: number) => void;
  onCommitIKSwivel: () => void;
  onResetIKLimb: () => void;
  onPlantFootIK: () => void;
  onChangePropTransformMode: (mode: PropTransformMode) => void;
  onDropPropToFloor: (id: string) => void;
  onResetPropScale: (id: string) => void;
  onToggleLockProp: (id: string) => void;
  onDeleteProp: (id: string) => void;
  onClose: () => void;
}

const GIZMO_MODE_OPTIONS: ReadonlyArray<SegmentedOption<'rotate' | 'move'>> = [
  { id: 'rotate', label: 'Rotate' },
  { id: 'move', label: 'Move' },
];

const HAND_TAB_OPTIONS: ReadonlyArray<SegmentedOption<'gestures' | 'wrist'>> = [
  { id: 'gestures', label: 'Gestures' },
  { id: 'wrist', label: 'Wrist' },
];

const IK_HAND_TAB_OPTIONS: ReadonlyArray<SegmentedOption<'gestures' | 'limb'>> = [
  { id: 'gestures', label: 'Gestures' },
  { id: 'limb', label: 'Limb' },
];

const PROP_TRANSFORM_OPTIONS: ReadonlyArray<SegmentedOption<PropTransformMode>> =
  [
    { id: 'translate', label: 'Move' },
    { id: 'rotate', label: 'Rotate' },
    { id: 'scale', label: 'Scale' },
  ];

function pointToRectDistance(
  px: number,
  py: number,
  left: number,
  top: number,
  width: number,
  height: number
): number {
  const cx = Math.max(left, Math.min(px, left + width));
  const cy = Math.max(top, Math.min(py, top + height));
  return Math.hypot(px - cx, py - cy);
}

/**
 * Safe-distance floating contextual popover anchored beside the selected joint,
 * Core-mode hand (unified Gestures | Wrist), IK handle, or Studio Prop.
 * Rendered in DOM overlays so it never blocks or appears in PNG snapshots.
 */
export function JointControlPopover({
  anchor,
  studioTheme,
  viewport,
  isHudMinimized = false,
  isSidebarOpen,
  jointsDisplay,
  jointLimitsEnabled,
  selectedBoneName,
  selectedBoneAngles,
  selectedIKHandle,
  moveBodyEnabled,
  pinnedBones,
  activeHandGestureId,
  hasFingerBones = true,
  selectedProp,
  propTransformMode,
  ikPinFeet,
  ikSwivelDeg,
  onChangeAxisAngle,
  onCommitSliderHistory,
  onTogglePinSelectedJoint,
  onResetSelectedJoint,
  onSetMoveBody,
  onDropToFloor,
  onApplyHandGesture,
  onMirrorHandGesture,
  onToggleIKPinFeet,
  onChangeIKSwivel,
  onCommitIKSwivel,
  onResetIKLimb,
  onPlantFootIK,
  onChangePropTransformMode,
  onDropPropToFloor,
  onResetPropScale,
  onToggleLockProp,
  onDeleteProp,
  onClose,
}: JointControlPopoverProps) {
  const [handTab, setHandTab] = useState<'gestures' | 'wrist'>('gestures');
  const [ikHandTab, setIkHandTab] = useState<'gestures' | 'limb'>('gestures');
  const [mobileAxis, setMobileAxis] = useState<AxisKey>('x');

  const anchorIdentity = anchor ? `${anchor.kind}:${anchor.id}` : null;
  useEffect(() => {
    setHandTab('gestures');
    setIkHandTab('gestures');
    setMobileAxis('x');
  }, [anchorIdentity]);

  if (!anchor) return null;

  const isPropMode =
    anchor.kind === 'prop' && selectedProp !== null && !selectedProp.locked;
  const isIKMode = anchor.kind === 'ik' && selectedIKHandle !== null;
  const isBoneMode =
    anchor.kind === 'bone' &&
    (selectedBoneName !== null || (moveBodyEnabled && anchor.id === 'pelvis'));

  if (!isPropMode && !isIKMode && !isBoneMode) return null;

  const activeBoneId =
    isBoneMode ? (selectedBoneName ?? (moveBodyEnabled ? 'pelvis' : null)) : null;
  const isHandJoint = anchor.id === 'hand_l' || anchor.id === 'hand_r';
  const handSide: HandSide | null =
    anchor.id === 'hand_l' ? 'l' : anchor.id === 'hand_r' ? 'r' : null;
  const isIKHand = isIKMode && isHandJoint;
  const isIKFoot =
    isIKMode && (selectedIKHandle === 'foot_l' || selectedIKHandle === 'foot_r');
  const isIKPelvis = isIKMode && selectedIKHandle === 'pelvis';
  const showHandUnified =
    (isBoneMode && jointsDisplay === 'core' && isHandJoint) || isIKHand;

  const selectedSpec = activeBoneId ? getJointSpec(activeBoneId) : null;
  const selectedIsCore = activeBoneId ? isCoreBoneName(activeBoneId) : false;
  const selectedIsPinned = activeBoneId ? pinnedBones.includes(activeBoneId) : false;
  const visibleAxes: AxisKey[] = selectedSpec
    ? (['x', 'y', 'z'] as const).filter((axis) =>
        jointLimitsEnabled
          ? axis === 'x'
            ? selectedSpec.showX
            : axis === 'y'
              ? selectedSpec.showY
              : selectedSpec.showZ
          : true
      )
    : [];

  const { ui } = STUDIO_THEMES[studioTheme];

  const width = viewport.isMobile ? 212 : 228;
  const estimatedHeight = showHandUnified
    ? 248
    : visibleAxes.length >= 3
      ? 236
      : 186;
  const clearance = viewport.isMobile ? 104 : 136;

  const safeLeft =
    !viewport.isMobile && !viewport.isCompactLandscape && isSidebarOpen
      ? viewport.isTablet
        ? 286
        : 298
      : 12;
  const safeRight = viewport.width - (viewport.isMobile ? 58 : 66);
  const safeTop = viewport.isMobile ? 64 : 18;
  const safeBottom = viewport.height - (viewport.isMobile ? 84 : 88);

  const minLeft = Math.min(safeLeft, Math.max(12, viewport.width - width - 12));
  const maxLeft = Math.max(minLeft, safeRight - width);
  const minTop = safeTop;
  const maxTop = Math.max(minTop, safeBottom - estimatedHeight);

  const clampRect = (rawL: number, rawT: number) => ({
    left: Math.round(Math.max(minLeft, Math.min(maxLeft, rawL))),
    top: Math.round(Math.max(minTop, Math.min(maxTop, rawT))),
  });

  const figCenterX = anchor.figureCenterScreenX ?? viewport.width * 0.5;
  const preferRight = anchor.screenX >= figCenterX;

  const candidatePositions = [
    preferRight
      ? clampRect(
          anchor.screenX + clearance,
          anchor.screenY - estimatedHeight * 0.45
        )
      : clampRect(
          anchor.screenX - width - clearance,
          anchor.screenY - estimatedHeight * 0.45
        ),
    preferRight
      ? clampRect(
          anchor.screenX - width - clearance,
          anchor.screenY - estimatedHeight * 0.45
        )
      : clampRect(
          anchor.screenX + clearance,
          anchor.screenY - estimatedHeight * 0.45
        ),
    clampRect(
      anchor.screenX - width * 0.5,
      anchor.screenY - estimatedHeight - clearance
    ),
    clampRect(anchor.screenX - width * 0.5, anchor.screenY + clearance),
  ];

  let bestPos = candidatePositions[0];
  let bestScore = -Infinity;
  const minSafeClearance = viewport.isMobile ? 86 : 96;

  for (const cand of candidatePositions) {
    const dist = pointToRectDistance(
      anchor.screenX,
      anchor.screenY,
      cand.left,
      cand.top,
      width,
      estimatedHeight
    );
    const hitsViewCube =
      cand.left + width > viewport.width - 255 && cand.top < 235;
    let score = Math.min(dist, clearance);
    if (dist < minSafeClearance) {
      score -= (minSafeClearance - dist) * 6;
    }
    if (hitsViewCube) {
      score -= 180;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPos = cand;
    }
  }

  const mirrorLabel = handSide === 'l' ? 'L → R' : 'R → L';
  const mirrorTitle =
    handSide === 'l'
      ? 'Mirror Left Hand Gesture to Right Hand'
      : 'Mirror Right Hand Gesture to Left Hand';

  // Mobile Bottom Control Tray: docked cleanly above the bottom bar so the
  // central 75%+ of the portrait screen remains completely unobstructed.
  if (viewport.isMobile) {
    const activeMobileAxis: AxisKey = visibleAxes.includes(mobileAxis)
      ? mobileAxis
      : (visibleAxes[0] ?? 'x');
    const activeAxisSpec = selectedSpec?.axes[activeMobileAxis] ?? null;
    const activeAxisMin =
      activeAxisSpec && jointLimitsEnabled ? activeAxisSpec.min : -180;
    const activeAxisMax =
      activeAxisSpec && jointLimitsEnabled ? activeAxisSpec.max : 180;
    const activeAxisVal = selectedBoneAngles[activeMobileAxis];

    const headerTitle = isPropMode
      ? selectedProp.name
      : isIKMode
        ? getIKHandleLabel(selectedIKHandle)
        : (selectedSpec?.label ?? 'Pelvis');

    return (
      <div
        role="dialog"
        aria-label="Contextual joint and object controls"
        data-testid="joint-control-popover"
        data-anchor-id={anchor.id}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        style={{
          left: 10,
          right: 10,
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${
            isHudMinimized ? 14 : 64
          }px)`,
        }}
        className={`fixed z-30 rounded-2xl px-2.5 py-2 space-y-1.5 select-none transition-all duration-200 ${ui.panel}`}
      >
        {/* Ultra-compact 1-row mobile tray header */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[11px] font-semibold leading-tight truncate ${ui.textPrimary}`}
            >
              {headerTitle}
            </span>
            {showHandUnified && (
              <div
                role="tablist"
                aria-label="Hand control mode"
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-md p-0.5 ${ui.segmentedTrack}`}
              >
                {isIKMode
                  ? IK_HAND_TAB_OPTIONS.map((tab) => {
                      const active = ikHandTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          data-testid={`ik-hand-tab-${tab.id}`}
                          aria-selected={active}
                          onClick={() => setIkHandTab(tab.id)}
                          className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                            active ? ui.segmentedItemActive : ui.segmentedItem
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })
                  : HAND_TAB_OPTIONS.map((tab) => {
                      const active = handTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          data-testid={`hand-tab-${tab.id}`}
                          aria-selected={active}
                          onClick={() => setHandTab(tab.id)}
                          className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                            active ? ui.segmentedItemActive : ui.segmentedItem
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {showHandUnified &&
              handSide &&
              hasFingerBones &&
              ((isIKMode && ikHandTab === 'gestures') ||
                (!isIKMode && handTab === 'gestures')) && (
                <button
                  type="button"
                  title={mirrorTitle}
                  aria-label={mirrorTitle}
                  data-testid="hand-gesture-mirror"
                  onClick={() => onMirrorHandGesture(handSide)}
                  className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-[9.5px] font-semibold transition-colors ${ui.pillButton}`}
                >
                  <FlipHorizontalIcon className="h-3 w-3" />
                  <span>{mirrorLabel}</span>
                </button>
              )}

            {isIKFoot && (
              <button
                type="button"
                data-testid="ik-plant-foot"
                title="Plant foot onto studio floor"
                onClick={onPlantFootIK}
                className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[9.5px] font-medium transition-colors ${ui.pillButton}`}
              >
                <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
                <span>Plant</span>
              </button>
            )}

            {isIKPelvis && (
              <button
                type="button"
                title="Drop figure cleanly to floor"
                onClick={onDropToFloor}
                className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[9.5px] font-medium transition-colors ${ui.pillButton}`}
              >
                <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
                <span>Drop</span>
              </button>
            )}

            {isIKMode && (
              <button
                type="button"
                title={
                  isIKPelvis
                    ? 'Stand figure upright from squat'
                    : 'Reset limb to rest pose'
                }
                aria-label="Reset IK limb"
                onClick={onResetIKLimb}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
              >
                <RotateCcwIcon className="h-3 w-3" />
              </button>
            )}

            {isBoneMode && selectedIsCore && (
              <button
                type="button"
                aria-pressed={selectedIsPinned}
                title={selectedIsPinned ? 'Unpin joint' : 'Pin joint against gravity'}
                onClick={onTogglePinSelectedJoint}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  selectedIsPinned ? ui.pillButtonActive : ui.iconButton
                }`}
              >
                <PinIcon className="h-3 w-3" />
              </button>
            )}

            {isBoneMode && activeBoneId && (
              <button
                type="button"
                title="Reset joint to rest pose"
                aria-label="Reset joint"
                onClick={onResetSelectedJoint}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
              >
                <RotateCcwIcon className="h-3 w-3" />
              </button>
            )}

            {isPropMode && (
              <>
                <button
                  type="button"
                  aria-label={`Lock ${selectedProp.name}`}
                  title="Lock prop"
                  onClick={() => onToggleLockProp(selectedProp.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    selectedProp.locked ? ui.pillButtonActive : ui.iconButton
                  }`}
                >
                  {selectedProp.locked ? (
                    <LockIcon className="h-3 w-3" />
                  ) : (
                    <UnlockIcon className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${selectedProp.name}`}
                  title="Delete prop"
                  onClick={() => onDeleteProp(selectedProp.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </>
            )}

            <button
              type="button"
              aria-label="Close joint controls"
              onClick={onClose}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile Body */}
        {showHandUnified && handSide ? (
          isIKMode && ikHandTab === 'limb' ? (
            <PrecisionSlider
              id="ik-swivel-slider"
              label="Elbow Swivel"
              value={ikSwivelDeg}
              min={-90}
              max={90}
              step={1}
              displayValue={`${ikSwivelDeg >= 0 ? '+' : ''}${ikSwivelDeg}°`}
              onChange={onChangeIKSwivel}
              onCommit={onCommitIKSwivel}
              theme={STUDIO_THEMES[studioTheme]}
            />
          ) : isIKMode || handTab === 'gestures' ? (
            hasFingerBones ? (
              <div className="grid grid-cols-4 gap-1">
                {HAND_GESTURES.map((gesture) => {
                  const isSelected = activeHandGestureId === gesture.id;
                  return (
                    <button
                      key={gesture.id}
                      type="button"
                      data-hand-gesture={gesture.id}
                      aria-pressed={isSelected}
                      title={gesture.description}
                      onClick={() => onApplyHandGesture(handSide, gesture.id)}
                      className={`truncate rounded-md px-1 py-1 text-[9.5px] font-medium transition-colors ${
                        isSelected ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      {gesture.shortLabel}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className={`rounded-md px-2 py-1.5 text-center text-[10px] font-medium ${ui.card} ${ui.textMuted}`}
              >
                No finger rig on this model
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              {visibleAxes.length > 0 && (
                <div className="flex items-center gap-1">
                  {visibleAxes.map((axis) => {
                    const axisSpec = selectedSpec?.axes[axis];
                    if (!axisSpec) return null;
                    const active = activeMobileAxis === axis;
                    return (
                      <button
                        key={axis}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setMobileAxis(axis)}
                        className={`flex-1 rounded-md px-1.5 py-1 font-mono text-[9.5px] font-semibold transition-colors ${
                          active ? ui.pillButtonActive : ui.pillButton
                        }`}
                      >
                        {axisSpec.label} {selectedBoneAngles[axis]}°
                      </button>
                    );
                  })}
                </div>
              )}
              {activeAxisSpec && (
                <PrecisionSlider
                  id={`joint-axis-${activeMobileAxis}`}
                  label={activeAxisSpec.label}
                  value={activeAxisVal}
                  min={activeAxisMin}
                  max={activeAxisMax}
                  step={1}
                  displayValue={`${activeAxisVal}°`}
                  onChange={(nextVal) =>
                    onChangeAxisAngle(activeMobileAxis, nextVal)
                  }
                  onCommit={onCommitSliderHistory}
                  theme={STUDIO_THEMES[studioTheme]}
                />
              )}
            </div>
          )
        ) : isPropMode ? (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <SegmentedControl
                options={PROP_TRANSFORM_OPTIONS}
                value={propTransformMode}
                onChange={onChangePropTransformMode}
                theme={STUDIO_THEMES[studioTheme]}
              />
            </div>
            <button
              type="button"
              onClick={() => onDropPropToFloor(selectedProp.id)}
              className={`flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors ${ui.pillButton}`}
            >
              <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
              <span>Drop</span>
            </button>
            <button
              type="button"
              onClick={() => onResetPropScale(selectedProp.id)}
              className={`flex h-7 items-center justify-center rounded-md px-2 text-[10px] font-medium transition-colors ${ui.pillButton}`}
            >
              <span>1:1</span>
            </button>
          </div>
        ) : isIKMode ? (
          isIKFoot ? (
            <PrecisionSlider
              id="ik-swivel-slider"
              label="Knee Swivel"
              value={ikSwivelDeg}
              min={-75}
              max={75}
              step={1}
              displayValue={`${ikSwivelDeg >= 0 ? '+' : ''}${ikSwivelDeg}°`}
              onChange={onChangeIKSwivel}
              onCommit={onCommitIKSwivel}
              theme={STUDIO_THEMES[studioTheme]}
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                data-testid="ik-pin-feet-toggle"
                aria-pressed={ikPinFeet}
                onClick={onToggleIKPinFeet}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-medium transition-colors ${
                  ikPinFeet ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                <PinIcon className="h-3 w-3 shrink-0" />
                <span>{ikPinFeet ? 'Pin Feet: Squat' : 'Pin Feet: Off'}</span>
              </button>
              <span className={`text-[9.5px] truncate ${ui.textMuted}`}>
                {ikPinFeet ? 'Knees bend naturally' : 'Move whole body'}
              </span>
            </div>
          )
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              {activeBoneId === 'pelvis' && (
                <div
                  className={`flex shrink-0 items-center gap-0.5 rounded-md p-0.5 ${ui.segmentedTrack}`}
                >
                  {GIZMO_MODE_OPTIONS.map((opt) => {
                    const active = (moveBodyEnabled ? 'move' : 'rotate') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetMoveBody(opt.id === 'move')}
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                          active ? ui.segmentedItemActive : ui.segmentedItem
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {!(moveBodyEnabled && activeBoneId === 'pelvis') ? (
                visibleAxes.map((axis) => {
                  const axisSpec = selectedSpec?.axes[axis];
                  if (!axisSpec) return null;
                  const active = activeMobileAxis === axis;
                  return (
                    <button
                      key={axis}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMobileAxis(axis)}
                      className={`flex-1 rounded-md px-1.5 py-1 font-mono text-[9.5px] font-semibold transition-colors ${
                        active ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      {axisSpec.label} {selectedBoneAngles[axis]}°
                    </button>
                  );
                })
              ) : (
                <button
                  type="button"
                  onClick={onDropToFloor}
                  className={`flex-1 flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
                  <span>Drop to Floor</span>
                </button>
              )}
            </div>

            {!(moveBodyEnabled && activeBoneId === 'pelvis') &&
              activeAxisSpec && (
                <PrecisionSlider
                  id={`joint-axis-${activeMobileAxis}`}
                  label={activeAxisSpec.label}
                  value={activeAxisVal}
                  min={activeAxisMin}
                  max={activeAxisMax}
                  step={1}
                  displayValue={`${activeAxisVal}°`}
                  onChange={(nextVal) =>
                    onChangeAxisAngle(activeMobileAxis, nextVal)
                  }
                  onCommit={onCommitSliderHistory}
                  theme={STUDIO_THEMES[studioTheme]}
                />
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Contextual joint and object controls"
      data-testid="joint-control-popover"
      data-anchor-id={anchor.id}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        left: bestPos.left,
        top: bestPos.top,
        width,
      }}
      className={`fixed z-30 rounded-2xl p-2.5 space-y-2 select-none ${ui.panel}`}
    >
      {/* Contextual Header */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div
            className={`text-[11.5px] font-semibold leading-tight truncate ${ui.textPrimary}`}
          >
            {isPropMode
              ? selectedProp.name
              : isIKMode
                ? getIKHandleLabel(selectedIKHandle)
                : (selectedSpec?.label ?? 'Pelvis')}
          </div>
          <div
            className={`font-mono text-[9.5px] leading-tight mt-0.5 truncate ${ui.textMuted}`}
          >
            {isPropMode
              ? 'Studio Prop'
              : isIKMode
                ? `IK · ${selectedIKHandle}`
                : activeBoneId}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isBoneMode && selectedIsCore && (
            <button
              type="button"
              aria-pressed={selectedIsPinned}
              title={selectedIsPinned ? 'Unpin joint' : 'Pin joint against gravity'}
              onClick={onTogglePinSelectedJoint}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                selectedIsPinned ? ui.pillButtonActive : ui.iconButton
              }`}
            >
              <PinIcon className="h-3 w-3" />
            </button>
          )}

          {isBoneMode && activeBoneId && (
            <button
              type="button"
              title="Reset joint to rest pose"
              aria-label="Reset joint"
              onClick={onResetSelectedJoint}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
            >
              <RotateCcwIcon className="h-3 w-3" />
            </button>
          )}

          {isIKMode && (
            <button
              type="button"
              title={
                isIKPelvis
                  ? 'Stand figure upright from squat'
                  : 'Reset limb to rest pose'
              }
              aria-label="Reset IK limb"
              onClick={onResetIKLimb}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
            >
              <RotateCcwIcon className="h-3 w-3" />
            </button>
          )}

          {isPropMode && (
            <>
              <button
                type="button"
                aria-label={`Lock ${selectedProp.name}`}
                title="Lock prop"
                onClick={() => onToggleLockProp(selectedProp.id)}
                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                  selectedProp.locked ? ui.pillButtonActive : ui.iconButton
                }`}
              >
                {selectedProp.locked ? (
                  <LockIcon className="h-3 w-3" />
                ) : (
                  <UnlockIcon className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Delete ${selectedProp.name}`}
                title="Delete prop"
                onClick={() => onDeleteProp(selectedProp.id)}
                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </>
          )}

          <button
            type="button"
            aria-label="Close joint controls"
            onClick={onClose}
            className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Unified Hand Gestures + Wrist/Limb Mode */}
      {showHandUnified && handSide ? (
        <div className="space-y-2">
          <div
            role="tablist"
            aria-label="Hand control mode"
            className={`grid grid-cols-2 gap-0.5 rounded-lg p-0.5 ${ui.segmentedTrack}`}
          >
            {isIKMode
              ? IK_HAND_TAB_OPTIONS.map((tab) => {
                  const active = ikHandTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      data-testid={`ik-hand-tab-${tab.id}`}
                      aria-selected={active}
                      onClick={() => setIkHandTab(tab.id)}
                      className={`rounded-md py-1 text-[10.5px] font-medium transition-colors ${
                        active ? ui.segmentedItemActive : ui.segmentedItem
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })
              : HAND_TAB_OPTIONS.map((tab) => {
                  const active = handTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      data-testid={`hand-tab-${tab.id}`}
                      aria-selected={active}
                      onClick={() => setHandTab(tab.id)}
                      className={`rounded-md py-1 text-[10.5px] font-medium transition-colors ${
                        active ? ui.segmentedItemActive : ui.segmentedItem
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
          </div>

          {isIKMode && ikHandTab === 'limb' ? (
            <div className="space-y-2">
              <PrecisionSlider
                id="ik-swivel-slider"
                label="Elbow Swivel"
                value={ikSwivelDeg}
                min={-90}
                max={90}
                step={1}
                displayValue={`${ikSwivelDeg >= 0 ? '+' : ''}${ikSwivelDeg}°`}
                onChange={onChangeIKSwivel}
                onCommit={onCommitIKSwivel}
                theme={STUDIO_THEMES[studioTheme]}
              />
              <p className={`text-[10px] leading-snug ${ui.textMuted}`}>
                Drag reticle, axis arrows, or center ring to pose live.
              </p>
            </div>
          ) : isIKMode || handTab === 'gestures' ? (
            hasFingerBones ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  title={mirrorTitle}
                  aria-label={mirrorTitle}
                  data-testid="hand-gesture-mirror"
                  onClick={() => onMirrorHandGesture(handSide)}
                  className={`w-full inline-flex h-6 items-center justify-center gap-1 rounded-lg px-2 font-mono text-[10px] font-semibold transition-colors ${ui.pillButton}`}
                >
                  <FlipHorizontalIcon className="h-3 w-3" />
                  <span>Mirror {mirrorLabel}</span>
                </button>

                <div className="grid grid-cols-3 gap-1">
                  {HAND_GESTURES.map((gesture) => {
                    const isSelected = activeHandGestureId === gesture.id;
                    return (
                      <button
                        key={gesture.id}
                        type="button"
                        data-hand-gesture={gesture.id}
                        aria-pressed={isSelected}
                        title={gesture.description}
                        onClick={() => onApplyHandGesture(handSide, gesture.id)}
                        className={`truncate rounded-lg px-1 py-1 text-[10px] font-medium transition-colors ${
                          isSelected ? ui.pillButtonActive : ui.pillButton
                        }`}
                      >
                        {gesture.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                className={`rounded-lg px-2 py-2 text-center text-[10.5px] font-medium ${ui.card} ${ui.textMuted}`}
              >
                No finger rig on this model
              </div>
            )
          ) : (
            <div className="space-y-2">
              {visibleAxes.map((axis) => {
                if (!selectedSpec) return null;
                const axisSpec = selectedSpec.axes[axis];
                const min = jointLimitsEnabled ? axisSpec.min : -180;
                const max = jointLimitsEnabled ? axisSpec.max : 180;
                const value = selectedBoneAngles[axis];

                return (
                  <PrecisionSlider
                    key={axis}
                    id={`joint-axis-${axis}`}
                    label={axisSpec.label}
                    value={value}
                    min={min}
                    max={max}
                    step={1}
                    displayValue={`${value}°`}
                    onChange={(nextVal) => onChangeAxisAngle(axis, nextVal)}
                    onCommit={onCommitSliderHistory}
                    theme={STUDIO_THEMES[studioTheme]}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : isPropMode ? (
        <div className="space-y-2">
          <SegmentedControl
            label="Prop Gizmo"
            options={PROP_TRANSFORM_OPTIONS}
            value={propTransformMode}
            onChange={onChangePropTransformMode}
            theme={STUDIO_THEMES[studioTheme]}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onDropPropToFloor(selectedProp.id)}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
              <span>Drop</span>
            </button>
            <button
              type="button"
              onClick={() => onResetPropScale(selectedProp.id)}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <RotateCcwIcon className="h-3 w-3 shrink-0" />
              <span>Reset Scale</span>
            </button>
          </div>
        </div>
      ) : isIKMode ? (
        isIKFoot ? (
          <div className="space-y-2">
            <PrecisionSlider
              id="ik-swivel-slider"
              label="Knee Swivel"
              value={ikSwivelDeg}
              min={-75}
              max={75}
              step={1}
              displayValue={`${ikSwivelDeg >= 0 ? '+' : ''}${ikSwivelDeg}°`}
              onChange={onChangeIKSwivel}
              onCommit={onCommitIKSwivel}
              theme={STUDIO_THEMES[studioTheme]}
            />
            <button
              type="button"
              data-testid="ik-plant-foot"
              onClick={onPlantFootIK}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <ArrowDownToLineIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Plant Foot to Floor</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              data-testid="ik-pin-feet-toggle"
              aria-pressed={ikPinFeet}
              onClick={onToggleIKPinFeet}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${
                ikPinFeet ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              <span>
                {ikPinFeet ? 'Pin Feet (Squat)' : 'Pin Feet: Off (Free Move)'}
              </span>
            </button>
            <button
              type="button"
              onClick={onDropToFloor}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <ArrowDownToLineIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Drop to Floor</span>
            </button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {activeBoneId === 'pelvis' && (
            <SegmentedControl
              label="Pelvis Gizmo"
              options={GIZMO_MODE_OPTIONS}
              value={moveBodyEnabled ? 'move' : 'rotate'}
              onChange={(mode) => onSetMoveBody(mode === 'move')}
              theme={STUDIO_THEMES[studioTheme]}
            />
          )}

          {moveBodyEnabled && activeBoneId === 'pelvis' ? (
            <button
              type="button"
              onClick={onDropToFloor}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <ArrowDownToLineIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Drop to Floor</span>
            </button>
          ) : (
            <div className="space-y-2">
              {visibleAxes.map((axis) => {
                if (!selectedSpec) return null;
                const axisSpec = selectedSpec.axes[axis];
                const min = jointLimitsEnabled ? axisSpec.min : -180;
                const max = jointLimitsEnabled ? axisSpec.max : 180;
                const value = selectedBoneAngles[axis];

                return (
                  <PrecisionSlider
                    key={axis}
                    id={`joint-axis-${axis}`}
                    label={axisSpec.label}
                    value={value}
                    min={min}
                    max={max}
                    step={1}
                    displayValue={`${value}°`}
                    onChange={(nextVal) => onChangeAxisAngle(axis, nextVal)}
                    onCommit={onCommitSliderHistory}
                    theme={STUDIO_THEMES[studioTheme]}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
