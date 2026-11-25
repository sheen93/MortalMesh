'use client';

import { useEffect } from 'react';

interface StudioShortcutsHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onRotateMode: () => void;
  onToggleControlMode: () => void;
  onToggleMoveBody: () => void;
  onToggleJointsVisibility: () => void;
  onResetCameraHome: () => void;
  onEscape: () => void;
  onToggleShortcuts: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return true;
  }

  return target.closest('[contenteditable="true"]') !== null;
}

export function useStudioShortcuts({
  onUndo,
  onRedo,
  onRotateMode,
  onToggleControlMode,
  onToggleMoveBody,
  onToggleJointsVisibility,
  onResetCameraHome,
  onEscape,
  onToggleShortcuts,
}: StudioShortcutsHandlers) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const mod = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();

      if (mod && !event.altKey && lower === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (mod && !event.altKey && !event.shiftKey && lower === 'y') {
        event.preventDefault();
        onRedo();
        return;
      }

      if (!mod && !event.altKey && !event.shiftKey && lower === 'r') {
        event.preventDefault();
        onRotateMode();
        return;
      }

      if (!mod && !event.altKey && !event.shiftKey && lower === 'i') {
        event.preventDefault();
        onToggleControlMode();
        return;
      }

      if (!mod && !event.altKey && !event.shiftKey && lower === 'g') {
        event.preventDefault();
        onToggleMoveBody();
        return;
      }

      if (!mod && !event.altKey && !event.shiftKey && lower === 'h') {
        event.preventDefault();
        onToggleJointsVisibility();
        return;
      }

      if (!mod && !event.altKey && event.key === '0') {
        event.preventDefault();
        onResetCameraHome();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }

      if (!mod && !event.altKey && event.key === '?') {
        event.preventDefault();
        onToggleShortcuts();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onUndo,
    onRedo,
    onRotateMode,
    onToggleControlMode,
    onToggleMoveBody,
    onToggleJointsVisibility,
    onResetCameraHome,
    onEscape,
    onToggleShortcuts,
  ]);
}
