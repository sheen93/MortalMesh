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
uniform int uActive;
uniform float uCurvature;
uniform float uAspect;
uniform float uTransparent;
varying vec2 vUv;

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

  vec2 sampleUv = srcNdc * 0.5 + 0.5;
  vec4 texel = texture2D(tDiffuse, sampleUv);

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

/**
 * Exaggerated hemispherical Fisheye dome post-process pass. Intercepts R3F
 * pointer raycasting so joint/prop picking and gizmo dragging stay locked
 * pixel-for-pixel onto the distorted dome output.
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
        uActive: { value: 1 },
        uCurvature: { value: curvatureRef.current },
        uAspect: { value: 1 },
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

  const renderTarget = useMemo(() => {
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
  }, [gl]);

  useEffect(() => {
    return () => {
      renderTarget.dispose();
      postScene.geom.dispose();
      postScene.mat.dispose();
    };
  }, [renderTarget, postScene]);

  const renderCurvilinearFrame = useCallback(
    (targetWidth: number, targetHeight: number, transparent: boolean) => {
      const safeW = Math.max(2, Math.round(targetWidth));
      const safeH = Math.max(2, Math.round(targetHeight));

      if (renderTarget.width !== safeW || renderTarget.height !== safeH) {
        renderTarget.setSize(safeW, safeH);
      }

      const prevTarget = gl.getRenderTarget();
      gl.getClearColor(_savedClearColor);
      const prevClearAlpha = gl.getClearAlpha();

      gl.setRenderTarget(renderTarget);
      if (transparent) {
        gl.setClearColor(0x000000, 0);
      }
      gl.clear(true, true, true);
      gl.render(scene, camera);

      const uniforms = postScene.mat.uniforms;
      uniforms.tDiffuse.value = renderTarget.texture;
      uniforms.uActive.value = presetRef.current === 'fisheye' ? 1 : 0;
      uniforms.uCurvature.value = curvatureRef.current;
      uniforms.uAspect.value = safeW / Math.max(1, safeH);
      uniforms.uTransparent.value = transparent ? 1 : 0;

      gl.setRenderTarget(prevTarget);
      if (transparent) {
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
      }
      gl.render(postScene.scene, postCamera);

      gl.setClearColor(_savedClearColor, prevClearAlpha);
    },
    [gl, scene, camera, renderTarget, postScene, postCamera]
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
