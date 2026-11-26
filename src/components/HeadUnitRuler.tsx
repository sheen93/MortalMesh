'use client';

import { STUDIO_THEMES } from '@/data/studioThemes';
import type { HeadRulerMetrics, StudioThemeId } from '@/types/anatomy';

interface HeadUnitRulerProps {
  metrics: HeadRulerMetrics | null;
  studioTheme: StudioThemeId;
  width: number;
  height: number;
  isHudMinimized?: boolean;
}

/**
 * Non-intrusive CAD vertical head-unit proportion ruler projected beside
 * the active mannequin (warping cleanly under Fisheye lens presets and
 * omitted automatically from PNG exports).
 */
export function HeadUnitRuler({
  metrics,
  studioTheme,
  width,
  height,
  isHudMinimized = false,
}: HeadUnitRulerProps) {
  if (!metrics || !metrics.visible || isHudMinimized) return null;

  const safeW = Math.max(100, Math.round(width));
  const safeH = Math.max(100, Math.round(height));
  const strokeColor =
    studioTheme === 'light'
      ? 'rgba(24, 24, 27, 0.72)'
      : 'rgba(244, 244, 245, 0.82)';
  const softStroke =
    studioTheme === 'light'
      ? 'rgba(24, 24, 27, 0.28)'
      : 'rgba(244, 244, 245, 0.34)';
  const haloColor =
    studioTheme === 'light'
      ? 'rgba(255, 255, 255, 0.75)'
      : 'rgba(9, 9, 11, 0.72)';
  const { ui } = STUDIO_THEMES[studioTheme];

  const badgeLeft = Math.min(safeW - 118, Math.max(12, metrics.anchorX - 44));
  const badgeTop = Math.max(58, Math.min(safeH - 120, metrics.topY - 28));
  const heightCm = Math.round(metrics.standingHeightMeters * 100);

  return (
    <div
      data-testid="head-unit-ruler"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[6] select-none"
    >
      <svg viewBox={`0 0 ${safeW} ${safeH}`} className="h-full w-full">
        <line
          x1={metrics.anchorX}
          y1={metrics.topY}
          x2={metrics.anchorX}
          y2={metrics.bottomY}
          stroke={haloColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <line
          x1={metrics.anchorX}
          y1={metrics.topY}
          x2={metrics.anchorX}
          y2={metrics.bottomY}
          stroke={strokeColor}
          strokeWidth={1.25}
          strokeLinecap="round"
        />

        {metrics.ticks.map((tick) => {
          const tickLen = tick.isMajor ? 11 : 6;
          return (
            <g key={tick.headIndex}>
              <line
                x1={tick.screenX - 18}
                y1={tick.screenY}
                x2={tick.screenX - 2}
                y2={tick.screenY}
                stroke={softStroke}
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
              <line
                x1={tick.screenX - tickLen}
                y1={tick.screenY}
                x2={tick.screenX + 5}
                y2={tick.screenY}
                stroke={haloColor}
                strokeWidth={2.5}
              />
              <line
                x1={tick.screenX - tickLen}
                y1={tick.screenY}
                x2={tick.screenX + 5}
                y2={tick.screenY}
                stroke={strokeColor}
                strokeWidth={tick.isMajor ? 1.4 : 1}
              />
              <text
                x={tick.screenX + 9}
                y={tick.screenY + 3.5}
                fill={strokeColor}
                fontSize={10}
                fontWeight={tick.isMajor ? 700 : 500}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                style={{ paintOrder: 'stroke', stroke: haloColor, strokeWidth: 2.5 }}
              >
                {tick.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        data-testid="head-unit-readout"
        style={{ left: badgeLeft, top: badgeTop }}
        className={`fixed rounded-lg px-2 py-0.5 font-mono text-[10.5px] font-semibold whitespace-nowrap backdrop-blur-md shadow-sm ${ui.monoPill}`}
      >
        {metrics.headCount.toFixed(1)} Heads · {heightCm}cm
      </div>
    </div>
  );
}
