'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { StudioThemeSpec } from '@/data/studioThemes';

interface IconProps {
  className?: string;
}

export function LogoMarkIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 1.75 13.25 4.8v6.4L8 14.25 2.75 11.2V4.8L8 1.75Z" />
      <path d="M8 8v6.25" />
      <path d="M13.25 4.8 8 8 2.75 4.8" />
    </svg>
  );
}

export function ChevronDownIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function PanelToggleIcon({
  collapsed = false,
  className = 'w-3.5 h-3.5',
}: IconProps & { collapsed?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <path d="M6.25 2.5v11" />
      {collapsed ? (
        <path d="m9 6 2 2-2 2" />
      ) : (
        <path d="m11 6-2 2 2 2" />
      )}
    </svg>
  );
}

export function SunIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.35M8 12.9v1.35M1.75 8h1.35M12.9 8h1.35M3.58 3.58l.95.95M11.47 11.47l.95.95M12.42 3.58l-.95.95M4.53 11.47l-.95.95" />
    </svg>
  );
}

export function ContrastIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11" />
      <path d="M8 5.25 11.5 8.75M8 8.5l2.6 2.6" />
    </svg>
  );
}

export function MoonIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M13.25 9.8A5.5 5.5 0 0 1 6.2 2.75a5.5 5.5 0 1 0 7.05 7.05Z" />
    </svg>
  );
}

export function HomeIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 7.2 8 2.5l5.5 4.7" />
      <path d="M4 6v7.25h8V6" />
    </svg>
  );
}

export function RotateCcwIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.75 6.25V3h3.25" />
      <path d="M3.1 6.1A5.25 5.25 0 1 1 3.7 11.4" />
    </svg>
  );
}

export function PinIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.75 2.5 13.5 6.25l-1.35 1.35-1.1-.35-2.6 2.6.5 2.15-1.2 1.2L5.5 10.9 2.75 13.65M5.1 10.5l-2.3-2.25 1.2-1.2 2.15.5 2.6-2.6-.35-1.1L9.75 2.5Z" />
    </svg>
  );
}

export function Move3dIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2v12M2 8h12" />
      <path d="m6.25 3.75 1.75-1.75 1.75 1.75M6.25 12.25 8 14l1.75-1.75M3.75 6.25 2 8l1.75 1.75M12.25 6.25 14 8l-1.75 1.75" />
    </svg>
  );
}

export function ArrowDownToLineIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.5v8.25" />
      <path d="m4.75 7.75 3.25 3.25 3.25-3.25" />
      <path d="M3 13.5h10" />
    </svg>
  );
}

export function LayersIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m8 2.5 5.5 3-5.5 3-5.5-3 5.5-3Z" />
      <path d="m2.5 8.5 5.5 3 5.5-3" />
      <path d="m2.5 11.25 5.5 3 5.5-3" />
    </svg>
  );
}

export function SlidersIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 4.5h3M9 4.5h4.5M2.5 11.5h5M11 11.5h2.5" />
      <circle cx="7.25" cy="4.5" r="1.5" />
      <circle cx="9.25" cy="11.5" r="1.5" />
    </svg>
  );
}

export function SparklesIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.25 9.2 5.8 12.75 7 9.2 8.2 8 11.75 6.8 8.2 3.25 7 6.8 5.8 8 2.25Z" />
      <path d="M12.5 11.5v2M11.5 12.5h2" />
    </svg>
  );
}

export function OrbitIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.25" />
      <ellipse cx="8" cy="8" rx="6" ry="2.75" transform="rotate(-25 8 8)" />
    </svg>
  );
}

export function GridFloorIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12.5h12" />
      <path d="M3.5 9.5h9l1.25 3H2.25l1.25-3Z" />
      <path d="M6.25 9.5 5.5 12.5M9.75 9.5l.75 3" />
    </svg>
  );
}

export function JointNodesIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="4" cy="12" r="1.75" />
      <circle cx="8" cy="8" r="1.75" />
      <circle cx="12" cy="4" r="1.75" />
      <path d="m5.25 10.75 1.5-1.5M9.25 6.75l1.5-1.5" />
    </svg>
  );
}

export function UndoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.25 6.25H10a3.5 3.5 0 1 1 0 7H6.25" />
      <path d="M5.75 3.75 3.25 6.25l2.5 2.5" />
    </svg>
  );
}

export function RedoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.75 6.25H6a3.5 3.5 0 1 0 0 7h3.75" />
      <path d="m10.25 3.75 2.5 2.5-2.5 2.5" />
    </svg>
  );
}

export function FlipHorizontalIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.25v11.5" />
      <path d="M6 4.25 2.5 11.75H6v-7.5Z" />
      <path d="M10 4.25 13.5 11.75H10v-7.5Z" />
    </svg>
  );
}

export function DownloadIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.5v7.5" />
      <path d="m5 7.25 3 3 3-3" />
      <path d="M2.75 11.5v1.25a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V11.5" />
    </svg>
  );
}

export function UploadIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 10V2.5" />
      <path d="m5 5.5 3-3 3 3" />
      <path d="M2.75 11.5v1.25a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V11.5" />
    </svg>
  );
}

export function CheckCircleIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" />
      <path d="m5.5 8.2 1.65 1.65 3.35-3.6" />
    </svg>
  );
}

export function AlertCircleIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5.25v3.25" />
      <circle cx="8" cy="11.15" r="0.35" fill="currentColor" />
    </svg>
  );
}

export function CameraIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.25 5.25a1.25 1.25 0 0 1 1.25-1.25h1.6l.9-1.5h4l.9 1.5h1.6a1.25 1.25 0 0 1 1.25 1.25v6.5a1.25 1.25 0 0 1-1.25 1.25h-9a1.25 1.25 0 0 1-1.25-1.25v-6.5Z" />
      <circle cx="8" cy="8.5" r="2.25" />
    </svg>
  );
}

export function LightbulbIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.75 11.25h4.5M6.5 13.5h3" />
      <path d="M5.75 11.25c0-1.15-1.75-2.05-1.75-4.35a4 4 0 1 1 8 0c0 2.3-1.75 3.2-1.75 4.35" />
    </svg>
  );
}

export function HelpCircleIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" />
      <path d="M6.45 6.25a1.6 1.6 0 0 1 3.1.55c0 1.05-1.55 1.35-1.55 2.2" />
      <circle cx="8" cy="11.25" r="0.35" fill="currentColor" />
    </svg>
  );
}

export function KeyboardIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M4.25 6.5h.5M7 6.5h.5M9.75 6.5h.5M12 6.5h.25M5.25 9.5h5.5" />
    </svg>
  );
}

export function XIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />
    </svg>
  );
}

export function UsersIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="6" cy="5.25" r="2.25" />
      <path d="M1.75 13.5a4.25 4.25 0 0 1 8.5 0" />
      <circle cx="11.25" cy="5.75" r="1.75" />
      <path d="M11.75 9.75a3.25 3.25 0 0 1 2.5 3.75" />
    </svg>
  );
}

export function PlusIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function CopyIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  );
}

export function LockIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.25" y="7.25" width="9.5" height="6.25" rx="1.5" />
      <path d="M5.25 7.25V5.25a2.75 2.75 0 0 1 5.5 0v2" />
    </svg>
  );
}

export function FrameGuidesIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5" />
      <path d="M6.1 2.75v10.5M9.9 2.75v10.5M2.25 6.25h11.5M2.25 9.75h11.5" />
    </svg>
  );
}

export function RulerIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.25 2v12h5.5V2h-5.5Z" />
      <path d="M5.25 5h2.25M5.25 8h3.25M5.25 11h2.25" />
    </svg>
  );
}

export function ImageIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
      <circle cx="5.5" cy="6" r="1" />
      <path d="m2.5 11.5 3.3-3.2a.8.8 0 0 1 1.13 0L9.2 10.6l1.4-1.35a.8.8 0 0 1 1.12 0L13.75 11.2" />
    </svg>
  );
}

export function UnlockIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.25" y="7.25" width="9.5" height="6.25" rx="1.5" />
      <path d="M5.25 7.25V5.25a2.75 2.75 0 0 1 5.2-1.25" />
    </svg>
  );
}

export function EyeIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.75 8s2.25-4 6.25-4 6.25 4 6.25 4-2.25 4-6.25 4S1.75 8 1.75 8Z" />
      <circle cx="8" cy="8" r="1.75" />
    </svg>
  );
}

export function EyeOffIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 2.5 13.5 13.5" />
      <path d="M6.4 4.25A5.9 5.9 0 0 1 8 4c4 0 6.25 4 6.25 4a9.8 9.8 0 0 1-1.9 2.45M9.8 11.7A5.9 5.9 0 0 1 8 12c-4 0-6.25-4-6.25-4a10.4 10.4 0 0 1 2.45-2.85" />
    </svg>
  );
}

export function TrashIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.75 4.25h10.5M6 4.25V2.75h4v1.5" />
      <path d="M4.25 4.25 4.9 12.6a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.65-8.35" />
    </svg>
  );
}

export function SearchIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </svg>
  );
}

export function ExpandGalleryIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.75 2.5h3.75v3.75M6.25 13.5H2.5V9.75" />
      <path d="M13.5 2.5 9.25 6.75M2.5 13.5l4.25-4.25" />
    </svg>
  );
}

export function BoxIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m8 2 5.5 3v6L8 14 2.5 11V5L8 2Z" />
      <path d="M2.5 5 8 8l5.5-3M8 8v6" />
    </svg>
  );
}

export function BookmarkIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 2.5h8a1 1 0 0 1 1 1v10l-5-3-5 3v-10a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function SaveIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 2.5h8.25L13.5 4.75V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M5.25 2.5v3.5h5V2.5M5 13.5v-4h6v4" />
    </svg>
  );
}

export function PenToolIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m8 2 4.5 5.25L9.75 11.5h-3.5L3.5 7.25 8 2Z" />
      <path d="M8 2v4.5M5.25 13.75h5.5" />
      <circle cx="8" cy="7.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FolderOpenIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 4.25a1 1 0 0 1 1-1h3.25l1.25 1.5H12.5a1 1 0 0 1 1 1v1" />
      <path d="M2 12.25 3.35 7.25h10.4L12.4 12.25H2Z" />
    </svg>
  );
}

export function FilePlusIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 2.25H4a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.25L9 2.25Z" />
      <path d="M9 2.25v4h4M8 8.25v3.5M6.25 10h3.5" />
    </svg>
  );
}

export function DownloadCloudIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 11.25a2.75 2.75 0 0 1-.4-5.47 3.75 3.75 0 0 1 7.25-.66 2.5 2.5 0 0 1 .4 4.96" />
      <path d="M8 8v5.5M6 11.75 8 13.75l2-2" />
    </svg>
  );
}

export function WifiIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.25 6.25a8.5 8.5 0 0 1 11.5 0M4.75 8.75a5 5 0 0 1 6.5 0M7.25 11.25a1.5 1.5 0 0 1 1.5 0" />
      <circle cx="8" cy="13" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function WifiOffIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.25 2.25 13.75 13.75" />
      <path d="M6.35 4.1a8.5 8.5 0 0 1 7.4 2.15M2.25 6.25a8.5 8.5 0 0 1 2.2-1.45M4.75 8.75a5 5 0 0 1 4.15-1.15" />
      <circle cx="8" cy="13" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function GraduationCapIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.5 6.2 8 3l6.5 3.2L8 9.4 1.5 6.2Z" />
      <path d="M4.2 7.6v3.3c0 1 1.7 1.8 3.8 1.8s3.8-.8 3.8-1.8V7.6" />
      <path d="M14.2 6.5v4.2" />
    </svg>
  );
}

export function TimerIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6.25 1.75h3.5M8 4.25v4l2.5 1.5" />
      <circle cx="8" cy="9.25" r="5" />
    </svg>
  );
}

export function Share2Icon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="3.5" r="1.75" />
      <circle cx="4" cy="8" r="1.75" />
      <circle cx="12" cy="12.5" r="1.75" />
      <path d="m5.5 7.1 5-2.7M5.5 8.9l5 2.7" />
    </svg>
  );
}

export function Volume2Icon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 6h2.75l3.25-2.75v9.5L5.25 10H2.5V6Z" />
      <path d="M11 5.75a3.5 3.5 0 0 1 0 4.5M12.9 4a6 6 0 0 1 0 8" />
    </svg>
  );
}

export function VolumeXIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 6h2.75l3.25-2.75v9.5L5.25 10H2.5V6Z" />
      <path d="m11 6 3 4M14 6l-3 4" />
    </svg>
  );
}

export function PlayIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.2 3.1a.6.6 0 0 1 .9-.52l7.8 4.9a.6.6 0 0 1 0 1.04l-7.8 4.9a.6.6 0 0 1-.9-.52V3.1Z" />
    </svg>
  );
}

export function PauseIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="3" width="3" height="10" rx="0.75" />
      <rect x="9.5" y="3" width="3" height="10" rx="0.75" />
    </svg>
  );
}

export function SkipForwardIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 3.75v8.5L9.5 8 3 3.75Z" fill="currentColor" />
      <path d="M12.25 3.75v8.5" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

export function PencilIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11.3 2.2a1.7 1.7 0 0 1 2.4 2.4L5.2 13.1l-3 .7.7-3 8.4-8.6Z" />
      <path d="m9.6 3.9 2.5 2.5" />
    </svg>
  );
}

export function BrushIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M13.5 2.5 7.4 8.6" />
      <path d="M6.6 8.3c-1.5 0-2.5 1-2.5 2.3 0 1-.8 1.9-1.9 2.1.7.7 1.8 1.1 2.9 1.1 2 0 3.4-1.3 3.4-3.1 0-1.3-.9-2.4-1.9-2.4Z" />
    </svg>
  );
}

export function PenNibIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 1.75 12.5 8l-2 4.5h-5l-2-4.5L8 1.75Z" />
      <path d="M8 1.75V7.5" />
      <circle cx="8" cy="8.25" r="0.9" fill="currentColor" />
      <path d="M5 14.25h6" />
    </svg>
  );
}

export function EraserIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m7.2 3.2 5.6 5.6a1.4 1.4 0 0 1 0 2l-2.6 2.6a1.4 1.4 0 0 1-1 .4H5.4L2.2 10.6a1.4 1.4 0 0 1 0-2l3-5.4a1.4 1.4 0 0 1 2 0Z" />
      <path d="M4.6 7.4 9.5 12.3M7.5 13.8h6" />
    </svg>
  );
}

export function LassoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="8" cy="6.75" rx="5.25" ry="3.75" strokeDasharray="2.2 1.8" />
      <circle cx="5.25" cy="10.25" r="1.25" />
      <path d="M5.25 11.5c0 1.4 1 2.25 2.5 2.5" />
    </svg>
  );
}

export function ScanEyeIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 5V3.25A.75.75 0 0 1 3.25 2.5H5M11 2.5h1.75a.75.75 0 0 1 .75.75V5M13.5 11v1.75a.75.75 0 0 1-.75.75H11M5 13.5H3.25a.75.75 0 0 1-.75-.75V11" />
      <path d="M3.25 8S5 5.25 8 5.25 12.75 8 12.75 8 11 10.75 8 10.75 3.25 8 3.25 8Z" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function SplitPaneIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
      <path d="M8 2.75v10.5" />
    </svg>
  );
}

export function StylusIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.75 2.25 4.25 10.75l-1.5 3 3-1.5 8.5-8.5-1.5-1.5Z" />
      <path d="m10 5 1 1" />
    </svg>
  );
}

export function VideoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.75" y="4" width="8.75" height="8" rx="1.5" />
      <path d="m10.5 7 3.75-2v6L10.5 9" />
    </svg>
  );
}

export function BookOpenIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 4.2C6.8 3.2 4.7 2.75 2.25 2.75v9.5c2.45 0 4.55.45 5.75 1.45 1.2-1 3.3-1.45 5.75-1.45v-9.5C11.3 2.75 9.2 3.2 8 4.2Z" />
      <path d="M8 4.2v9.5" />
    </svg>
  );
}

interface ToggleSwitchProps {
  id?: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  theme: StudioThemeSpec;
}

export function ToggleSwitch({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
  theme,
}: ToggleSwitchProps) {
  const { ui } = theme;
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange();
      }}
      className={`group w-full flex items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'cursor-pointer hover:bg-zinc-500/10'
      }`}
    >
      <span className="min-w-0">
        <span
          className={`block text-[12px] font-medium leading-tight ${
            disabled ? ui.textMuted : ui.textPrimary
          }`}
        >
          {label}
        </span>
        {description && (
          <span className={`block text-[10px] leading-tight mt-0.5 ${ui.textMuted}`}>
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-[19px] w-[34px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
          checked ? ui.switchTrackOn : ui.switchTrackOff
        }`}
      >
        <span
          className={`h-[15px] w-[15px] rounded-full transition-transform duration-200 ease-out ${
            checked
              ? `translate-x-[15px] ${ui.switchThumbOn}`
              : `translate-x-0 ${ui.switchThumbOff}`
          }`}
        />
      </span>
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  label?: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
  theme: StudioThemeSpec;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  disabled = false,
  onChange,
  theme,
}: SegmentedControlProps<T>) {
  const { ui } = theme;
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50' : ''}`}>
      {label && (
        <span className={`block text-[11px] font-medium ${ui.textSecondary}`}>
          {label}
        </span>
      )}
      <div
        role="group"
        aria-label={label}
        className={`grid gap-0.5 rounded-lg p-0.5 ${ui.segmentedTrack}`}
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => {
          const isSelected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              title={option.title}
              onClick={() => {
                if (!disabled) onChange(option.id);
              }}
              className={`rounded-[6px] px-2 py-1 text-[11px] font-medium transition-all duration-150 ${
                disabled ? 'cursor-not-allowed' : ''
              } ${isSelected ? ui.segmentedItemActive : ui.segmentedItem}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COMMIT_SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

interface PrecisionSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: () => void;
  theme: StudioThemeSpec;
}

export function PrecisionSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  disabled = false,
  onChange,
  onCommit,
  theme,
}: PrecisionSliderProps) {
  const { ui } = theme;
  const clamped = Math.min(max, Math.max(min, value));
  const span = max - min;
  const pct = span > 0 ? ((clamped - min) / span) * 100 : 0;

  return (
    <div className={`space-y-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={`text-[11px] font-medium ${ui.textSecondary}`}
        >
          {label}
        </label>
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums ${ui.monoPill}`}
        >
          {displayValue}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={clamped}
        onChange={(event) => {
          if (!disabled) onChange(Number(event.target.value));
        }}
        onPointerUp={() => {
          if (!disabled) onCommit?.();
        }}
        onTouchEnd={() => {
          if (!disabled) onCommit?.();
        }}
        onKeyUp={(event) => {
          if (!disabled && COMMIT_SLIDER_KEYS.has(event.key)) {
            onCommit?.();
          }
        }}
        className="studio-range disabled:cursor-not-allowed disabled:opacity-55"
        style={{ '--range-fill': `${pct.toFixed(2)}%` } as CSSProperties}
      />
    </div>
  );
}

interface AccordionSectionProps {
  id: string;
  title: string;
  icon: ReactNode;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  theme: StudioThemeSpec;
  children: ReactNode;
}

export function AccordionSection({
  id,
  title,
  icon,
  badge,
  isOpen,
  onToggle,
  theme,
  children,
}: AccordionSectionProps) {
  const { ui } = theme;
  return (
    <section aria-labelledby={`${id}-heading`}>
      <button
        id={`${id}-heading`}
        type="button"
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors ${ui.iconButton}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 ${ui.textMuted}`}>{icon}</span>
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.11em] truncate ${ui.textPrimary}`}
          >
            {title}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wider ${ui.badgeMuted}`}
            >
              {badge}
            </span>
          )}
          <ChevronDownIcon
            className={`w-3.5 h-3.5 transition-transform duration-200 ${ui.textMuted} ${
              isOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </span>
      </button>
      {isOpen && (
        <div id={`${id}-content`} className="px-3.5 pb-3 pt-0.5 space-y-2.5">
          {children}
        </div>
      )}
    </section>
  );
}
