import * as THREE from 'three';
import type { RigAdapter } from '@/rig/rigAdapter';
import type {
  CameraPreset,
  FigureProportions,
  StudioThemeId,
  SvgExportOptions,
  SvgExportResult,
} from '@/types/anatomy';
import type { DrawingStyleId } from '@/types/drawing';
import type { StudioProp } from '@/types/props';
import {
  computeConstructiveFigureData,
  type CrossContourRingData,
  type TaperedPrismData,
} from '@/utils/constructiveGeometry';
import { projectWorldPointToScreen } from '@/utils/lensWarp';
import { formatPoseTimestamp } from '@/utils/poseSerialization';

interface MortalMeshFigureUserData {
  mannequinId: string;
  rigAdapter: RigAdapter;
  skinnedMeshes: THREE.SkinnedMesh[];
  baseHeadHeight: number;
  proportions: FigureProportions;
}

interface WeldEdge {
  wA: number;
  wB: number;
  tA: number;
  tB: number;
}

interface WeldTopology {
  weldCount: number;
  repVertex: Int32Array;
  triCount: number;
  triWelds: Int32Array; // 3 * triCount
  edges: WeldEdge[];
}

const WELD_TOPOLOGY_CACHE = new WeakMap<THREE.BufferGeometry, WeldTopology>();

function buildWeldTopology(geometry: THREE.BufferGeometry): WeldTopology | null {
  const cached = WELD_TOPOLOGY_CACHE.get(geometry);
  if (cached) return cached;

  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count < 3) return null;

  const indexAttr = geometry.getIndex();
  const vertCount = posAttr.count;
  const vertToWeld = new Int32Array(vertCount);
  const weldMap = new Map<string, number>();
  const repList: number[] = [];

  for (let i = 0; i < vertCount; i += 1) {
    const qx = Math.round(posAttr.getX(i) * 4000);
    const qy = Math.round(posAttr.getY(i) * 4000);
    const qz = Math.round(posAttr.getZ(i) * 4000);
    const key = `${qx},${qy},${qz}`;
    let wid = weldMap.get(key);
    if (wid === undefined) {
      wid = repList.length;
      weldMap.set(key, wid);
      repList.push(i);
    }
    vertToWeld[i] = wid;
  }

  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(vertCount / 3);
  const triWelds = new Int32Array(triCount * 3);
  const edgeMap = new Map<string, WeldEdge>();
  const edges: WeldEdge[] = [];

  const registerEdge = (wa: number, wb: number, t: number) => {
    if (wa === wb) return;
    const minW = wa < wb ? wa : wb;
    const maxW = wa < wb ? wb : wa;
    const key = `${minW}:${maxW}`;
    const existing = edgeMap.get(key);
    if (!existing) {
      const edge: WeldEdge = { wA: minW, wB: maxW, tA: t, tB: -1 };
      edgeMap.set(key, edge);
      edges.push(edge);
    } else if (existing.tB === -1) {
      existing.tB = t;
    }
  };

  for (let t = 0; t < triCount; t += 1) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    const w0 = vertToWeld[i0];
    const w1 = vertToWeld[i1];
    const w2 = vertToWeld[i2];
    triWelds[t * 3] = w0;
    triWelds[t * 3 + 1] = w1;
    triWelds[t * 3 + 2] = w2;
    registerEdge(w0, w1, t);
    registerEdge(w1, w2, t);
    registerEdge(w2, w0, t);
  }

  const topo: WeldTopology = {
    weldCount: repList.length,
    repVertex: Int32Array.from(repList),
    triCount,
    triWelds,
    edges,
  };
  WELD_TOPOLOGY_CACHE.set(geometry, topo);
  return topo;
}

interface Pt2 {
  x: number;
  y: number;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function polylineToSvgPath(pts: readonly Pt2[], closed = false): string {
  if (pts.length < 2) return '';
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length; i += 1) {
    d += `L${fmt(pts[i].x)},${fmt(pts[i].y)}`;
  }
  if (closed) d += 'Z';
  return d;
}

function perpDistSq(p: Pt2, a: Pt2, b: Pt2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
}

function rdpSimplify(pts: readonly Pt2[], eps: number): Pt2[] {
  if (pts.length <= 2) return [...pts];
  const epsSq = eps * eps;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpDistSq(pts[i], pts[start], pts[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > epsSq) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const out: Pt2[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (keep[i]) out.push(pts[i]);
  }
  return out;
}

function chainSegments(
  segments: ReadonlyArray<[Pt2, Pt2]>,
  simplifyEps = 0.85
): string[] {
  if (segments.length === 0) return [];
  const adj = new Map<string, number[]>();
  const used = new Uint8Array(segments.length);
  const keyOf = (p: Pt2) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;

  for (let i = 0; i < segments.length; i += 1) {
    const k0 = keyOf(segments[i][0]);
    const k1 = keyOf(segments[i][1]);
    let a0 = adj.get(k0);
    if (!a0) {
      a0 = [];
      adj.set(k0, a0);
    }
    a0.push(i);
    let a1 = adj.get(k1);
    if (!a1) {
      a1 = [];
      adj.set(k1, a1);
    }
    a1.push(i);
  }

  const paths: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    const chain: Pt2[] = [segments[i][0], segments[i][1]];

    // Extend forward
    let keepExtending = true;
    while (keepExtending) {
      keepExtending = false;
      const tail = chain[chain.length - 1];
      const candidates = adj.get(keyOf(tail));
      if (!candidates) break;
      for (const edgeIdx of candidates) {
        if (used[edgeIdx]) continue;
        used[edgeIdx] = 1;
        const [a, b] = segments[edgeIdx];
        const da = (a.x - tail.x) ** 2 + (a.y - tail.y) ** 2;
        const db = (b.x - tail.x) ** 2 + (b.y - tail.y) ** 2;
        chain.push(da <= db ? b : a);
        keepExtending = true;
        break;
      }
    }

    // Extend backward
    keepExtending = true;
    while (keepExtending) {
      keepExtending = false;
      const head = chain[0];
      const candidates = adj.get(keyOf(head));
      if (!candidates) break;
      for (const edgeIdx of candidates) {
        if (used[edgeIdx]) continue;
        used[edgeIdx] = 1;
        const [a, b] = segments[edgeIdx];
        const da = (a.x - head.x) ** 2 + (a.y - head.y) ** 2;
        const db = (b.x - head.x) ** 2 + (b.y - head.y) ** 2;
        chain.unshift(da <= db ? b : a);
        keepExtending = true;
        break;
      }
    }

    const simplified = rdpSimplify(chain, simplifyEps);
    const d = polylineToSvgPath(simplified, false);
    if (d) paths.push(d);
  }

  return paths;
}

const _tmpV = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _nVec = new THREE.Vector3();
const _cent = new THREE.Vector3();
const _toCam = new THREE.Vector3();

function extractMeshSilhouetteSegments(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  camPos: THREE.Vector3,
  width: number,
  height: number,
  preset: CameraPreset,
  curvature: number
): { segments: Array<[Pt2, Pt2]>; edgeBudgetExceeded: boolean } {
  const geom = mesh.geometry;
  const topo = buildWeldTopology(geom);
  if (!topo) return { segments: [], edgeBudgetExceeded: false };

  mesh.updateMatrixWorld(true);
  const skinned = mesh as THREE.SkinnedMesh;
  const isSkinned = Boolean(skinned.isSkinnedMesh && skinned.skeleton);
  if (isSkinned) {
    skinned.skeleton.update();
  }

  const posAttr = geom.getAttribute('position');
  const deformedWorld = new Float32Array(topo.weldCount * 3);
  const projectedX = new Float32Array(topo.weldCount);
  const projectedY = new Float32Array(topo.weldCount);
  const projectedOk = new Uint8Array(topo.weldCount);

  for (let w = 0; w < topo.weldCount; w += 1) {
    const vIdx = topo.repVertex[w];
    if (isSkinned) {
      skinned.getVertexPosition(vIdx, _tmpV);
    } else {
      _tmpV.fromBufferAttribute(posAttr, vIdx);
    }
    _tmpV.applyMatrix4(mesh.matrixWorld);
    deformedWorld[w * 3] = _tmpV.x;
    deformedWorld[w * 3 + 1] = _tmpV.y;
    deformedWorld[w * 3 + 2] = _tmpV.z;

    const p = projectWorldPointToScreen(
      _tmpV,
      camera,
      width,
      height,
      preset,
      curvature
    );
    if (
      p.visible &&
      Number.isFinite(p.screenX) &&
      Number.isFinite(p.screenY) &&
      p.screenX >= -width &&
      p.screenX <= width * 2 &&
      p.screenY >= -height &&
      p.screenY <= height * 2
    ) {
      projectedX[w] = p.screenX;
      projectedY[w] = p.screenY;
      projectedOk[w] = 1;
    }
  }

  const triFront = new Uint8Array(topo.triCount);
  const triNx = new Float32Array(topo.triCount);
  const triNy = new Float32Array(topo.triCount);
  const triNz = new Float32Array(topo.triCount);

  for (let t = 0; t < topo.triCount; t += 1) {
    const w0 = topo.triWelds[t * 3] * 3;
    const w1 = topo.triWelds[t * 3 + 1] * 3;
    const w2 = topo.triWelds[t * 3 + 2] * 3;

    _e1.set(
      deformedWorld[w1] - deformedWorld[w0],
      deformedWorld[w1 + 1] - deformedWorld[w0 + 1],
      deformedWorld[w1 + 2] - deformedWorld[w0 + 2]
    );
    _e2.set(
      deformedWorld[w2] - deformedWorld[w0],
      deformedWorld[w2 + 1] - deformedWorld[w0 + 1],
      deformedWorld[w2 + 2] - deformedWorld[w0 + 2]
    );
    _nVec.crossVectors(_e1, _e2);
    const len = _nVec.length();
    if (len < 1e-10) continue;
    _nVec.divideScalar(len);
    triNx[t] = _nVec.x;
    triNy[t] = _nVec.y;
    triNz[t] = _nVec.z;

    _cent.set(
      (deformedWorld[w0] + deformedWorld[w1] + deformedWorld[w2]) / 3,
      (deformedWorld[w0 + 1] + deformedWorld[w1 + 1] + deformedWorld[w2 + 1]) /
        3,
      (deformedWorld[w0 + 2] + deformedWorld[w1 + 2] + deformedWorld[w2 + 2]) / 3
    );
    _toCam.subVectors(camPos, _cent);
    triFront[t] = _nVec.dot(_toCam) > 0 ? 1 : 0;
  }

  const segments: Array<[Pt2, Pt2]> = [];
  const creaseCos = Math.cos((46 * Math.PI) / 180);
  const minSegLenSq = 1.8 * 1.8;

  for (const edge of topo.edges) {
    if (!projectedOk[edge.wA] || !projectedOk[edge.wB]) continue;
    const fA = triFront[edge.tA];
    const hasB = edge.tB !== -1;
    const fB = hasB ? triFront[edge.tB] : 0;

    let include = false;
    if (!hasB) {
      include = fA === 1;
    } else if (fA !== fB) {
      include = true;
    } else if (fA === 1) {
      const dotN =
        triNx[edge.tA] * triNx[edge.tB] +
        triNy[edge.tA] * triNy[edge.tB] +
        triNz[edge.tA] * triNz[edge.tB];
      if (dotN < creaseCos) {
        include = true;
      }
    }

    if (!include) continue;

    const ax = projectedX[edge.wA];
    const ay = projectedY[edge.wA];
    const bx = projectedX[edge.wB];
    const by = projectedY[edge.wB];
    const distSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    if (distSq < minSegLenSq) continue;

    segments.push([
      { x: ax, y: ay },
      { x: bx, y: by },
    ]);
  }

  return {
    segments,
    edgeBudgetExceeded: segments.length > 4200,
  };
}

function getPaperColorForStyle(
  drawingStyle: DrawingStyleId,
  studioTheme: StudioThemeId
): string {
  switch (drawingStyle) {
    case 'blue-pencil':
      return '#F5F2EB';
    case 'planar':
      return '#ECE8DF';
    case 'comic-ink':
      return '#FFFFFF';
    case 'skeleton-sheet':
      return '#EFECE3';
    default:
      return studioTheme === 'dark'
        ? '#141619'
        : studioTheme === 'light'
          ? '#F2F3F5'
          : '#F6F4EF';
  }
}

export interface GenerateBlueprintSvgParams {
  scene: THREE.Scene;
  camera: THREE.Camera;
  viewportWidth: number;
  viewportHeight: number;
  perspectiveMode: CameraPreset;
  lensCurvature: number;
  drawingStyle: DrawingStyleId;
  studioTheme: StudioThemeId;
  showLandmarks: boolean;
  transparent: boolean;
}

export function generateLayeredBlueprintSVG({
  scene,
  camera,
  viewportWidth,
  viewportHeight,
  perspectiveMode,
  lensCurvature,
  drawingStyle,
  studioTheme,
  transparent,
}: GenerateBlueprintSvgParams): {
  svgText: string;
  layerCounts: Record<string, number>;
} {
  const W = Math.max(320, Math.round(viewportWidth));
  const H = Math.max(240, Math.round(viewportHeight));

  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const camPos = camera.getWorldPosition(new THREE.Vector3());

  const project = (worldPt: THREE.Vector3): Pt2 | null => {
    const p = projectWorldPointToScreen(
      worldPt,
      camera,
      W,
      H,
      perspectiveMode,
      lensCurvature
    );
    if (
      !p.visible ||
      !Number.isFinite(p.screenX) ||
      !Number.isFinite(p.screenY)
    ) {
      return null;
    }
    return { x: p.screenX, y: p.screenY };
  };

  const projectSegment = (a: THREE.Vector3, b: THREE.Vector3): string => {
    const steps = perspectiveMode === 'fisheye' ? 6 : 1;
    const pts: Pt2[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const p = project(
        s === 0 ? a : s === steps ? b : a.clone().lerp(b, s / steps)
      );
      if (p) pts.push(p);
    }
    return polylineToSvgPath(pts);
  };

  const figureEntries: Array<{
    rootGroup: THREE.Group;
    meta: MortalMeshFigureUserData;
  }> = [];
  const propEntries: Array<{
    group: THREE.Group;
    prop: StudioProp;
  }> = [];

  scene.traverse((obj) => {
    if (!obj.visible) return;
    if (obj.userData?.mortalMeshFigure) {
      figureEntries.push({
        rootGroup: obj as THREE.Group,
        meta: obj.userData.mortalMeshFigure as MortalMeshFigureUserData,
      });
    } else if (obj.userData?.mortalMeshProp) {
      propEntries.push({
        group: obj as THREE.Group,
        prop: obj.userData.mortalMeshProp as StudioProp,
      });
    }
  });

  const loaPaths: string[] = [];
  const plumbPaths: string[] = [];
  const landmarkElements: string[] = [];
  const constructionFrontPaths: string[] = [];
  const constructionBackPaths: string[] = [];
  const constructionCircles: string[] = [];
  const crossFrontPaths: string[] = [];
  const crossBackPaths: string[] = [];
  const silhouettePaths: string[] = [];

  const appendPrismProjected = (prism: TaperedPrismData) => {
    const faceFront = prism.faces.map((face) => {
      const a = prism.corners[face[0]];
      const b = prism.corners[face[1]];
      const c = prism.corners[face[2]];
      const n = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a)
        )
        .normalize();
      const fc = a.clone().add(c).multiplyScalar(0.5);
      return n.dot(camPos.clone().sub(fc)) > 0;
    });

    const edgeFaces = new Map<string, number[]>();
    prism.faces.forEach((face, fi) => {
      for (let i = 0; i < 4; i += 1) {
        const u = face[i];
        const v = face[(i + 1) % 4];
        const k = u < v ? `${u}:${v}` : `${v}:${u}`;
        const list = edgeFaces.get(k);
        if (list) list.push(fi);
        else edgeFaces.set(k, [fi]);
      }
    });

    for (const [i0, i1] of prism.edges) {
      const k = i0 < i1 ? `${i0}:${i1}` : `${i1}:${i0}`;
      const faces = edgeFaces.get(k) ?? [];
      const isFront = faces.some((fi) => faceFront[fi]);
      const d = projectSegment(prism.corners[i0], prism.corners[i1]);
      if (!d) continue;
      if (isFront) constructionFrontPaths.push(d);
      else constructionBackPaths.push(d);
    }

    if (faceFront[0]) {
      const d = projectSegment(prism.frontCenterLine[0], prism.frontCenterLine[1]);
      if (d) constructionFrontPaths.push(d);
    }
  };

  const appendRingProjected = (
    ring: CrossContourRingData,
    targetFront: string[],
    targetBack: string[],
    frontCheckOrigin: THREE.Vector3
  ) => {
    const pts = ring.points;
    const n = pts.length;
    let curFront: Pt2[] = [];
    let curBack: Pt2[] = [];

    const flushFront = () => {
      if (curFront.length >= 2) targetFront.push(polylineToSvgPath(curFront));
      curFront = [];
    };
    const flushBack = () => {
      if (curBack.length >= 2) targetBack.push(polylineToSvgPath(curBack));
      curBack = [];
    };

    for (let i = 0; i <= n; i += 1) {
      const wPt = pts[i % n];
      const sp = project(wPt);
      if (!sp) {
        flushFront();
        flushBack();
        continue;
      }
      const outward = wPt.clone().sub(frontCheckOrigin);
      const isFront = outward.dot(camPos.clone().sub(wPt)) >= 0;
      if (isFront) {
        flushBack();
        curFront.push(sp);
      } else {
        flushFront();
        curBack.push(sp);
      }
    }
    flushFront();
    flushBack();
  };

  for (const fig of figureEntries) {
    const data = computeConstructiveFigureData({
      mannequinId: fig.meta.mannequinId,
      rigAdapter: fig.meta.rigAdapter,
      baseHeadHeight: fig.meta.baseHeadHeight,
      proportions: fig.meta.proportions,
      groundY: 0,
    });

    // 1. Line of Action
    const loa2d = data.lineOfAction
      .map((p) => project(p))
      .filter((p): p is Pt2 => p !== null);
    if (loa2d.length >= 2) {
      const d = polylineToSvgPath(rdpSimplify(loa2d, 0.7));
      if (d) loaPaths.push(d);
    }

    // 2. Plumb Line & Landmarks
    const plumbD = projectSegment(data.plumbLine[0], data.plumbLine[1]);
    const pBot = project(data.plumbLine[1]);
    if (plumbD && pBot) {
      plumbPaths.push(plumbD);
      const rCross = 7;
      plumbPaths.push(
        `M${fmt(pBot.x - rCross)},${fmt(pBot.y)}L${fmt(pBot.x + rCross)},${fmt(pBot.y)}`
      );
      plumbPaths.push(
        `M${fmt(pBot.x)},${fmt(pBot.y - 4)}L${fmt(pBot.x)},${fmt(pBot.y + 4)}`
      );
    }

    for (const lm of data.landmarks) {
      const sp = project(lm.position);
      if (!sp) continue;
      landmarkElements.push(
        `<circle cx="${fmt(sp.x)}" cy="${fmt(sp.y)}" r="2.6" fill="#2E73B8" stroke="#FFFFFF" stroke-width="0.8" data-landmark="${escapeXml(lm.id)}" />`
      );
    }

    // 3. Construction Volumes (Loomis Head, Bridgman Torso, Limb Tangent Rails, Extremities, Pivots)
    const headCenter2 = project(data.loomisHead.craniumCenter);
    const headEdgePoint = data.loomisHead.craniumCenter
      .clone()
      .addScaledVector(
        new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        data.loomisHead.craniumRadius
      );
    const headEdge2 = project(headEdgePoint);
    if (headCenter2 && headEdge2) {
      const rPx = Math.max(
        6,
        Math.hypot(headEdge2.x - headCenter2.x, headEdge2.y - headCenter2.y)
      );
      constructionCircles.push(
        `<circle cx="${fmt(headCenter2.x)}" cy="${fmt(headCenter2.y)}" r="${fmt(rPx)}" fill="none" />`
      );
    }

    appendRingProjected(
      data.loomisHead.browRing,
      constructionFrontPaths,
      constructionBackPaths,
      data.loomisHead.craniumCenter
    );
    appendRingProjected(
      data.loomisHead.meridianRing,
      constructionFrontPaths,
      constructionBackPaths,
      data.loomisHead.craniumCenter
    );
    appendRingProjected(
      data.loomisHead.sideRingL,
      constructionFrontPaths,
      constructionBackPaths,
      data.loomisHead.craniumCenter
    );
    appendRingProjected(
      data.loomisHead.sideRingR,
      constructionFrontPaths,
      constructionBackPaths,
      data.loomisHead.craniumCenter
    );

    appendPrismProjected(data.loomisHead.jawWedge);
    appendPrismProjected(data.ribcage);
    appendPrismProjected(data.pelvisMass);
    for (const ext of data.extremities) {
      appendPrismProjected(ext);
    }

    const shD = projectSegment(data.shoulderTiltBar[0], data.shoulderTiltBar[1]);
    if (shD) constructionFrontPaths.push(shD);

    const hipD = projectSegment(data.hipTiltBar[0], data.hipTiltBar[1]);
    if (hipD) constructionFrontPaths.push(hipD);

    for (const limb of data.limbs) {
      const limbAxis = limb.end.clone().sub(limb.start).normalize();
      const viewDir = camPos.clone().sub(limb.midPoint).normalize();
      const lat = new THREE.Vector3().crossVectors(viewDir, limbAxis);
      if (lat.lengthSq() < 1e-6) {
        lat.set(1, 0, 0);
      } else {
        lat.normalize();
      }
      const dL = projectSegment(
        limb.start.clone().addScaledVector(lat, limb.radiusStart),
        limb.end.clone().addScaledVector(lat, limb.radiusEnd)
      );
      const dR = projectSegment(
        limb.start.clone().addScaledVector(lat, -limb.radiusStart),
        limb.end.clone().addScaledVector(lat, -limb.radiusEnd)
      );
      if (dL) constructionFrontPaths.push(dL);
      if (dR) constructionFrontPaths.push(dR);

      // 4. Cross-Contours along limbs
      for (const ring of limb.crossContours) {
        appendRingProjected(ring, crossFrontPaths, crossBackPaths, ring.center);
      }
    }

    for (const ball of data.jointBalls) {
      const c2 = project(ball.center);
      const edge2 = project(
        ball.center
          .clone()
          .addScaledVector(
            new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
            ball.radius
          )
      );
      if (c2 && edge2) {
        const rPx = Math.max(2.5, Math.hypot(edge2.x - c2.x, edge2.y - c2.y));
        constructionCircles.push(
          `<circle cx="${fmt(c2.x)}" cy="${fmt(c2.y)}" r="${fmt(rPx)}" fill="none" />`
        );
      }
    }

    // 5. Anatomical Silhouette & Crease Contours from posed SkinnedMeshes
    const allSegs: Array<[Pt2, Pt2]> = [];
    let largeBudget = false;
    for (const sm of fig.meta.skinnedMeshes) {
      const res = extractMeshSilhouetteSegments(
        sm,
        camera,
        camPos,
        W,
        H,
        perspectiveMode,
        lensCurvature
      );
      for (const seg of res.segments) {
        allSegs.push(seg);
      }
      if (res.edgeBudgetExceeded) largeBudget = true;
    }
    const chained = chainSegments(allSegs, largeBudget ? 1.35 : 0.85);
    silhouettePaths.push(...chained);
  }

  // Project visible Studio Props wireframes into construction-volumes
  for (const propEntry of propEntries) {
    propEntry.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(propEntry.group);
    if (box.isEmpty()) continue;
    const { min, max } = box;
    const c = [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, max.z),
      new THREE.Vector3(min.x, max.y, max.z),
    ];
    const edges: ReadonlyArray<readonly [number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, b] of edges) {
      const pa = project(c[a]);
      const pb = project(c[b]);
      if (pa && pb) constructionFrontPaths.push(polylineToSvgPath([pa, pb]));
    }
  }

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  ];

  if (!transparent) {
    const paperHex = getPaperColorForStyle(drawingStyle, studioTheme);
    lines.push(
      `  <g id="paper-backdrop" inkscape:groupmode="layer" inkscape:label="Paper Backdrop">`,
      `    <rect x="0" y="0" width="${W}" height="${H}" fill="${paperHex}" />`,
      `  </g>`
    );
  }

  const silColor =
    drawingStyle === 'blue-pencil' ? '#1C2B3A' : '#101216';
  const conColor = '#2E73B8';

  lines.push(
    `  <g id="silhouette-contours" inkscape:groupmode="layer" inkscape:label="Silhouette Contours" fill="none" stroke="${silColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`
  );
  for (const d of silhouettePaths) {
    lines.push(`    <path d="${d}" />`);
  }
  lines.push(`  </g>`);

  lines.push(
    `  <g id="construction-volumes" inkscape:groupmode="layer" inkscape:label="Construction Volumes" fill="none" stroke="${conColor}" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round">`
  );
  for (const cTag of constructionCircles) {
    lines.push(`    ${cTag}`);
  }
  for (const d of constructionFrontPaths) {
    lines.push(`    <path d="${d}" />`);
  }
  for (const d of constructionBackPaths) {
    lines.push(`    <path d="${d}" stroke-dasharray="4 3" opacity="0.32" />`);
  }
  lines.push(`  </g>`);

  lines.push(
    `  <g id="cross-contours" inkscape:groupmode="layer" inkscape:label="Cross-Contours" fill="none" stroke="#1D4ED8" stroke-width="0.95" stroke-linecap="round" stroke-linejoin="round">`
  );
  for (const d of crossFrontPaths) {
    lines.push(`    <path d="${d}" />`);
  }
  for (const d of crossBackPaths) {
    lines.push(`    <path d="${d}" stroke-dasharray="3 3" opacity="0.30" />`);
  }
  lines.push(`  </g>`);

  lines.push(
    `  <g id="line-of-action" inkscape:groupmode="layer" inkscape:label="Line of Action" fill="none" stroke="#E05246" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">`
  );
  for (const d of loaPaths) {
    lines.push(`    <path d="${d}" />`);
  }
  lines.push(`  </g>`);

  lines.push(
    `  <g id="plumb-and-landmarks" inkscape:groupmode="layer" inkscape:label="Plumb Line &amp; Landmarks">`
  );
  for (const d of plumbPaths) {
    lines.push(
      `    <path d="${d}" fill="none" stroke="#2A9672" stroke-width="1.25" stroke-dasharray="5 4" stroke-linecap="round" />`
    );
  }
  for (const el of landmarkElements) {
    lines.push(`    ${el}`);
  }
  lines.push(`  </g>`);

  lines.push(`</svg>`);

  return {
    svgText: lines.join('\n'),
    layerCounts: {
      'silhouette-contours': silhouettePaths.length,
      'construction-volumes':
        constructionCircles.length +
        constructionFrontPaths.length +
        constructionBackPaths.length,
      'cross-contours': crossFrontPaths.length + crossBackPaths.length,
      'line-of-action': loaPaths.length,
      'plumb-and-landmarks': plumbPaths.length + landmarkElements.length,
    },
  };
}

export function exportLayeredBlueprintSVG(
  params: GenerateBlueprintSvgParams,
  options: SvgExportOptions
): SvgExportResult {
  const { svgText, layerCounts } = generateLayeredBlueprintSVG({
    ...params,
    transparent: options.transparent,
  });

  const filename = `mortal-mesh-blueprint-${formatPoseTimestamp()}.svg`;
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return {
    filename,
    byteLength: blob.size,
    layerCounts,
  };
}
