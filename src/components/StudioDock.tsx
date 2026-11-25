'use client';

import { useState } from 'react';
import { STUDIO_THEMES, STUDIO_THEME_ORDER } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type {
  JointsDisplayMode,
  PoseControlMode,
  SnapshotOptions,
  StudioThemeId,
} from '@/types/anatomy';
import {
  CameraIcon,
  ContrastIcon,
  GridFloorIcon,
  HelpCircleIcon,
  JointNodesIcon,
  LockIcon,
  MoonIcon,
  Move3dIcon,
  OrbitIcon,
  RedoIcon,
  RotateCcwIcon,
  SegmentedControl,
  SunIcon,
  UndoIcon,
  UnlockIcon,
  XIcon,
  type SegmentedOption,
} from '@/components/StudioPrimitives';

interface StudioDockProps {
  studioTheme: StudioThemeId;
  onChangeStudioTheme: (theme: StudioThemeId) => void;
  jointsDisplay: JointsDisplayMode;
  onChangeJointsDisplay: (mode: JointsDisplayMode) => void;
  controlMode: PoseControlMode;
  onChangeControlMode: (mode: PoseControlMode) => void;
  gravityEnabled: boolean;
  onToggleGravity: () => void;
  groundEnabled: boolean;
  onToggleGround: () => void;
  moveBodyEnabled: boolean;
  onSetMoveBody: (enabled: boolean) => void;
  activeMannequinLocked: boolean;
  onToggleLockActive: () => void;
  onResetPose: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isSnapshotOpen: boolean;
  onToggleSnapshot: () => void;
  onCaptureSnapshot: (options: SnapshotOptions) => void;
  isShortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  viewport: ViewportProfile;
}

const SNAPSHOT_BG_OPTIONS: ReadonlyArray<
  SegmentedOption<'transparent' | 'studio'>
> = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'studio', label: 'Studio' },
];

const SNAPSHOT_SCALE_OPTIONS: ReadonlyArray<SegmentedOption<'1' | '2'>> = [
  { id: '1', label: '1x' },
  { id: '2', label: '2x HD' },
];

const CONTROL_MODE_PILLS: ReadonlyArray<{
  id: PoseControlMode;
  label: string;
  title: string;
}> = [
  { id: 'fk', label: 'FK', title: 'FK Joint Rotation Mode (I)' },
  { id: 'ik', label: 'IK', title: 'IK End-Effector Target Mode (I)' },
];

function ThemeIcon({ themeId }: { themeId: StudioThemeId }) {
  if (themeId === 'light') return <SunIcon className="h-3.5 w-3.5 shrink-0" />;
  if (themeId === 'gray')
    return <ContrastIcon className="h-3.5 w-3.5 shrink-0" />;
  return <MoonIcon className="h-3.5 w-3.5 shrink-0" />;
}

export function StudioDock({
  studioTheme,
  onChangeStudioTheme,
  jointsDisplay,
  onChangeJointsDisplay,
  controlMode,
  onChangeControlMode,
  gravityEnabled,
  onToggleGravity,
  groundEnabled,
  onToggleGround,
  moveBodyEnabled,
  onSetMoveBody,
  activeMannequinLocked,
  onToggleLockActive,
  onResetPose,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isSnapshotOpen,
  onToggleSnapshot,
  onCaptureSnapshot,
  isShortcutsOpen,
  onToggleShortcuts,
  viewport,
}: StudioDockProps) {
  const [snapshotBg, setSnapshotBg] = useState<'transparent' | 'studio'>(
    'transparent'
  );
  const [snapshotScale, setSnapshotScale] = useState<'1' | '2'>('2');

  const theme = STUDIO_THEMES[studioTheme];
  const { ui } = theme;
  const jointsVisible = jointsDisplay !== 'hidden';
  const touchSized = viewport.isMobile || viewport.isCoarsePointer;
  const dockBtnHeight = touchSized ? 'min-h-[40px]' : '';
  const dockIconBox = touchSized ? 'h-10 w-10' : 'h-7 w-7';

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-20 flex max-w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1.5rem)] flex-col items-center gap-2 pointer-events-none select-none"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      {/* Frosted Snapshot Popover anchored above the dock */}
      {isSnapshotOpen && (
        <div
          role="dialog"
          aria-label="PNG Snapshot Exporter"
          onPointerDown={(event) => event.stopPropagation()}
          className={`pointer-events-auto w-[264px] max-w-[calc(100vw-2rem)] rounded-2xl p-3 space-y-2.5 ${ui.panel}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <CameraIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textMuted}`} />
              <span
                className={`text-[11px] font-semibold uppercase tracking-[0.11em] ${ui.textPrimary}`}
              >
                PNG Snapshot
              </span>
            </span>
            <button
              type="button"
              onClick={onToggleSnapshot}
              aria-label="Close snapshot exporter"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <SegmentedControl
            label="Background"
            options={SNAPSHOT_BG_OPTIONS}
            value={snapshotBg}
            onChange={setSnapshotBg}
            theme={theme}
          />

          <SegmentedControl
            label="Resolution"
            options={SNAPSHOT_SCALE_OPTIONS}
            value={snapshotScale}
            onChange={setSnapshotScale}
            theme={theme}
          />

          <button
            type="button"
            onClick={() =>
              onCaptureSnapshot({
                transparent: snapshotBg === 'transparent',
                scale: snapshotScale === '2' ? 2 : 1,
              })
            }
            className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-medium transition-colors ${ui.pillButtonActive}`}
          >
            <CameraIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Export PNG</span>
          </button>
        </div>
      )}

      {/* Main Dock Pill Bar */}
      <nav
        aria-label="Studio quick dock"
        onPointerDown={(event) => event.stopPropagation()}
        className={`studio-scroll pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl px-2 py-1.5 transition-colors duration-200 ${ui.dock}`}
      >
        {/* Theme Segmented Pill */}
        <div
          role="group"
          aria-label="Studio background theme"
          className={`flex shrink-0 items-center gap-0.5 rounded-xl p-0.5 ${ui.segmentedTrack}`}
        >
          {STUDIO_THEME_ORDER.map((themeId) => {
            const option = STUDIO_THEMES[themeId];
            const isSelected = studioTheme === themeId;
            return (
              <button
                key={themeId}
                type="button"
                aria-pressed={isSelected}
                title={`Switch to ${option.label} studio`}
                onClick={() => onChangeStudioTheme(themeId)}
                className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
                  isSelected ? ui.segmentedItemActive : ui.segmentedItem
                }`}
              >
                <ThemeIcon themeId={themeId} />
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            );
          })}
        </div>

        <span
          className={`h-5 w-px shrink-0 ${ui.verticalDivider}`}
          aria-hidden="true"
        />

        {/* FK / IK Mode Segmented Pill */}
        <div
          role="group"
          aria-label="Posing control mode"
          className={`flex shrink-0 items-center gap-0.5 rounded-xl p-0.5 ${ui.segmentedTrack}`}
        >
          {CONTROL_MODE_PILLS.map((modeOpt) => {
            const isSelected = controlMode === modeOpt.id;
            return (
              <button
                key={modeOpt.id}
                type="button"
                aria-pressed={isSelected}
                title={modeOpt.title}
                onClick={() => onChangeControlMode(modeOpt.id)}
                className={`flex ${dockBtnHeight} items-center justify-center rounded-[9px] px-2.5 py-1 font-mono text-[10.5px] font-semibold whitespace-nowrap transition-all duration-150 ${
                  isSelected ? ui.segmentedItemActive : ui.segmentedItem
                }`}
              >
                {modeOpt.label}
              </button>
            );
          })}
        </div>

        <span
          className={`h-5 w-px shrink-0 ${ui.verticalDivider}`}
          aria-hidden="true"
        />

        {/* Quick Studio Toggles */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-pressed={jointsVisible}
            title={
              jointsVisible ? 'Hide joint handles (H)' : 'Show core joints (H)'
            }
            onClick={() =>
              onChangeJointsDisplay(jointsVisible ? 'hidden' : 'core')
            }
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              jointsVisible ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <JointNodesIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Joints</span>
          </button>

          <button
            type="button"
            aria-pressed={gravityEnabled}
            title="Toggle joint-space gravity"
            onClick={onToggleGravity}
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              gravityEnabled ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <OrbitIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Gravity</span>
          </button>

          <button
            type="button"
            aria-pressed={groundEnabled}
            title="Toggle infinite floor boundary"
            onClick={onToggleGround}
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              groundEnabled ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <GridFloorIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Ground</span>
          </button>

          <button
            type="button"
            disabled={activeMannequinLocked}
            aria-pressed={!activeMannequinLocked && moveBodyEnabled}
            title="Toggle world body translation gizmo (G)"
            onClick={() => {
              if (!activeMannequinLocked) onSetMoveBody(!moveBodyEnabled);
            }}
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              activeMannequinLocked
                ? `opacity-35 cursor-not-allowed ${ui.textMuted}`
                : moveBodyEnabled
                  ? ui.dockButtonActive
                  : ui.dockButton
            }`}
          >
            <Move3dIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Move</span>
          </button>

          <button
            type="button"
            aria-pressed={activeMannequinLocked}
            title={
              activeMannequinLocked
                ? 'Unlock active figure'
                : 'Lock active figure (freeze edits & gravity)'
            }
            onClick={onToggleLockActive}
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              activeMannequinLocked ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            {activeMannequinLocked ? (
              <LockIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <UnlockIcon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="hidden lg:inline">
              {activeMannequinLocked ? 'Locked' : 'Lock'}
            </span>
          </button>
        </div>

        <span
          className={`h-5 w-px shrink-0 ${ui.verticalDivider}`}
          aria-hidden="true"
        />

        {/* History Undo / Redo & Reset */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!canUndo}
            aria-label="Undo pose edit"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            className={`flex ${dockIconBox} items-center justify-center rounded-xl transition-all duration-150 ${
              canUndo
                ? ui.dockButton
                : `opacity-35 cursor-not-allowed ${ui.textMuted}`
            }`}
          >
            <UndoIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={!canRedo}
            aria-label="Redo pose edit"
            title="Redo (Ctrl+Shift+Z)"
            onClick={onRedo}
            className={`flex ${dockIconBox} items-center justify-center rounded-xl transition-all duration-150 ${
              canRedo
                ? ui.dockButton
                : `opacity-35 cursor-not-allowed ${ui.textMuted}`
            }`}
          >
            <RedoIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={activeMannequinLocked}
            title="Reset active figure to T-Pose"
            onClick={() => {
              if (!activeMannequinLocked) onResetPose();
            }}
            className={`flex shrink-0 ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              activeMannequinLocked
                ? `opacity-35 cursor-not-allowed ${ui.textMuted}`
                : ui.dockButton
            }`}
          >
            <RotateCcwIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>

        <span
          className={`h-5 w-px shrink-0 ${ui.verticalDivider}`}
          aria-hidden="true"
        />

        {/* Snapshot Exporter & Shortcuts Reference */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={isSnapshotOpen}
            title="Export PNG Snapshot"
            onClick={onToggleSnapshot}
            className={`flex ${dockBtnHeight} items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
              isSnapshotOpen ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <CameraIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Snapshot</span>
          </button>

          <button
            type="button"
            aria-label="Keyboard shortcuts"
            aria-expanded={isShortcutsOpen}
            title="Keyboard Shortcuts (?)"
            onClick={onToggleShortcuts}
            className={`flex ${dockIconBox} items-center justify-center rounded-xl transition-all duration-150 ${
              isShortcutsOpen ? ui.dockButtonActive : ui.dockButton
            }`}
          >
            <HelpCircleIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>
    </div>
  );
}
