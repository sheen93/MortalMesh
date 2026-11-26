'use client';

import { useMemo } from 'react';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  isFisheyePreset,
  type CameraPreset,
  type StudioThemeId,
} from '@/types/anatomy';
import { sourceNdcToScreenNdc } from '@/utils/lensWarp';

interface PerspectiveGuidesProps {
  preset: CameraPreset;
  curvature: number;
  visible: boolean;
  studioTheme: StudioThemeId;
  width: number;
  height: number;
}

const SAMPLE_STEPS = 48;

function buildSampledCurve(
  width: number,
  height: number,
  preset: CameraPreset,
  curvature: number,
  aspect: number,
  pointAt: (t: number) => { sx: number; sy: number }
): string {
  const pts: string[] = [];
  for (let i = 0; i <= SAMPLE_STEPS; i += 1) {
    const t = i / SAMPLE_STEPS;
    const { sx, sy } = pointAt(t);
    const warped = sourceNdcToScreenNdc(sx, sy, preset, curvature, aspect);
    const px = ((warped.x * 0.5 + 0.5) * width).toFixed(1);
    const py = ((-warped.y * 0.5 + 0.5) * height).toFixed(1);
    pts.push(`${i === 0 ? 'M' : 'L'}${px},${py}`);
  }
  return pts.join(' ');
}

/**
 * Dynamic hemispherical Fisheye perspective guide overlay that tightens
 * and bends in real time as the Fisheye Dome strength climbs toward 100%.
 * Rendered in DOM SVG so it never appears in studio or transparent PNG cutouts.
 */
export function PerspectiveGuides({
  preset,
  curvature,
  visible,
  studioTheme,
  width,
  height,
}: PerspectiveGuidesProps) {
  const safeW = Math.max(100, Math.round(width));
  const safeH = Math.max(100, Math.round(height));
  const active = visible && isFisheyePreset(preset);
  const strokeColor = STUDIO_THEMES[studioTheme].perspectiveGuideColor;

  const geometry = useMemo(() => {
    if (!active) return null;
    const aspect = safeW / safeH;

    const verticalArcs = [-0.78, -0.4, 0, 0.4, 0.78].map((sx) => ({
      key: `v-${sx}`,
      major: sx === 0,
      d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
        sx,
        sy: -1.15 + 2.3 * t,
      })),
    }));

    const horizontalArcs = [-0.78, -0.4, 0, 0.4, 0.78].map((sy) => ({
      key: `h-${sy}`,
      major: sy === 0,
      d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
        sx: -1.15 + 2.3 * t,
        sy,
      })),
    }));

    const domeEllipses = [0.42, 0.84, 0.98].map((r) => {
      const rx = sourceNdcToScreenNdc(r, 0, preset, curvature, aspect).x;
      const ry = sourceNdcToScreenNdc(0, r, preset, curvature, aspect).y;
      return {
        key: `dome-${r}`,
        rx: Math.abs(rx) * (safeW * 0.5),
        ry: Math.abs(ry) * (safeH * 0.5),
        outer: r >= 0.95,
      };
    });

    return {
      paths: [...verticalArcs, ...horizontalArcs],
      domeEllipses,
      vanishingTicks: [
        { x: safeW * 0.5, y: safeH * 0.5, key: 'vp-center' },
        { x: safeW * 0.5, y: 10, key: 'vp-north' },
        { x: safeW * 0.5, y: safeH - 10, key: 'vp-south' },
        { x: 10, y: safeH * 0.5, key: 'vp-west' },
        { x: safeW - 10, y: safeH * 0.5, key: 'vp-east' },
      ],
    };
  }, [active, safeW, safeH, preset, curvature]);

  if (!active || !geometry) return null;

  return (
    <svg
      aria-hidden="true"
      data-testid="perspective-guides"
      viewBox={`0 0 ${safeW} ${safeH}`}
      className="pointer-events-none fixed inset-0 z-[5] h-full w-full select-none"
    >
      {geometry.paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={strokeColor}
          strokeWidth={p.major ? 1.15 : 0.85}
          strokeDasharray={p.major ? undefined : '4 5'}
          opacity={p.major ? 0.95 : 0.72}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {geometry.domeEllipses.map((e) => (
        <ellipse
          key={e.key}
          cx={safeW * 0.5}
          cy={safeH * 0.5}
          rx={e.rx}
          ry={e.ry}
          fill="none"
          stroke={strokeColor}
          strokeWidth={e.outer ? 1.05 : 0.85}
          strokeDasharray={e.outer ? '5 4' : '3 5'}
          opacity={e.outer ? 0.8 : 0.65}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {geometry.vanishingTicks.map((vp) => (
        <circle
          key={vp.key}
          cx={vp.x}
          cy={vp.y}
          r={2.5}
          fill={strokeColor}
          opacity={0.9}
        />
      ))}
    </svg>
  );
}
