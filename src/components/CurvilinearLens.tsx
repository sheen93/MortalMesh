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
import type { CameraPreset } from '@/types/anatomy';
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
  renderHookRef: MutableRefObject<CurvilinearRenderHook | null>;
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
uniform vec2 uWideSize;
uniform vec2 uCenterSize;
uniform int uActive;
uniform int uUseCenter;
uniform float uCurvature;
uniform float uAspect;
uniform float uCenterZoom;
uniform float uTransparent;
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
    gl_FragColor.rgb *= gl_FragColor.a;
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
 * High-clarity foveated dual-pass Fisheye dome post-process pass.
 * Renders a zoomed foveal center buffer alongside the wide pass (skipping
 * redundant shadow-map/matrix updates), then composites with 5-tap Catmull-Rom
 * sharpness and outer 4-tap RGSS antialiasing while preserving frameloop="demand".
 */
export function CurvilinearLens({
  preset,
  curvature,
  renderHookRef,
}: CurvilinearLensProps) {
  const { gl, scene, camera, size, setEvents, invalidate } = useThree();

  const presetRef = useRef<CameraPreset>(preset);
  const curvatureRef = useRef<number>(clampLensCurvature(curvature));
  presetRef.current = preset;
  curvatureRef.current = clampLensCurvature(curvature);

  const postScene = useMemo(() => {
    const s = new THREE.Scene();
    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tCenter: { value: null },
        uWideSize: { value: new THREE.Vector2(1, 1) },
        uCenterSize: { value: new THREE.Vector2(1, 1) },
        uActive: { value: 1 },
        uUseCenter: { value: 0 },
        uCurvature: { value: curvatureRef.current },
        uAspect: { value: 1 },
        uCenterZoom: { value: 1 },
        uTransparent: { value: 0 },
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
    return { scene: s, geom, mat };
  }, []);

  const postCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  );

  const wideTarget = useMemo(() => createLensRenderTarget(gl), [gl]);
  const centerTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  useEffect(() => {
    return () => {
      wideTarget.dispose();
      if (centerTargetRef.current) {
        centerTargetRef.current.dispose();
        centerTargetRef.current = null;
      }
      postScene.geom.dispose();
      postScene.mat.dispose();
    };
  }, [wideTarget, postScene]);

  const renderCurvilinearFrame = useCallback(
    (targetWidth: number, targetHeight: number, transparent: boolean) => {
      const safeW = Math.max(2, Math.round(targetWidth));
      const safeH = Math.max(2, Math.round(targetHeight));
      const maxTexSize = gl.capabilities.maxTextureSize || 2048;

      const { phi } = getFisheyeOptics(curvatureRef.current);
      const magnification = Math.tan(phi) / phi;
      const isFisheye = presetRef.current === 'fisheye';
      const isPersp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
      const useCenter = isFisheye && isPersp && magnification > 1.22;
      const centerZoom = useCenter ? Math.min(3.15, magnification) : 1.0;

      const isHighResExport = safeW > 2200 || safeH > 2200;
      const wideScale = isHighResExport
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

      gl.setRenderTarget(prevTarget);
      if (transparent) {
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
      }
      gl.render(postScene.scene, postCamera);

      gl.setClearColor(_savedClearColor, prevClearAlpha);
    },
    [gl, scene, camera, wideTarget, postScene, postCamera]
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
  }, [preset, curvature, size.width, size.height, invalidate]);

  useFrame(() => {
    const pr = gl.getPixelRatio();
    const w = Math.max(2, Math.round(size.width * pr));
    const h = Math.max(2, Math.round(size.height * pr));
    renderCurvilinearFrame(w, h, false);
  }, 1);

  return null;
}
