'use client';

import { useMemo } from 'react';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  isCurvilinearPreset,
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

const SAMPLE_STEPS = 44;

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
 * Architectural perspective overlay for 4-PT (vertical curved meridians & horizon)
 * and 5-PT (hemispherical dome & cardinal vanishing arcs). Rendered as a DOM SVG
 * above the WebGL canvas so it never appears in studio or transparent PNG cutouts.
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
  const active = visible && isCurvilinearPreset(preset);
  const strokeColor = STUDIO_THEMES[studioTheme].perspectiveGuideColor;

  const geometry = useMemo(() => {
    if (!active) return null;
    const aspect = safeW / safeH;

    if (preset === '4-point') {
      const verticalMeridians = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map(
        (sx) => ({
          key: `v-${sx}`,
          major: sx === 0,
          d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
            sx,
            sy: -1 + 2 * t,
          })),
        })
      );

      const horizontals = [-0.55, 0, 0.55].map((sy) => ({
        key: `h-${sy}`,
        major: sy === 0,
        d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
          sx: -1 + 2 * t,
          sy,
        })),
      }));

      return {
        paths: [...verticalMeridians, ...horizontals],
        domeEllipses: [] as Array<{ rx: number; ry: number; key: string }>,
        vanishingTicks: [
          { x: safeW * 0.5, y: 10, key: 'vp-top' },
          { x: safeW * 0.5, y: safeH - 10, key: 'vp-bottom' },
        ],
      };
    }

    const verticalArcs = [-0.72, -0.36, 0, 0.36, 0.72].map((sx) => ({
      key: `v5-${sx}`,
      major: sx === 0,
      d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
        sx,
        sy: -1 + 2 * t,
      })),
    }));

    const horizontalArcs = [-0.72, -0.36, 0, 0.36, 0.72].map((sy) => ({
      key: `h5-${sy}`,
      major: sy === 0,
      d: buildSampledCurve(safeW, safeH, preset, curvature, aspect, (t) => ({
        sx: -1 + 2 * t,
        sy,
      })),
    }));

    const rxEdge = sourceNdcToScreenNdc(0.92, 0, preset, curvature, aspect).x;
    const ryEdge = sourceNdcToScreenNdc(0, 0.92, preset, curvature, aspect).y;
    const rxMid = sourceNdcToScreenNdc(0.46, 0, preset, curvature, aspect).x;
    const ryMid = sourceNdcToScreenNdc(0, 0.46, preset, curvature, aspect).y;

    return {
      paths: [...verticalArcs, ...horizontalArcs],
      domeEllipses: [
        {
          key: 'dome-mid',
          rx: Math.abs(rxMid) * (safeW * 0.5),
          ry: Math.abs(ryMid) * (safeH * 0.5),
        },
        {
          key: 'dome-outer',
          rx: Math.abs(rxEdge) * (safeW * 0.5),
          ry: Math.abs(ryEdge) * (safeH * 0.5),
        },
      ],
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
          strokeWidth={0.9}
          strokeDasharray="3 5"
          opacity={0.68}
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
