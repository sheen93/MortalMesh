'use client';

import { KeyboardIcon, XIcon } from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTheme: StudioThemeId;
}

const SHORTCUT_ITEMS: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: 'Ctrl / ⌘ + Z', description: 'Undo pose edit' },
  { keys: 'Ctrl / ⌘ + Shift + Z', description: 'Redo pose edit' },
  { keys: 'Ctrl + Y', description: 'Redo pose edit' },
  { keys: 'R', description: 'Joint Rotate mode' },
  { keys: 'I', description: 'Toggle FK ↔ IK posing' },
  { keys: 'G', description: 'Toggle Move Body mode' },
  { keys: 'H', description: 'Toggle Joint handles' },
  { keys: '0', description: 'Reset camera to Home' },
  { keys: 'Esc', description: 'Close popover / deselect' },
  { keys: '?', description: 'Toggle shortcuts guide' },
];

export function ShortcutsModal({
  isOpen,
  onClose,
  studioTheme,
}: ShortcutsModalProps) {
  if (!isOpen) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div
      role="dialog"
      aria-label="Keyboard Shortcuts"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 74px)',
      }}
      className={`studio-scroll studio-modal-scroll fixed left-1/2 -translate-x-1/2 z-40 w-[332px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl p-3.5 space-y-2.5 select-none ${ui.panel}`}
    >
      <div className={`flex items-center justify-between gap-2 pb-2 border-b ${ui.hairline}`}>
        <span className="flex items-center gap-1.5 min-w-0">
          <KeyboardIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textMuted}`} />
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.11em] ${ui.textPrimary}`}
          >
            Keyboard Shortcuts
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
          className={`flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="space-y-1.5">
        {SHORTCUT_ITEMS.map((item) => (
          <li
            key={item.keys}
            className="flex items-center justify-between gap-3 text-[11.5px]"
          >
            <span className={ui.textSecondary}>{item.description}</span>
            <kbd
              className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${ui.monoPill}`}
            >
              {item.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
