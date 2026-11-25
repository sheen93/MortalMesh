import type { StudioThemeId } from '@/types/anatomy';

export const STUDIO_THEME_STORAGE_KEY = 'mortal-mesh-studio-theme';

export const STUDIO_THEME_ORDER: readonly StudioThemeId[] = [
  'light',
  'gray',
  'dark',
];

export function isStudioThemeId(value: string): value is StudioThemeId {
  return value === 'light' || value === 'gray' || value === 'dark';
}

export interface StudioThemeLighting {
  ambient: number;
  hemisphereIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  key: number;
  fill: number;
  rim: number;
}

export interface StudioThemeHitboxColors {
  idleColor: string;
  idleOpacity: number;
  hoverColor: string;
  hoverOpacity: number;
  selectedColor: string;
  selectedOpacity: number;
  pinnedColor: string;
  pinnedOpacity: number;
  ikCoreColor: string;
  ikSelectedColor: string;
  ikRingColor: string;
}

export interface StudioThemePropStyle {
  color: string;
  selectedEmissive: string;
  roughness: number;
}

export interface StudioThemeViewCube {
  faceBg: string;
  faceBorder: string;
  faceText: string;
  faceHoverBg: string;
  faceHoverText: string;
  edgeHoverBg: string;
  cornerHoverBg: string;
  faceShadow: string;
}

export interface StudioThemeSpec {
  id: StudioThemeId;
  label: string;
  bg: string;
  fogNear: number;
  fogFar: number;
  gridCellColor: string;
  gridSectionColor: string;
  originAxisColor: string;
  originAxisMutedColor: string;
  perspectiveGuideColor: string;
  shadowOpacity: number;
  lighting: StudioThemeLighting;
  hitbox: StudioThemeHitboxColors;
  prop: StudioThemePropStyle;
  viewCube: StudioThemeViewCube;
  rangeVars: {
    track: string;
    trackFill: string;
    thumb: string;
    thumbBorder: string;
    focus: string;
    scrollThumb: string;
    scrollThumbHover: string;
  };
  ui: {
    panel: string;
    dock: string;
    header: string;
    divider: string;
    hairline: string;
    verticalDivider: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    card: string;
    segmentedTrack: string;
    segmentedItem: string;
    segmentedItemActive: string;
    pillButton: string;
    pillButtonActive: string;
    pillButtonDisabled: string;
    dockButton: string;
    dockButtonActive: string;
    switchTrackOff: string;
    switchTrackOn: string;
    switchThumbOff: string;
    switchThumbOn: string;
    monoPill: string;
    badgeMuted: string;
    iconButton: string;
    loadingBadge: string;
  };
}

export const STUDIO_THEMES: Record<StudioThemeId, StudioThemeSpec> = {
  light: {
    id: 'light',
    label: 'White',
    bg: '#F2F3F5',
    fogNear: 14,
    fogFar: 34,
    gridCellColor: '#D8DCE2',
    gridSectionColor: '#AEB5C0',
    originAxisColor: '#64748B',
    originAxisMutedColor: '#94A3B8',
    perspectiveGuideColor: 'rgba(15, 23, 42, 0.24)',
    shadowOpacity: 0.16,
    lighting: {
      ambient: 0.55,
      hemisphereIntensity: 0.45,
      hemisphereSky: '#FFFFFF',
      hemisphereGround: '#E5E7EB',
      key: 1.25,
      fill: 0.65,
      rim: 0.75,
    },
    hitbox: {
      idleColor: '#27272A',
      idleOpacity: 0.48,
      hoverColor: '#09090B',
      hoverOpacity: 0.92,
      selectedColor: '#09090B',
      selectedOpacity: 0.98,
      pinnedColor: '#18181B',
      pinnedOpacity: 0.82,
      ikCoreColor: '#18181B',
      ikSelectedColor: '#09090B',
      ikRingColor: '#3F3F46',
    },
    prop: {
      color: '#D4D6DC',
      selectedEmissive: '#3F3F46',
      roughness: 0.62,
    },
    viewCube: {
      faceBg: 'rgba(255, 255, 255, 0.92)',
      faceBorder: 'rgba(24, 24, 27, 0.18)',
      faceText: '#18181B',
      faceHoverBg: '#18181B',
      faceHoverText: '#FFFFFF',
      edgeHoverBg: 'rgba(24, 24, 27, 0.72)',
      cornerHoverBg: '#09090B',
      faceShadow: '0 8px 24px rgba(15, 23, 42, 0.10)',
    },
    rangeVars: {
      track: 'rgba(24, 24, 27, 0.14)',
      trackFill: '#18181B',
      thumb: '#FFFFFF',
      thumbBorder: '#18181B',
      focus: '#18181B',
      scrollThumb: 'rgba(24, 24, 27, 0.18)',
      scrollThumbHover: 'rgba(24, 24, 27, 0.36)',
    },
    ui: {
      panel:
        'border border-zinc-900/10 bg-white/85 text-zinc-900 backdrop-blur-xl shadow-[0_14px_36px_-6px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.06)]',
      dock:
        'border border-zinc-900/10 bg-white/85 text-zinc-900 backdrop-blur-xl shadow-[0_14px_36px_-6px_rgba(15,23,42,0.16),0_2px_8px_rgba(15,23,42,0.06)]',
      header: 'border-b border-zinc-900/[0.08] bg-white/80',
      divider: 'divide-y divide-zinc-900/[0.08]',
      hairline: 'border-zinc-900/[0.08]',
      verticalDivider: 'bg-zinc-900/10',
      textPrimary: 'text-zinc-900',
      textSecondary: 'text-zinc-700',
      textMuted: 'text-zinc-500',
      card: 'border border-zinc-900/[0.08] bg-zinc-900/[0.03]',
      segmentedTrack: 'bg-zinc-900/[0.06] border border-zinc-900/[0.06]',
      segmentedItem: 'text-zinc-600 hover:text-zinc-900',
      segmentedItemActive:
        'bg-white text-zinc-950 shadow-[0_1px_3px_rgba(15,23,42,0.14)] border border-zinc-900/[0.06]',
      pillButton:
        'border border-zinc-900/[0.10] bg-white/80 text-zinc-700 hover:bg-zinc-900/[0.06] hover:text-zinc-950 hover:border-zinc-900/20',
      pillButtonActive:
        'border border-zinc-900 bg-zinc-900 text-white shadow-sm',
      pillButtonDisabled:
        'cursor-not-allowed border border-zinc-900/[0.07] bg-zinc-900/[0.02] text-zinc-400',
      dockButton: 'text-zinc-600 hover:bg-zinc-900/[0.07] hover:text-zinc-950',
      dockButtonActive: 'bg-zinc-900 text-white shadow-sm',
      switchTrackOff: 'bg-zinc-300',
      switchTrackOn: 'bg-zinc-900',
      switchThumbOff: 'bg-white shadow-sm',
      switchThumbOn: 'bg-white shadow-sm',
      monoPill: 'bg-zinc-900/[0.06] text-zinc-800 border border-zinc-900/[0.08]',
      badgeMuted: 'bg-zinc-900/[0.05] text-zinc-500 border border-zinc-900/[0.08]',
      iconButton: 'text-zinc-600 hover:bg-zinc-900/[0.08] hover:text-zinc-950',
      loadingBadge:
        'border border-zinc-900/15 bg-white/92 text-zinc-900 backdrop-blur-xl shadow-[0_10px_28px_rgba(15,23,42,0.14)]',
    },
  },
  gray: {
    id: 'gray',
    label: 'Gray',
    bg: '#686E78',
    fogNear: 14,
    fogFar: 34,
    gridCellColor: '#7E8591',
    gridSectionColor: '#494E57',
    originAxisColor: '#E4E4E7',
    originAxisMutedColor: '#A1A1AA',
    perspectiveGuideColor: 'rgba(244, 244, 245, 0.26)',
    shadowOpacity: 0.26,
    lighting: {
      ambient: 0.5,
      hemisphereIntensity: 0.45,
      hemisphereSky: '#F3F4F6',
      hemisphereGround: '#4A4E55',
      key: 1.4,
      fill: 0.7,
      rim: 0.9,
    },
    hitbox: {
      idleColor: '#FFFFFF',
      idleOpacity: 0.52,
      hoverColor: '#FFFFFF',
      hoverOpacity: 0.95,
      selectedColor: '#09090B',
      selectedOpacity: 0.95,
      pinnedColor: '#18181B',
      pinnedOpacity: 0.80,
      ikCoreColor: '#F4F4F5',
      ikSelectedColor: '#09090B',
      ikRingColor: '#FFFFFF',
    },
    prop: {
      color: '#9EA4B0',
      selectedEmissive: '#E4E4E7',
      roughness: 0.58,
    },
    viewCube: {
      faceBg: 'rgba(32, 35, 41, 0.92)',
      faceBorder: 'rgba(255, 255, 255, 0.18)',
      faceText: '#E4E4E7',
      faceHoverBg: '#F4F4F5',
      faceHoverText: '#18181B',
      edgeHoverBg: 'rgba(244, 244, 245, 0.72)',
      cornerHoverBg: '#FFFFFF',
      faceShadow: '0 10px 28px rgba(0, 0, 0, 0.36)',
    },
    rangeVars: {
      track: 'rgba(255, 255, 255, 0.16)',
      trackFill: '#F4F4F5',
      thumb: '#FFFFFF',
      thumbBorder: '#1E2025',
      focus: '#F4F4F5',
      scrollThumb: 'rgba(255, 255, 255, 0.18)',
      scrollThumbHover: 'rgba(255, 255, 255, 0.34)',
    },
    ui: {
      panel:
        'border border-white/[0.12] bg-[#1E2025]/84 text-zinc-100 backdrop-blur-xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]',
      dock:
        'border border-white/[0.12] bg-[#1E2025]/84 text-zinc-100 backdrop-blur-xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]',
      header: 'border-b border-white/[0.08] bg-[#181A1F]/80',
      divider: 'divide-y divide-white/[0.08]',
      hairline: 'border-white/[0.08]',
      verticalDivider: 'bg-white/[0.12]',
      textPrimary: 'text-zinc-100',
      textSecondary: 'text-zinc-300',
      textMuted: 'text-zinc-400',
      card: 'border border-white/[0.09] bg-black/20',
      segmentedTrack: 'bg-black/25 border border-white/[0.07]',
      segmentedItem: 'text-zinc-400 hover:text-zinc-100',
      segmentedItemActive:
        'bg-white/[0.16] text-white shadow-sm border border-white/[0.12]',
      pillButton:
        'border border-white/[0.10] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.12] hover:text-white hover:border-white/20',
      pillButtonActive:
        'border border-zinc-100 bg-zinc-100 text-zinc-950 shadow-sm',
      pillButtonDisabled:
        'cursor-not-allowed border border-white/[0.05] bg-white/[0.015] text-zinc-400/70',
      dockButton: 'text-zinc-300 hover:bg-white/[0.10] hover:text-white',
      dockButtonActive: 'bg-zinc-100 text-zinc-950 shadow-sm',
      switchTrackOff: 'bg-white/15',
      switchTrackOn: 'bg-zinc-100',
      switchThumbOff: 'bg-zinc-300 shadow-sm',
      switchThumbOn: 'bg-zinc-950 shadow-sm',
      monoPill: 'bg-black/30 text-zinc-200 border border-white/[0.10]',
      badgeMuted: 'bg-white/[0.06] text-zinc-400 border border-white/[0.08]',
      iconButton: 'text-zinc-300 hover:bg-white/[0.10] hover:text-white',
      loadingBadge:
        'border border-white/15 bg-[#1E2025]/92 text-zinc-100 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.42)]',
    },
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    bg: '#141619',
    fogNear: 14,
    fogFar: 34,
    gridCellColor: '#252932',
    gridSectionColor: '#3D4350',
    originAxisColor: '#71717A',
    originAxisMutedColor: '#52525B',
    perspectiveGuideColor: 'rgba(244, 244, 245, 0.22)',
    shadowOpacity: 0.45,
    lighting: {
      ambient: 0.42,
      hemisphereIntensity: 0.4,
      hemisphereSky: '#D1D5DB',
      hemisphereGround: '#16181C',
      key: 1.45,
      fill: 0.65,
      rim: 1.15,
    },
    hitbox: {
      idleColor: '#FFFFFF',
      idleOpacity: 0.50,
      hoverColor: '#FFFFFF',
      hoverOpacity: 0.95,
      selectedColor: '#09090B',
      selectedOpacity: 0.95,
      pinnedColor: '#18181B',
      pinnedOpacity: 0.80,
      ikCoreColor: '#F4F4F5',
      ikSelectedColor: '#09090B',
      ikRingColor: '#D4D4D8',
    },
    prop: {
      color: '#5A606D',
      selectedEmissive: '#D4D4D8',
      roughness: 0.56,
    },
    viewCube: {
      faceBg: 'rgba(20, 22, 27, 0.94)',
      faceBorder: 'rgba(255, 255, 255, 0.14)',
      faceText: '#D4D4D8',
      faceHoverBg: '#F4F4F5',
      faceHoverText: '#09090B',
      edgeHoverBg: 'rgba(244, 244, 245, 0.74)',
      cornerHoverBg: '#FFFFFF',
      faceShadow: '0 12px 32px rgba(0, 0, 0, 0.58)',
    },
    rangeVars: {
      track: 'rgba(255, 255, 255, 0.13)',
      trackFill: '#F4F4F5',
      thumb: '#FFFFFF',
      thumbBorder: '#111317',
      focus: '#F4F4F5',
      scrollThumb: 'rgba(255, 255, 255, 0.14)',
      scrollThumbHover: 'rgba(255, 255, 255, 0.28)',
    },
    ui: {
      panel:
        'border border-white/[0.09] bg-[#111317]/86 text-zinc-100 backdrop-blur-xl shadow-[0_18px_48px_-8px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]',
      dock:
        'border border-white/[0.09] bg-[#111317]/86 text-zinc-100 backdrop-blur-xl shadow-[0_18px_48px_-8px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)]',
      header: 'border-b border-white/[0.07] bg-[#0D0F12]/80',
      divider: 'divide-y divide-white/[0.07]',
      hairline: 'border-white/[0.07]',
      verticalDivider: 'bg-white/[0.10]',
      textPrimary: 'text-zinc-100',
      textSecondary: 'text-zinc-300',
      textMuted: 'text-zinc-400',
      card: 'border border-white/[0.08] bg-white/[0.03]',
      segmentedTrack: 'bg-white/[0.04] border border-white/[0.06]',
      segmentedItem: 'text-zinc-400 hover:text-zinc-100',
      segmentedItemActive:
        'bg-white/[0.14] text-white shadow-sm border border-white/[0.10]',
      pillButton:
        'border border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.10] hover:text-white hover:border-white/[0.16]',
      pillButtonActive:
        'border border-zinc-100 bg-zinc-100 text-zinc-950 shadow-sm',
      pillButtonDisabled:
        'cursor-not-allowed border border-white/[0.05] bg-white/[0.015] text-zinc-500',
      dockButton: 'text-zinc-300 hover:bg-white/[0.09] hover:text-white',
      dockButtonActive: 'bg-zinc-100 text-zinc-950 shadow-sm',
      switchTrackOff: 'bg-white/[0.14]',
      switchTrackOn: 'bg-zinc-100',
      switchThumbOff: 'bg-zinc-300 shadow-sm',
      switchThumbOn: 'bg-zinc-950 shadow-sm',
      monoPill: 'bg-white/[0.06] text-zinc-200 border border-white/[0.08]',
      badgeMuted: 'bg-white/[0.04] text-zinc-500 border border-white/[0.07]',
      iconButton: 'text-zinc-400 hover:bg-white/[0.09] hover:text-white',
      loadingBadge:
        'border border-white/10 bg-[#111317]/92 text-zinc-100 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.65)]',
    },
  },
};
