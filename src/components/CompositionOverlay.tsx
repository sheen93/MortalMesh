'use client';

import { useMemo } from 'react';
import type {
  CompositionCropRatio,
  CompositionGridType,
  StudioThemeId,
} from '@/types/anatomy';

interface CompositionOverlayProps {
  crop: CompositionCropRatio;
  grid: CompositionGridType;
  goldenSpiralFlip: boolean;
  studioTheme: StudioThemeId;
  width: number;
  height: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

function parseRatio(crop: CompositionCropRatio): number | null {
  switch (crop) {
    case '4:5':
      return 4 / 5;
    case '16:9':
      return 16 / 9;
    case '1:1':
      return 1;
    case '9:16':
      return 9 / 16;
    case 'off':
      return null;
  }
}

function buildGoldenSpiralPath(x: number, y: number, w: number, h: number): string {
  // Fit a golden-ratio sub-rectangle centered inside the active frame.
  let gw = w;
  let gh = w / PHI;
  if (gh > h) {
    gh = h;
    gw = h * PHI;
  }
  let rx = x + (w - gw) * 0.5;
  let ry = y + (h - gh) * 0.5;
  let rw = gw;
  let rh = gh;

  const commands: string[] = [];
  for (let step = 0; step < 6; step += 1) {
    const mod = step % 4;
    if (mod === 0) {
      const s = Math.min(rw, rh);
      if (s < 2) break;
      commands.push(
        step === 0
          ? `M${rx.toFixed(1)},${(ry + s).toFixed(1)} A${s.toFixed(1)},${s.toFixed(1)} 0 0,1 ${(rx + s).toFixed(1)},${ry.toFixed(1)}`
          : `A${s.toFixed(1)},${s.toFixed(1)} 0 0,1 ${(rx + s).toFixed(1)},${ry.toFixed(1)}`
      );
      rx += s;
      rw -= s;
    } else if (mod === 1) {
      const s = Math.min(rw, rh);
      if (s < 2) break;
      commands.push(
        `A${s.toFixed(1)},${s.toFixed(1)} 0 0,1 ${(rx + s).toFixed(1)},${(ry + s).toFixed(1)}`
      );
      ry += s;
      rh -= s;
    } else if (mod === 2) {
      const s = Math.min(rw, rh);
      if (s < 2) break;
      commands.push(
        `A${s.toFixed(1)},${s.toFixed(1)} 0 0,1 ${(rx + rw - s).toFixed(1)},${(ry + s).toFixed(1)}`
      );
      rw -= s;
    } else {
      const s = Math.min(rw, rh);
      if (s < 2) break;
      commands.push(
        `A${s.toFixed(1)},${s.toFixed(1)} 0 0,1 ${rx.toFixed(1)},${(ry + rh - s).toFixed(1)}`
      );
      rh -= s;
    }
  }
  return commands.join(' ');
}

/**
 * Fullscreen pointer-transparent aspect crop & composition grid guide layer.
 */
export function CompositionOverlay({
  crop,
  grid,
  goldenSpiralFlip,
  studioTheme,
  width,
  height,
}: CompositionOverlayProps) {
  const safeW = Math.max(100, Math.round(width));
  const safeH = Math.max(100, Math.round(height));

  const geometry = useMemo(() => {
    if (crop === 'off' && grid === 'off') return null;

    const targetAspect = parseRatio(crop);
    let fx = 0;
    let fy = 0;
    let fw = safeW;
    let fh = safeH;

    if (targetAspect !== null) {
      const viewAspect = safeW / safeH;
      if (viewAspect > targetAspect) {
        fh = safeH;
        fw = Math.round(safeH * targetAspect);
        fx = Math.round((safeW - fw) * 0.5);
      } else {
        fw = safeW;
        fh = Math.round(safeW / targetAspect);
        fy = Math.round((safeH - fh) * 0.5);
      }
    }

    const spiralPath =
      grid === 'golden' ? buildGoldenSpiralPath(fx, fy, fw, fh) : '';

    return {
      fx,
      fy,
      fw,
      fh,
      hasCrop: targetAspect !== null,
      spiralPath,
    };
  }, [crop, grid, safeW, safeH]);

  if (!geometry) return null;

  const { fx, fy, fw, fh, hasCrop, spiralPath } = geometry;
  const matteColor =
    studioTheme === 'light'
      ? 'rgba(15, 23, 42, 0.32)'
      : 'rgba(9, 10, 14, 0.52)';
  const borderColor =
    studioTheme === 'light'
      ? 'rgba(24, 24, 27, 0.58)'
      : 'rgba(244, 244, 245, 0.62)';
  const guideColor =
    studioTheme === 'light'
      ? 'rgba(24, 24, 27, 0.34)'
      : 'rgba(244, 244, 245, 0.36)';
  const accentColor =
    studioTheme === 'light'
      ? 'rgba(24, 24, 27, 0.65)'
      : 'rgba(255, 255, 255, 0.72)';

  const outerPath = `M0,0 H${safeW} V${safeH} H0 Z M${fx},${fy} V${fy + fh} H${fx + fw} V${fy} Z`;

  return (
    <svg
      aria-hidden="true"
      data-testid="composition-overlay"
      data-crop={crop}
      data-grid={grid}
      viewBox={`0 0 ${safeW} ${safeH}`}
      className="pointer-events-none fixed inset-0 z-[7] h-full w-full select-none"
    >
      {hasCrop && (
        <>
          <path d={outerPath} fill={matteColor} fillRule="evenodd" />
          <rect
            x={fx}
            y={fy}
            width={fw}
            height={fh}
            fill="none"
            stroke={borderColor}
            strokeWidth={1.25}
          />
          <text
            x={fx + 8}
            y={Math.max(16, fy + 16)}
            fill={accentColor}
            fontSize={10}
            fontWeight={600}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {crop}
          </text>
        </>
      )}

      {grid === 'thirds' && (
        <g stroke={guideColor} strokeWidth={1}>
          <line x1={fx + fw / 3} y1={fy} x2={fx + fw / 3} y2={fy + fh} />
          <line
            x1={fx + (2 * fw) / 3}
            y1={fy}
            x2={fx + (2 * fw) / 3}
            y2={fy + fh}
          />
          <line x1={fx} y1={fy + fh / 3} x2={fx + fw} y2={fy + fh / 3} />
          <line
            x1={fx}
            y1={fy + (2 * fh) / 3}
            x2={fx + fw}
            y2={fy + (2 * fh) / 3}
          />
          {[1 / 3, 2 / 3].flatMap((tx) =>
            [1 / 3, 2 / 3].map((ty) => (
              <circle
                key={`${tx}-${ty}`}
                cx={fx + fw * tx}
                cy={fy + fh * ty}
                r={2.4}
                fill={accentColor}
                stroke="none"
              />
            ))
          )}
        </g>
      )}

      {grid === 'cross' && (
        <g stroke={guideColor} strokeWidth={1}>
          <line
            x1={fx + fw * 0.5}
            y1={fy}
            x2={fx + fw * 0.5}
            y2={fy + fh}
            strokeDasharray="5 4"
          />
          <line
            x1={fx}
            y1={fy + fh * 0.5}
            x2={fx + fw}
            y2={fy + fh * 0.5}
            strokeDasharray="5 4"
          />
          <circle
            cx={fx + fw * 0.5}
            cy={fy + fh * 0.5}
            r={6}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.1}
          />
        </g>
      )}

      {grid === 'golden' && (
        <g
          transform={
            goldenSpiralFlip
              ? `translate(${2 * fx + fw}, 0) scale(-1, 1)`
              : undefined
          }
        >
          <g stroke={guideColor} strokeWidth={0.9} strokeDasharray="3 4">
            <line
              x1={fx + fw * (1 - INV_PHI)}
              y1={fy}
              x2={fx + fw * (1 - INV_PHI)}
              y2={fy + fh}
            />
            <line
              x1={fx + fw * INV_PHI}
              y1={fy}
              x2={fx + fw * INV_PHI}
              y2={fy + fh}
            />
            <line
              x1={fx}
              y1={fy + fh * (1 - INV_PHI)}
              x2={fx + fw}
              y2={fy + fh * (1 - INV_PHI)}
            />
            <line
              x1={fx}
              y1={fy + fh * INV_PHI}
              x2={fx + fw}
              y2={fy + fh * INV_PHI}
            />
          </g>
          {spiralPath && (
            <path
              d={spiralPath}
              fill="none"
              stroke={accentColor}
              strokeWidth={1.35}
            />
          )}
        </g>
      )}
    </svg>
  );
}
