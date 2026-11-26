'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraPreset, StudioThemeId } from '@/types/anatomy';
import type { DrawingStyleId, StudioDrawingConfig } from '@/types/drawing';
import {
  clampLensCurvature,
  getFisheyeOptics,
  screenNdcToSourceNdc,
} from '@/utils/lensWarp';

export type CurvilinearRenderHook = (
  targetWidth: number,
  targetHeight: number,
  transparent: boolean
) => void;

interface CurvilinearLensProps {
  preset: CameraPreset;
  curvature: number;
  drawing: StudioDrawingConfig;
  studioTheme: StudioThemeId;
  renderHookRef: MutableRefObject<CurvilinearRenderHook | null>;
}

function drawingStyleToInt(style: DrawingStyleId): number {
  switch (style) {
    case 'blue-pencil':
      return 1;
    case 'planar':
      return 2;
    case 'comic-ink':
      return 3;
    case 'skeleton-sheet':
      return 4;
    default:
      return 0;
  }
}

function isInteractiveControlObject(obj: THREE.Object3D): boolean {
  return (
    obj.name === 'mortal-mesh-hitboxes' ||
    obj.name === 'mortal-mesh-ik-handles' ||
    obj.name === 'mortal-mesh-gizmo' ||
    obj.name === 'mortal-mesh-prop-gizmo' ||
    obj.type === 'TransformControls'
  );
}

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tCenter;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uWideSize;
uniform vec2 uCenterSize;
uniform int uActive;
uniform int uUseCenter;
uniform float uCurvature;
uniform float uAspect;
uniform float uCenterZoom;
uniform float uTransparent;
uniform float uPremultiplyOut;

uniform int uDrawingStyle;
uniform float uInkWeight;
uniform int uHatching;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uPixelRatio;

varying vec2 vUv;

vec4 sampleSharp(
  sampler2D tex,
  vec2 uv,
  vec2 texSize,
  float isTransparent
) {
  vec2 safeSize = max(texSize, vec2(2.0));
  vec2 invSize = 1.0 / safeSize;
  vec2 texelPos = uv * safeSize;
  vec2 texelCenter = floor(texelPos - 0.5) + 0.5;
  vec2 f = texelPos - texelCenter;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;

  vec2 w0 = f2 - 0.5 * (f3 + f);
  vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
  vec2 w3 = 0.5 * (f3 - f2);
  vec2 w2 = 1.0 - w0 - w1 - w3;

  vec2 w12 = w1 + w2;
  vec2 tc0 = (texelCenter - 1.0) * invSize;
  vec2 tc3 = (texelCenter + 2.0) * invSize;
  vec2 tc12 = (texelCenter + (w2 / max(w12, vec2(1e-4)))) * invSize;

  vec2 minUv = invSize * 0.5;
  vec2 maxUv = 1.0 - minUv;
  tc0 = clamp(tc0, minUv, maxUv);
  tc3 = clamp(tc3, minUv, maxUv);
  tc12 = clamp(tc12, minUv, maxUv);

  vec4 sTop = texture2D(tex, vec2(tc12.x, tc0.y));
  vec4 sLeft = texture2D(tex, vec2(tc0.x, tc12.y));
  vec4 sCenter = texture2D(tex, vec2(tc12.x, tc12.y));
  vec4 sRight = texture2D(tex, vec2(tc3.x, tc12.y));
  vec4 sBottom = texture2D(tex, vec2(tc12.x, tc3.y));

  float wtTop = w12.x * w0.y;
  float wtLeft = w0.x * w12.y;
  float wtCenter = w12.x * w12.y;
  float wtRight = w3.x * w12.y;
  float wtBottom = w12.x * w3.y;
  float totalW = wtTop + wtLeft + wtCenter + wtRight + wtBottom;

  vec4 cr = (
    sTop * wtTop +
    sLeft * wtLeft +
    sCenter * wtCenter +
    sRight * wtRight +
    sBottom * wtBottom
  ) / max(totalW, 1e-5);
  cr = max(cr, vec4(0.0));
  cr.a = clamp(cr.a, 0.0, 1.0);

  vec4 baseLin = texture2D(tex, clamp(uv, minUv, maxUv));
  vec4 sharp = mix(baseLin, cr, 0.72);

  if (isTransparent > 0.5) {
    vec2 b00 = clamp(texelCenter * invSize, minUv, maxUv);
    vec2 b10 = clamp((texelCenter + vec2(1.0, 0.0)) * invSize, minUv, maxUv);
    vec2 b01 = clamp((texelCenter + vec2(0.0, 1.0)) * invSize, minUv, maxUv);
    vec2 b11 = clamp((texelCenter + vec2(1.0, 1.0)) * invSize, minUv, maxUv);
    vec4 n0 = texture2D(tex, b00);
    vec4 n1 = texture2D(tex, b10);
    vec4 n2 = texture2D(tex, b01);
    vec4 n3 = texture2D(tex, b11);
    vec4 cMin = min(min(n0, n1), min(n2, n3));
    vec4 cMax = max(max(n0, n1), max(n2, n3));
    sharp = clamp(sharp, cMin, cMax);
  }

  return sharp;
}

vec4 sampleAdaptive(
  sampler2D tex,
  vec2 uv,
  vec2 texSize,
  vec2 duvDx,
  vec2 duvDy,
  float isTransparent
) {
  vec2 safeSize = max(texSize, vec2(2.0));
  float footprint = max(length(duvDx * safeSize), length(duvDy * safeSize));
  if (footprint > 1.35) {
    vec2 invSize = 1.0 / safeSize;
    vec2 minUv = invSize * 0.5;
    vec2 maxUv = 1.0 - minUv;
    vec4 t0 = texture2D(tex, clamp(uv + (-0.375 * duvDx + 0.125 * duvDy), minUv, maxUv));
    vec4 t1 = texture2D(tex, clamp(uv + (0.375 * duvDx - 0.125 * duvDy), minUv, maxUv));
    vec4 t2 = texture2D(tex, clamp(uv + (0.125 * duvDx + 0.375 * duvDy), minUv, maxUv));
    vec4 t3 = texture2D(tex, clamp(uv + (-0.125 * duvDx - 0.375 * duvDy), minUv, maxUv));
    return 0.25 * (t0 + t1 + t2 + t3);
  }
  return sampleSharp(tex, uv, safeSize, isTransparent);
}

float readLinearDepth(vec2 uv) {
  vec2 safeSize = max(uWideSize, vec2(2.0));
  vec2 minUv = 0.5 / safeSize;
  float d = texture2D(tDepth, clamp(uv, minUv, 1.0 - minUv)).r;
  float denom = max(uCameraFar - d * (uCameraFar - uCameraNear), 0.0001);
  return (uCameraNear * uCameraFar) / denom;
}

vec4 readNormAlpha(vec2 uv) {
  vec2 safeSize = max(uWideSize, vec2(2.0));
  vec2 minUv = 0.5 / safeSize;
  vec4 n = texture2D(tNormal, clamp(uv, minUv, 1.0 - minUv));
  return vec4(n.rgb * 2.0 - 1.0, n.a);
}

vec3 linearToSrgbApprox(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec2 srcNdc = ndc;

  if (uActive == 1) {
    float rxScale = uAspect >= 1.0 ? uAspect : 1.0;
    float ryScale = uAspect >= 1.0 ? 1.0 : 1.0 / max(uAspect, 0.05);
    float rMax = length(vec2(rxScale, ryScale));
    float t = clamp((uCurvature - 0.1) / 0.9, 0.0, 1.0);
    float phi = 0.30 + 1.05 * pow(t, 0.92);
    float tanPhi = tan(phi);
    float r = length(vec2(ndc.x * rxScale, ndc.y * ryScale));
    float u = r / rMax;
    float factor = u > 0.00001 ? tan(u * phi) / (tanPhi * u) : phi / tanPhi;
    srcNdc = ndc * factor;
  }

  vec2 dSrcDx = dFdx(srcNdc);
  vec2 dSrcDy = dFdy(srcNdc);

  vec2 wideUv = srcNdc * 0.5 + 0.5;
  vec2 dWideDx = dSrcDx * 0.5;
  vec2 dWideDy = dSrcDy * 0.5;

  if (uDrawingStyle > 0) {
    vec2 stepUv = (clamp(uInkWeight, 0.6, 2.0) * max(uPixelRatio, 1.0) * 0.72) / max(uWideSize, vec2(2.0));
    vec2 minUv = 0.5 / max(uWideSize, vec2(2.0));
    vec2 clampedWideUv = clamp(wideUv, minUv, 1.0 - minUv);

    vec4 colSample = texture2D(tDiffuse, clampedWideUv);
    vec3 colSrgb = colSample.a > 0.002
      ? linearToSrgbApprox(colSample.rgb / colSample.a)
      : vec3(0.0);

    vec4 nC = readNormAlpha(clampedWideUv);
    float dC = readLinearDepth(clampedWideUv);

    // 3x3 Sobel kernel across normal + normalized linear depth + silhouette mask
    vec4 nTL = readNormAlpha(clampedWideUv + vec2(-stepUv.x,  stepUv.y));
    vec4 nTC = readNormAlpha(clampedWideUv + vec2(0.0,        stepUv.y));
    vec4 nTR = readNormAlpha(clampedWideUv + vec2( stepUv.x,  stepUv.y));
    vec4 nML = readNormAlpha(clampedWideUv + vec2(-stepUv.x,  0.0));
    vec4 nMR = readNormAlpha(clampedWideUv + vec2( stepUv.x,  0.0));
    vec4 nBL = readNormAlpha(clampedWideUv + vec2(-stepUv.x, -stepUv.y));
    vec4 nBC = readNormAlpha(clampedWideUv + vec2(0.0,       -stepUv.y));
    vec4 nBR = readNormAlpha(clampedWideUv + vec2( stepUv.x, -stepUv.y));

    vec3 gxN = -nTL.rgb - 2.0 * nML.rgb - nBL.rgb + nTR.rgb + 2.0 * nMR.rgb + nBR.rgb;
    vec3 gyN =  nTL.rgb + 2.0 * nTC.rgb + nTR.rgb - nBL.rgb - 2.0 * nBC.rgb - nBR.rgb;
    float normalEdgeRaw = sqrt(dot(gxN, gxN) + dot(gyN, gyN));

    float gxA = -nTL.a - 2.0 * nML.a - nBL.a + nTR.a + 2.0 * nMR.a + nBR.a;
    float gyA =  nTL.a + 2.0 * nTC.a + nTR.a - nBL.a - 2.0 * nBC.a - nBR.a;
    float maskEdgeRaw = sqrt(gxA * gxA + gyA * gyA);

    float dTL = readLinearDepth(clampedWideUv + vec2(-stepUv.x,  stepUv.y));
    float dTC = readLinearDepth(clampedWideUv + vec2(0.0,        stepUv.y));
    float dTR = readLinearDepth(clampedWideUv + vec2( stepUv.x,  stepUv.y));
    float dML = readLinearDepth(clampedWideUv + vec2(-stepUv.x,  0.0));
    float dMR = readLinearDepth(clampedWideUv + vec2( stepUv.x,  0.0));
    float dBL = readLinearDepth(clampedWideUv + vec2(-stepUv.x, -stepUv.y));
    float dBC = readLinearDepth(clampedWideUv + vec2(0.0,       -stepUv.y));
    float dBR = readLinearDepth(clampedWideUv + vec2( stepUv.x, -stepUv.y));

    float gxD = -dTL - 2.0 * dML - dBL + dTR + 2.0 * dMR + dBR;
    float gyD =  dTL + 2.0 * dTC + dTR - dBL - 2.0 * dBC - dBR;
    float depthEdgeRaw = sqrt(gxD * gxD + gyD * gyD) / max(dC, 0.55);

    float hasAnySolid = max(nC.a, max(max(nTL.a, nTR.a), max(nBL.a, nBR.a)));
    float outerSilEdge = smoothstep(0.42, 1.05, max(maskEdgeRaw, depthEdgeRaw * 1.45)) * step(0.1, hasAnySolid);
    float normThreshLow = uDrawingStyle == 4 ? 0.58 : 0.72;
    float normThreshHigh = uDrawingStyle == 4 ? 1.25 : 1.45;
    float innerCreaseEdge = smoothstep(normThreshLow, normThreshHigh, normalEdgeRaw) * step(0.35, nC.a);
    float anyEdge = clamp(max(outerSilEdge, innerCreaseEdge), 0.0, 1.0);

    float lum = dot(colSrgb, vec3(0.299, 0.587, 0.114));
    float isFloorShadow = step(nC.a, 0.2) * smoothstep(0.04, 0.28, colSample.a);

    // Screen-space architectural diagonal hatching inside shadow values
    float hatchFreq = 0.78 / max(uPixelRatio, 1.0);
    float diagA = abs(fract((gl_FragCoord.x + gl_FragCoord.y) * 0.115 * hatchFreq) - 0.5);
    float diagB = abs(fract((gl_FragCoord.x - gl_FragCoord.y) * 0.115 * hatchFreq) - 0.5);
    float hatchBand1 = 1.0 - smoothstep(0.14, 0.24, diagA);
    float hatchBand2 = 1.0 - smoothstep(0.11, 0.20, diagB);

    vec3 paperCol;
    vec3 bodyLitCol;
    vec3 bodyMidCol;
    vec3 bodyShadowCol;
    vec3 creaseCol;
    vec3 silCol;

    if (uDrawingStyle == 1) {
      // 1: Loomis Blue-Pencil
      paperCol = vec3(0.961, 0.949, 0.922);     // #F5F2EB warm cotton paper
      bodyLitCol = vec3(0.955, 0.962, 0.972);   // soft warm-cool highlight
      bodyMidCol = vec3(0.840, 0.892, 0.949);   // classic non-photo blue tint
      bodyShadowCol = vec3(0.680, 0.785, 0.905);
      creaseCol = vec3(0.180, 0.451, 0.722);    // #2E73B8 Loomis blue pencil
      silCol = vec3(0.110, 0.169, 0.227);       // #1C2B3A indigo-graphite
    } else if (uDrawingStyle == 2) {
      // 2: Bridgman Planar
      paperCol = vec3(0.925, 0.910, 0.875);     // #ECE8DF warm stone paper
      bodyLitCol = vec3(0.955, 0.945, 0.915);
      bodyMidCol = vec3(0.845, 0.835, 0.805);
      bodyShadowCol = vec3(0.560, 0.565, 0.585);
      creaseCol = vec3(0.160, 0.175, 0.200);
      silCol = vec3(0.085, 0.092, 0.105);
    } else if (uDrawingStyle == 3) {
      // 3: Comic Ink
      paperCol = vec3(1.0, 1.0, 1.0);           // #FFFFFF pure Bristol board
      bodyLitCol = vec3(1.0, 1.0, 1.0);
      bodyMidCol = vec3(0.945, 0.949, 0.957);
      bodyShadowCol = vec3(0.850, 0.858, 0.875);
      creaseCol = vec3(0.063, 0.071, 0.086);    // #101216 ink black
      silCol = vec3(0.063, 0.071, 0.086);
    } else {
      // 4: Skeleton Sheet
      paperCol = vec3(0.937, 0.925, 0.890);     // #EFECE3 plate paper
      bodyLitCol = vec3(0.980, 0.973, 0.949);   // #FAF8F2 ivory bone plate
      bodyMidCol = vec3(0.870, 0.852, 0.815);
      bodyShadowCol = vec3(0.735, 0.715, 0.675);
      creaseCol = vec3(0.125, 0.114, 0.102);
      silCol = vec3(0.098, 0.090, 0.082);
    }

    vec3 outRgb = paperCol;

    if (nC.a > 0.35) {
      if (uDrawingStyle == 2) {
        // Sharp 2-value Bridgman light/shadow planes
        float litMask = step(0.46, lum);
        outRgb = mix(bodyShadowCol, bodyLitCol, litMask);
        if (uHatching == 1 && litMask < 0.5) {
          outRgb = mix(outRgb, creaseCol, hatchBand1 * 0.28);
        }
      } else if (uDrawingStyle == 3) {
        // Pure comic ink white highlight + clean diagonal ink hatching in deep shadow
        float midStep = smoothstep(0.28, 0.42, lum);
        outRgb = mix(bodyShadowCol, bodyLitCol, midStep);
        if (uHatching == 1) {
          float shadowAmt = 1.0 - smoothstep(0.16, 0.38, lum);
          float deepShadow = 1.0 - smoothstep(0.06, 0.22, lum);
          float hatchMask = max(shadowAmt * hatchBand1 * 0.82, deepShadow * hatchBand2 * 0.72);
          outRgb = mix(outRgb, silCol, hatchMask);
        }
      } else if (uDrawingStyle == 1) {
        float valBand = smoothstep(0.20, 0.65, lum);
        outRgb = mix(bodyShadowCol, bodyLitCol, valBand);
        if (uHatching == 1 && lum < 0.42) {
          outRgb = mix(outRgb, creaseCol, hatchBand1 * 0.30);
        }
      } else {
        float valBand = smoothstep(0.18, 0.66, lum);
        outRgb = mix(bodyShadowCol, bodyLitCol, valBand);
        if (uHatching == 1 && lum < 0.36) {
          outRgb = mix(outRgb, creaseCol, hatchBand1 * 0.22);
        }
      }
    } else if (isFloorShadow > 0.01 && uTransparent < 0.5) {
      vec3 shadowTint = (uDrawingStyle == 1) ? creaseCol : silCol;
      if (uHatching == 1) {
        outRgb = mix(paperCol, shadowTint, isFloorShadow * mix(0.14, 0.48, hatchBand1));
      } else {
        outRgb = mix(paperCol, shadowTint, isFloorShadow * 0.16);
      }
    }

    // Apply sharp silhouette & interior anatomical ink lines
    vec3 edgeColor = mix(creaseCol, silCol, outerSilEdge);
    outRgb = mix(outRgb, edgeColor, anyEdge);

    if (uTransparent > 0.5) {
      float solidAlpha = max(step(0.35, nC.a), anyEdge);
      if (solidAlpha <= 0.01) {
        gl_FragColor = vec4(0.0);
        return;
      }
      gl_FragColor = vec4(outRgb * solidAlpha, solidAlpha);
      return;
    }

    gl_FragColor = vec4(outRgb, 1.0);
    return;
  }

  vec4 texel;
  if (uUseCenter == 1) {
    vec2 cNdc = srcNdc * uCenterZoom;
    float edge = max(abs(cNdc.x), abs(cNdc.y));
    float wideWeight = smoothstep(0.76, 0.97, edge);
    vec2 centerUv = cNdc * 0.5 + 0.5;
    vec2 dCenterDx = dSrcDx * (0.5 * uCenterZoom);
    vec2 dCenterDy = dSrcDy * (0.5 * uCenterZoom);

    if (wideWeight <= 0.001) {
      texel = sampleAdaptive(tCenter, centerUv, uCenterSize, dCenterDx, dCenterDy, uTransparent);
    } else if (wideWeight >= 0.999) {
      texel = sampleAdaptive(tDiffuse, wideUv, uWideSize, dWideDx, dWideDy, uTransparent);
    } else {
      vec4 cCol = sampleAdaptive(tCenter, centerUv, uCenterSize, dCenterDx, dCenterDy, uTransparent);
      vec4 wCol = sampleAdaptive(tDiffuse, wideUv, uWideSize, dWideDx, dWideDy, uTransparent);
      texel = mix(cCol, wCol, wideWeight);
    }
  } else {
    texel = sampleAdaptive(tDiffuse, wideUv, uWideSize, dWideDx, dWideDy, uTransparent);
  }

  if (uTransparent > 0.5) {
    if (texel.a <= 0.0005) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec3 straightRgb = clamp(texel.rgb / texel.a, 0.0, 64.0);
    gl_FragColor = vec4(straightRgb, texel.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    if (uPremultiplyOut > 0.5) {
      gl_FragColor.rgb *= gl_FragColor.a;
    }
  } else {
    gl_FragColor = vec4(texel.rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
}
`;

const _savedClearColor = new THREE.Color();

function createLensRenderTarget(
  gl: THREE.WebGLRenderer
): THREE.WebGLRenderTarget {
  const supportsHalfFloat =
    gl.capabilities.isWebGL2 &&
    (gl.extensions.has('EXT_color_buffer_half_float') ||
      gl.extensions.has('EXT_color_buffer_float'));
  const maxSamples = gl.capabilities.isWebGL2
    ? Math.min(4, gl.capabilities.maxSamples || 0)
    : 0;

  const rt = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: maxSamples,
  });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
}

function createNormalDepthRenderTarget(): THREE.WebGLRenderTarget {
  const depthTexture = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  depthTexture.generateMipmaps = false;

  const rt = new THREE.WebGLRenderTarget(2, 2, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  });
  rt.depthTexture = depthTexture;
  rt.texture.generateMipmaps = false;
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

function fitTargetSize(
  targetW: number,
  targetH: number,
  scale: number,
  maxDim: number
): { width: number; height: number } {
  let w = Math.max(2, Math.round(targetW * scale));
  let h = Math.max(2, Math.round(targetH * scale));
  const longest = Math.max(w, h);
  if (longest > maxDim) {
    const k = maxDim / longest;
    w = Math.max(2, Math.round(w * k));
    h = Math.max(2, Math.round(h * k));
  }
  return { width: w, height: h };
}

/**
 * Unified post-render studio pipeline combining:
 * - High-clarity foveated dual-pass Fisheye dome warping
 * - Real-time 3x3 Depth+Normal Sobel Blueprint & Ink rendering
 * - Clean interactive control overlay so FK rings / IK handles remain draggable live
 */
export function CurvilinearLens({
  preset,
  curvature,
  drawing,
  studioTheme,
  renderHookRef,
}: CurvilinearLensProps) {
  const { gl, scene, camera, size, setEvents, invalidate } = useThree();

  const presetRef = useRef<CameraPreset>(preset);
  const curvatureRef = useRef<number>(clampLensCurvature(curvature));
  const drawingRef = useRef<StudioDrawingConfig>(drawing);
  presetRef.current = preset;
  curvatureRef.current = clampLensCurvature(curvature);
  drawingRef.current = drawing;

  const postScene = useMemo(() => {
    const s = new THREE.Scene();
    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tCenter: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        uWideSize: { value: new THREE.Vector2(1, 1) },
        uCenterSize: { value: new THREE.Vector2(1, 1) },
        uActive: { value: 1 },
        uUseCenter: { value: 0 },
        uCurvature: { value: curvatureRef.current },
        uAspect: { value: 1 },
        uCenterZoom: { value: 1 },
        uTransparent: { value: 0 },
        uPremultiplyOut: { value: 1 },
        uDrawingStyle: { value: 0 },
        uInkWeight: { value: 1.1 },
        uHatching: { value: 1 },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 100 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(geom, mat);
    quad.frustumCulled = false;
    s.add(quad);

    const overlayMat = mat.clone();
    overlayMat.transparent = true;
    overlayMat.blending = THREE.NormalBlending;
    const overlayScene = new THREE.Scene();
    const overlayQuad = new THREE.Mesh(geom, overlayMat);
    overlayQuad.frustumCulled = false;
    overlayScene.add(overlayQuad);

    return { scene: s, overlayScene, geom, mat, overlayMat };
  }, []);

  const postCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  );

  const wideTarget = useMemo(() => createLensRenderTarget(gl), [gl]);
  const centerTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const normalTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const normalOverrideMat = useMemo(
    () => new THREE.MeshNormalMaterial({ side: THREE.FrontSide }),
    []
  );

  useEffect(() => {
    return () => {
      wideTarget.dispose();
      if (centerTargetRef.current) {
        centerTargetRef.current.dispose();
        centerTargetRef.current = null;
      }
      if (normalTargetRef.current) {
        normalTargetRef.current.depthTexture?.dispose();
        normalTargetRef.current.dispose();
        normalTargetRef.current = null;
      }
      normalOverrideMat.dispose();
      postScene.geom.dispose();
      postScene.mat.dispose();
      postScene.overlayMat.dispose();
    };
  }, [wideTarget, normalOverrideMat, postScene]);

  const renderCurvilinearFrame = useCallback(
    (targetWidth: number, targetHeight: number, transparent: boolean) => {
      const safeW = Math.max(2, Math.round(targetWidth));
      const safeH = Math.max(2, Math.round(targetHeight));
      const maxTexSize = gl.capabilities.maxTextureSize || 2048;

      const curDrawing = drawingRef.current;
      const drawingStyleInt = drawingStyleToInt(curDrawing.drawingStyle);
      const isDrawingPass = drawingStyleInt > 0;
      const isFisheye = presetRef.current === 'fisheye';

      if (!isDrawingPass && !isFisheye) {
        if (transparent) {
          gl.setClearColor(0x000000, 0);
          gl.clear(true, true, true);
        }
        gl.render(scene, camera);
        return;
      }

      const { phi } = getFisheyeOptics(curvatureRef.current);
      const magnification = Math.tan(phi) / phi;
      const isPersp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
      const useCenter = !isDrawingPass && isFisheye && isPersp && magnification > 1.22;
      const centerZoom = useCenter ? Math.min(3.15, magnification) : 1.0;

      const isHighResExport = safeW > 2200 || safeH > 2200;
      const wideScale = isDrawingPass
        ? isHighResExport
          ? 1.0
          : isFisheye
            ? 1.3
            : 1.0
        : isHighResExport
          ? 1.0
          : useCenter
            ? 0.9
            : Math.min(1.2, magnification);
      const wideCap = Math.min(maxTexSize, isHighResExport ? 2560 : 2048);
      const wideDims = fitTargetSize(safeW, safeH, wideScale, wideCap);

      if (
        wideTarget.width !== wideDims.width ||
        wideTarget.height !== wideDims.height
      ) {
        wideTarget.setSize(wideDims.width, wideDims.height);
      }

      const prevTarget = gl.getRenderTarget();
      gl.getClearColor(_savedClearColor);
      const prevClearAlpha = gl.getClearAlpha();

      if (isDrawingPass) {
        if (!normalTargetRef.current) {
          normalTargetRef.current = createNormalDepthRenderTarget();
        }
        const normalTarget = normalTargetRef.current;
        if (
          normalTarget.width !== wideDims.width ||
          normalTarget.height !== wideDims.height
        ) {
          normalTarget.setSize(wideDims.width, wideDims.height);
        }

        const origVis = new Map<THREE.Object3D, boolean>();
        const controlRoots: THREE.Object3D[] = [];
        const constructiveLineNodes: THREE.Object3D[] = [];
        let floorRoot: THREE.Object3D | null = null;
        const hiddenFloorParts: Array<{ obj: THREE.Object3D; vis: boolean }> = [];

        scene.traverse((obj) => {
          origVis.set(obj, obj.visible);
          if (isInteractiveControlObject(obj)) {
            controlRoots.push(obj);
          }
          if (obj.userData?.isConstructiveLine) {
            constructiveLineNodes.push(obj);
          }
          if (obj.name === 'mortal-mesh-floor') {
            floorRoot = obj;
          }
        });

        const prevSceneBg = scene.background;
        const prevSceneFog = scene.fog;
        const prevOverrideMat = scene.overrideMaterial;
        const prevShadowAuto = gl.shadowMap.autoUpdate;
        const prevAutoClear = gl.autoClear;

        try {
          // Hide interactive handles/gizmos AND constructive guide lines in Pass 1 & 2
          for (const ctrl of controlRoots) {
            ctrl.visible = false;
          }
          for (const node of constructiveLineNodes) {
            node.visible = false;
          }
          // In NPR drawing modes, hide CAD floor grid lines & axes while keeping shadow catcher
          if (floorRoot) {
            const fr = floorRoot as THREE.Object3D;
            if (transparent) {
              hiddenFloorParts.push({ obj: fr, vis: fr.visible });
              fr.visible = false;
            } else {
              for (const child of fr.children) {
                if (child.name !== 'mortal-mesh-floor-shadow') {
                  hiddenFloorParts.push({ obj: child, vis: child.visible });
                  child.visible = false;
                }
              }
            }
          }

          // Pass 1: Color + shadow catcher onto transparent backdrop (no orange guide heuristic)
          scene.background = null;
          scene.fog = null;
          gl.setRenderTarget(wideTarget);
          gl.setClearColor(0x000000, 0);
          gl.clear(true, true, true);
          gl.render(scene, camera);

          // Pass 2: Normal + Depth (hide floor completely as well)
          if (floorRoot) {
            (floorRoot as THREE.Object3D).visible = false;
          }
          scene.overrideMaterial = normalOverrideMat;
          gl.shadowMap.autoUpdate = false;
          gl.setRenderTarget(normalTarget);
          gl.setClearColor(0x8080ff, 0);
          gl.clear(true, true, true);
          gl.render(scene, camera);
          scene.overrideMaterial = prevOverrideMat;

          // Restore floor/lines before Pass 3
          if (floorRoot) {
            (floorRoot as THREE.Object3D).visible =
              origVis.get(floorRoot) ?? true;
          }
          for (const item of hiddenFloorParts) {
            item.obj.visible = item.vis;
          }
          for (const node of constructiveLineNodes) {
            node.visible = origVis.get(node) ?? true;
          }

          // Pass 3: Composite Shader
          const perspCam = camera as THREE.PerspectiveCamera;
          const camNear = perspCam.isPerspectiveCamera ? perspCam.near : 0.1;
          const camFar = perspCam.isPerspectiveCamera ? perspCam.far : 100;
          const u = postScene.mat.uniforms;
          u.tDiffuse.value = wideTarget.texture;
          u.tCenter.value = wideTarget.texture;
          u.tNormal.value = normalTarget.texture;
          u.tDepth.value = normalTarget.depthTexture;
          u.uWideSize.value.set(wideDims.width, wideDims.height);
          u.uCenterSize.value.set(wideDims.width, wideDims.height);
          u.uActive.value = isFisheye ? 1 : 0;
          u.uUseCenter.value = 0;
          u.uCurvature.value = curvatureRef.current;
          u.uAspect.value = safeW / Math.max(1, safeH);
          u.uCenterZoom.value = 1;
          u.uTransparent.value = transparent ? 1 : 0;
          u.uPremultiplyOut.value = 1;
          u.uDrawingStyle.value = drawingStyleInt;
          u.uInkWeight.value = curDrawing.inkWeight;
          u.uHatching.value = curDrawing.drawingHatching ? 1 : 0;
          u.uCameraNear.value = camNear;
          u.uCameraFar.value = camFar;
          u.uPixelRatio.value = Math.max(1, gl.getPixelRatio());

          gl.setRenderTarget(prevTarget);
          if (transparent) {
            gl.setClearColor(0x000000, 0);
            gl.clear(true, true, true);
          }
          gl.render(postScene.scene, postCamera);

          const renderOverlaySubtrees = (roots: readonly THREE.Object3D[]) => {
            if (roots.length === 0) return;
            const visibleSet = new Set<THREE.Object3D>();
            for (const root of roots) {
              if (!(origVis.get(root) ?? false)) continue;
              // Ensure every ancestor up to scene was originally visible (respect hidden mannequins)
              let allAncestorsVisible = true;
              let ancCheck: THREE.Object3D | null = root.parent;
              while (ancCheck && ancCheck !== scene) {
                if (!(origVis.get(ancCheck) ?? false)) {
                  allAncestorsVisible = false;
                  break;
                }
                ancCheck = ancCheck.parent;
              }
              if (!allAncestorsVisible) continue;

              root.traverse((desc) => {
                if (origVis.get(desc)) {
                  visibleSet.add(desc);
                }
              });
              let ancestor: THREE.Object3D | null = root.parent;
              while (ancestor && ancestor !== scene) {
                visibleSet.add(ancestor);
                ancestor = ancestor.parent;
              }
            }
            if (visibleSet.size === 0) return;

            scene.traverse((obj) => {
              if (obj === scene || (obj as THREE.Light).isLight) return;
              if (visibleSet.has(obj)) {
                obj.visible = origVis.get(obj) ?? true;
              } else if (
                (obj as THREE.Mesh).isMesh ||
                (obj as THREE.Line).isLine ||
                (obj as THREE.Points).isPoints
              ) {
                obj.visible = false;
              }
            });

            if (isFisheye) {
              gl.setRenderTarget(wideTarget);
              gl.setClearColor(0x000000, 0);
              gl.clear(true, true, true);
              gl.render(scene, camera);

              const ou = postScene.overlayMat.uniforms;
              ou.tDiffuse.value = wideTarget.texture;
              ou.tCenter.value = wideTarget.texture;
              ou.tNormal.value = normalTarget.texture;
              ou.tDepth.value = normalTarget.depthTexture;
              ou.uWideSize.value.set(wideDims.width, wideDims.height);
              ou.uCenterSize.value.set(wideDims.width, wideDims.height);
              ou.uActive.value = 1;
              ou.uUseCenter.value = 0;
              ou.uCurvature.value = curvatureRef.current;
              ou.uAspect.value = safeW / Math.max(1, safeH);
              ou.uCenterZoom.value = 1;
              ou.uTransparent.value = 1;
              ou.uPremultiplyOut.value = 0;
              ou.uDrawingStyle.value = 0;

              gl.setRenderTarget(prevTarget);
              gl.autoClear = false;
              gl.render(postScene.overlayScene, postCamera);
            } else {
              gl.setRenderTarget(prevTarget);
              gl.autoClear = false;
              gl.clearDepth();
              gl.render(scene, camera);
            }
          };

          // Pass 3.5: Render constructive guides cleanly in both interactive & snapshot views
          renderOverlaySubtrees(constructiveLineNodes);

          // Pass 4: Overlay interactive FK rings, IK reticles & gizmos during interactive view
          if (!transparent) {
            renderOverlaySubtrees(controlRoots);
          }
        } finally {
          scene.overrideMaterial = prevOverrideMat;
          scene.background = prevSceneBg;
          scene.fog = prevSceneFog;
          gl.shadowMap.autoUpdate = prevShadowAuto;
          gl.autoClear = prevAutoClear;
          for (const [obj, vis] of Array.from(origVis.entries())) {
            obj.visible = vis;
          }
          gl.setClearColor(_savedClearColor, prevClearAlpha);
        }
        return;
      }

      // Legacy high-clarity Foveated Fisheye-only path
      gl.setRenderTarget(wideTarget);
      if (transparent) {
        gl.setClearColor(0x000000, 0);
      }
      gl.clear(true, true, true);
      gl.render(scene, camera);

      let activeCenterTarget: THREE.WebGLRenderTarget | null = null;
      let centerDims = wideDims;

      if (useCenter) {
        if (!centerTargetRef.current) {
          centerTargetRef.current = createLensRenderTarget(gl);
        }
        activeCenterTarget = centerTargetRef.current;

        const centerScale = isHighResExport ? 1.0 : 1.15;
        const centerCap = Math.min(
          maxTexSize,
          isHighResExport ? 3072 : gl.getPixelRatio() > 1.5 ? 2048 : 2560
        );
        centerDims = fitTargetSize(safeW, safeH, centerScale, centerCap);
        if (
          activeCenterTarget.width !== centerDims.width ||
          activeCenterTarget.height !== centerDims.height
        ) {
          activeCenterTarget.setSize(centerDims.width, centerDims.height);
        }

        const persp = camera as THREE.PerspectiveCamera;
        const prevZoom = persp.zoom;
        const prevShadowAuto = gl.shadowMap.autoUpdate;
        const prevSceneAutoUpdate = scene.matrixWorldAutoUpdate;

        try {
          gl.shadowMap.autoUpdate = false;
          scene.matrixWorldAutoUpdate = false;
          persp.zoom = prevZoom * centerZoom;
          persp.updateProjectionMatrix();

          gl.setRenderTarget(activeCenterTarget);
          if (transparent) {
            gl.setClearColor(0x000000, 0);
          }
          gl.clear(true, true, true);
          gl.render(scene, camera);
        } finally {
          persp.zoom = prevZoom;
          persp.updateProjectionMatrix();
          gl.shadowMap.autoUpdate = prevShadowAuto;
          scene.matrixWorldAutoUpdate = prevSceneAutoUpdate;
        }
      }

      const uniforms = postScene.mat.uniforms;
      uniforms.tDiffuse.value = wideTarget.texture;
      uniforms.tCenter.value = activeCenterTarget
        ? activeCenterTarget.texture
        : wideTarget.texture;
      uniforms.uWideSize.value.set(wideDims.width, wideDims.height);
      uniforms.uCenterSize.value.set(centerDims.width, centerDims.height);
      uniforms.uActive.value = isFisheye ? 1 : 0;
      uniforms.uUseCenter.value = activeCenterTarget ? 1 : 0;
      uniforms.uCurvature.value = curvatureRef.current;
      uniforms.uAspect.value = safeW / Math.max(1, safeH);
      uniforms.uCenterZoom.value = centerZoom;
      uniforms.uTransparent.value = transparent ? 1 : 0;
      uniforms.uPremultiplyOut.value = 1;
      uniforms.uDrawingStyle.value = 0;

      gl.setRenderTarget(prevTarget);
      if (transparent) {
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
      }
      gl.render(postScene.scene, postCamera);

      gl.setClearColor(_savedClearColor, prevClearAlpha);
    },
    [gl, scene, camera, wideTarget, normalOverrideMat, postScene, postCamera]
  );

  useEffect(() => {
    renderHookRef.current = renderCurvilinearFrame;
    return () => {
      renderHookRef.current = null;
    };
  }, [renderHookRef, renderCurvilinearFrame]);

  useEffect(() => {
    setEvents({
      compute: (event, state) => {
        const rawX = (event.offsetX / state.size.width) * 2 - 1;
        const rawY = -(event.offsetY / state.size.height) * 2 + 1;
        const aspect = state.size.width / Math.max(1, state.size.height);
        const mapped = screenNdcToSourceNdc(
          rawX,
          rawY,
          presetRef.current,
          curvatureRef.current,
          aspect
        );
        state.pointer.set(mapped.x, mapped.y);
        state.raycaster.setFromCamera(state.pointer, state.camera);
      },
    });

    return () => {
      setEvents({
        compute: (event, state) => {
          state.pointer.set(
            (event.offsetX / state.size.width) * 2 - 1,
            -(event.offsetY / state.size.height) * 2 + 1
          );
          state.raycaster.setFromCamera(state.pointer, state.camera);
        },
      });
    };
  }, [setEvents]);

  useEffect(() => {
    invalidate();
  }, [
    preset,
    curvature,
    drawing.drawingStyle,
    drawing.constructiveMode,
    drawing.inkWeight,
    drawing.drawingHatching,
    drawing.showCrossContours,
    drawing.showLineOfAction,
    drawing.showPlumbLine,
    drawing.showLandmarks,
    studioTheme,
    size.width,
    size.height,
    invalidate,
  ]);

  useFrame(() => {
    const pr = gl.getPixelRatio();
    const w = Math.max(2, Math.round(size.width * pr));
    const h = Math.max(2, Math.round(size.height * pr));
    renderCurvilinearFrame(w, h, false);
  }, 1);

  return null;
}
