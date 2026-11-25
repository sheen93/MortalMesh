import type { PoseSnapshot } from '@/types/poseIO';
import { clonePoseSnapshot, snapshotsEqual } from '@/utils/poseSerialization';

export const MAX_POSE_HISTORY = 50;

export interface PoseHistoryState {
  past: PoseSnapshot[];
  present: PoseSnapshot | null;
  future: PoseSnapshot[];
}

export const EMPTY_POSE_HISTORY: PoseHistoryState = {
  past: [],
  present: null,
  future: [],
};

export function initPoseHistory(initial: PoseSnapshot): PoseHistoryState {
  return {
    past: [],
    present: clonePoseSnapshot(initial),
    future: [],
  };
}

export function pushPoseHistory(
  state: PoseHistoryState,
  next: PoseSnapshot
): PoseHistoryState {
  const clonedNext = clonePoseSnapshot(next);
  if (!state.present) {
    return initPoseHistory(clonedNext);
  }
  if (snapshotsEqual(state.present, clonedNext)) {
    return state;
  }

  const nextPast = [...state.past, state.present];
  const trimmedPast =
    nextPast.length > MAX_POSE_HISTORY
      ? nextPast.slice(nextPast.length - MAX_POSE_HISTORY)
      : nextPast;

  return {
    past: trimmedPast,
    present: clonedNext,
    future: [],
  };
}

export function undoPoseHistory(state: PoseHistoryState): PoseHistoryState {
  if (!state.present || state.past.length === 0) {
    return state;
  }
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoPoseHistory(state: PoseHistoryState): PoseHistoryState {
  if (!state.present || state.future.length === 0) {
    return state;
  }
  const next = state.future[0];
  return {
    past: [...state.past, state.present].slice(-MAX_POSE_HISTORY),
    present: next,
    future: state.future.slice(1),
  };
}
