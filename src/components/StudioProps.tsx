'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
} from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  createNotanGradientTexture,
  getNotanThemePalette,
  updateNotanGradientTexture,
} from '@/utils/notanGradient';
import type {
  CameraPreset,
  ContextualAnchor,
  StudioThemeId,
} from '@/types/anatomy';
import type {
  PropDropCommand,
  PropTransformMode,
  StudioProp,
  StudioPropType,
} from '@/types/props';
import {
  attachCurvilinearPointerWarp,
  projectWorldPointToScreen,
} from '@/utils/lensWarp';

interface DragGuardState {
  isDragging: boolean;
  lastDragEndTime: number;
}

interface DraggingChangedDispatcher {
  addEventListener: (
    type: 'dragging-changed',
    listener: (event: { value: boolean }) => void
  ) => void;
  removeEventListener: (
    type: 'dragging-changed',
    listener: (event: { value: boolean }) => void
  ) => void;
}

interface StudioPropsStageProps {
  propsList: readonly StudioProp[];
  selectedPropId: string | null;
  propTransformMode: PropTransformMode;
  studioTheme: StudioThemeId;
  groundEnabled: boolean;
  notanEnabled: boolean;
  notanSplit: number;
  dropPropToFloorCommand: PropDropCommand | null;
  dragGuardRef: MutableRefObject<DragGuardState>;
  activePreset: CameraPreset;
  lensCurvature: number;
  cameraRestSeq: number;
  onSelectProp: (id: string) => void;
  onPropAnchorChange: (anchor: ContextualAnchor | null) => void;
  onUpdatePropTransform: (
    id: string,
    patch: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  ) => void;
  onDraggingChange: (isDragging: boolean) => void;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) || Math.abs(rounded) < 1e-4 ? 0 : rounded;
}

function PropMeshContent({
  type,
  color,
  emissive,
  emissiveIntensity,
  roughness,
  notanEnabled,
  notanColor,
  notanTexture,
}: {
  type: StudioPropType;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  notanEnabled: boolean;
  notanColor: string;
  notanTexture: THREE.DataTexture;
}) {
  const stoolLegs = useMemo<
    ReadonlyArray<{ pos: [number, number, number]; rot: [number, number, number] }>
  >(
    () => [
      { pos: [0.115, -0.02, 0.115], rot: [-0.07, 0, 0.07] },
      { pos: [-0.115, -0.02, 0.115], rot: [-0.07, 0, -0.07] },
      { pos: [0.115, -0.02, -0.115], rot: [0.07, 0, 0.07] },
      { pos: [-0.115, -0.02, -0.115], rot: [0.07, 0, -0.07] },
    ],
    []
  );

  const renderMat = () =>
    notanEnabled ? (
      <meshToonMaterial color={notanColor} gradientMap={notanTexture} />
    ) : (
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={roughness}
        metalness={0.08}
      />
    );

  if (type === 'stool') {
    return (
      <>
        <mesh position={[0, 0.205, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.21, 0.2, 0.05, 24]} />
          {renderMat()}
        </mesh>
        {stoolLegs.map((leg, idx) => (
          <mesh
            key={idx}
            position={leg.pos}
            rotation={leg.rot}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.017, 0.015, 0.422, 12]} />
            {renderMat()}
          </mesh>
        ))}
      </>
    );
  }

  return (
    <mesh castShadow receiveShadow>
      {type === 'box' && <boxGeometry args={[0.5, 0.5, 0.5]} />}
      {type === 'cylinder' && <cylinderGeometry args={[0.22, 0.22, 0.8, 28]} />}
      {type === 'sphere' && <sphereGeometry args={[0.24, 28, 20]} />}
      {type === 'staff' && <cylinderGeometry args={[0.022, 0.022, 1.75, 20]} />}
      {renderMat()}
    </mesh>
  );
}

export function StudioProps({
  propsList,
  selectedPropId,
  propTransformMode,
  studioTheme,
  groundEnabled,
  notanEnabled,
  notanSplit,
  dropPropToFloorCommand,
  dragGuardRef,
  activePreset,
  lensCurvature,
  cameraRestSeq,
  onSelectProp,
  onUpdatePropTransform,
  onDraggingChange,
  onPropAnchorChange,
}: StudioPropsStageProps) {
  const { camera, size, invalidate } = useThree();
  const propGroupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<THREE.Group | null>(null);
  const transformRef = useRef<ComponentRef<typeof TransformControls>>(null);
  const localDraggingRef = useRef(false);
  const lastDropSeqRef = useRef(dropPropToFloorCommand?.seq ?? 0);
  const tempBoxRef = useRef(new THREE.Box3());
  const anchorWorldVecRef = useRef(new THREE.Vector3());
  const emittedPropIdRef = useRef<string | null>(null);
  const onPropAnchorChangeRef = useRef(onPropAnchorChange);
  onPropAnchorChangeRef.current = onPropAnchorChange;
  const activePresetRef = useRef<CameraPreset>(activePreset);
  const lensCurvatureRef = useRef<number>(lensCurvature);
  activePresetRef.current = activePreset;
  lensCurvatureRef.current = lensCurvature;

  const theme = STUDIO_THEMES[studioTheme];
  const propStyle = theme.prop;
  const notanPalette = getNotanThemePalette(studioTheme);

  const notanTexture = useMemo(() => createNotanGradientTexture(0.5), []);

  useEffect(() => {
    return () => {
      notanTexture.dispose();
    };
  }, [notanTexture]);

  useEffect(() => {
    updateNotanGradientTexture(notanTexture, notanSplit);
    invalidate();
  }, [notanTexture, notanSplit, invalidate]);

  const selectedProp = useMemo(
    () =>
      propsList.find((p) => p.id === selectedPropId && p.visible && !p.locked) ??
      null,
    [propsList, selectedPropId]
  );

  useEffect(() => {
    invalidate();
  }, [
    propsList,
    studioTheme,
    selectedPropId,
    propTransformMode,
    notanEnabled,
    invalidate,
  ]);

  useEffect(() => {
    if (!selectedProp) {
      setSelectedGroup(null);
      return;
    }
    const group = propGroupRefs.current.get(selectedProp.id) ?? null;
    setSelectedGroup(group);
  }, [selectedProp, propsList]);

  useEffect(() => {
    if (localDraggingRef.current) return;
    if (!selectedProp || !selectedGroup) {
      if (emittedPropIdRef.current !== null) {
        emittedPropIdRef.current = null;
        onPropAnchorChangeRef.current(null);
      }
      return;
    }

    selectedGroup.updateMatrixWorld(true);
    selectedGroup.getWorldPosition(anchorWorldVecRef.current);
    const proj = projectWorldPointToScreen(
      anchorWorldVecRef.current,
      camera,
      size.width,
      size.height,
      activePreset,
      lensCurvature
    );
    emittedPropIdRef.current = selectedProp.id;
    onPropAnchorChangeRef.current({
      kind: 'prop',
      id: selectedProp.id,
      screenX: proj.screenX,
      screenY: proj.screenY,
      figureCenterScreenX: size.width * 0.5,
    });
  }, [
    selectedProp,
    selectedGroup,
    activePreset,
    lensCurvature,
    cameraRestSeq,
    camera,
    size.width,
    size.height,
  ]);

  useEffect(() => {
    return () => {
      if (emittedPropIdRef.current !== null) {
        emittedPropIdRef.current = null;
        onPropAnchorChangeRef.current(null);
      }
    };
  }, []);

  const readTransformPatch = useCallback((group: THREE.Group) => {
    const clampedScale: [number, number, number] = [
      round3(Math.max(0.05, Math.min(8, group.scale.x))),
      round3(Math.max(0.05, Math.min(8, group.scale.y))),
      round3(Math.max(0.05, Math.min(8, group.scale.z))),
    ];
    group.scale.set(clampedScale[0], clampedScale[1], clampedScale[2]);
    group.updateMatrixWorld(true);

    const euler = new THREE.Euler().setFromQuaternion(group.quaternion, 'XYZ');
    return {
      position: [
        round3(group.position.x),
        round3(group.position.y),
        round3(group.position.z),
      ] as [number, number, number],
      rotation: [
        Math.round(THREE.MathUtils.radToDeg(euler.x)),
        Math.round(THREE.MathUtils.radToDeg(euler.y)),
        Math.round(THREE.MathUtils.radToDeg(euler.z)),
      ] as [number, number, number],
      scale: clampedScale,
    };
  }, []);

  const enforcePropFloor = useCallback(
    (group: THREE.Group) => {
      group.scale.set(
        Math.max(0.05, Math.min(8, group.scale.x)),
        Math.max(0.05, Math.min(8, group.scale.y)),
        Math.max(0.05, Math.min(8, group.scale.z))
      );
      if (!groundEnabled) return;

      group.updateMatrixWorld(true);
      const box = tempBoxRef.current.setFromObject(group);
      if (Number.isFinite(box.min.y) && box.min.y < 0) {
        group.position.y += -box.min.y;
        group.updateMatrixWorld(true);
      }
    },
    [groundEnabled]
  );

  const handlePropObjectChange = useCallback(() => {
    if (!selectedProp || !selectedGroup) return;
    enforcePropFloor(selectedGroup);
    invalidate();
  }, [selectedProp, selectedGroup, enforcePropFloor, invalidate]);

  useEffect(() => {
    const controls =
      transformRef.current as unknown as DraggingChangedDispatcher | null;
    if (!controls || !selectedProp || !selectedGroup) {
      return;
    }

    const handleDraggingChanged = (event: { value: boolean }) => {
      const wasDragging = localDraggingRef.current;
      const dragging = Boolean(event.value);
      localDraggingRef.current = dragging;
      dragGuardRef.current.isDragging = dragging;
      if (!dragging) {
        dragGuardRef.current.lastDragEndTime = performance.now();
        if (wasDragging) {
          enforcePropFloor(selectedGroup);
          onUpdatePropTransform(
            selectedProp.id,
            readTransformPatch(selectedGroup)
          );
        }
      }
      onDraggingChange(dragging);
      invalidate();
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged);
    const detachPointerWarp = attachCurvilinearPointerWarp(
      transformRef.current,
      () => ({
        preset: activePresetRef.current,
        curvature: lensCurvatureRef.current,
      })
    );
    return () => {
      detachPointerWarp();
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      localDraggingRef.current = false;
      dragGuardRef.current.isDragging = false;
      onDraggingChange(false);
    };
  }, [
    selectedProp,
    selectedGroup,
    propTransformMode,
    activePreset,
    dragGuardRef,
    enforcePropFloor,
    readTransformPatch,
    onUpdatePropTransform,
    onDraggingChange,
    invalidate,
  ]);

  useEffect(() => {
    if (!dropPropToFloorCommand) return;
    if (dropPropToFloorCommand.seq === lastDropSeqRef.current) return;
    lastDropSeqRef.current = dropPropToFloorCommand.seq;

    const group = propGroupRefs.current.get(dropPropToFloorCommand.propId);
    if (!group) return;

    group.updateMatrixWorld(true);
    const box = tempBoxRef.current.setFromObject(group);
    if (Number.isFinite(box.min.y)) {
      group.position.y += -box.min.y;
      group.updateMatrixWorld(true);
      onUpdatePropTransform(
        dropPropToFloorCommand.propId,
        readTransformPatch(group)
      );
      invalidate();
    }
  }, [
    dropPropToFloorCommand,
    onUpdatePropTransform,
    readTransformPatch,
    invalidate,
  ]);

  return (
    <group>
      <group name="mortal-mesh-props">
        {propsList.map((prop) => {
          const isSelected = prop.id === selectedPropId;
          return (
            <group
              key={prop.id}
              ref={(group) => {
                if (group) {
                  group.userData.mortalMeshProp = prop;
                  propGroupRefs.current.set(prop.id, group);
                } else {
                  propGroupRefs.current.delete(prop.id);
                }
              }}
              visible={prop.visible}
              position={prop.position}
              rotation={[
                THREE.MathUtils.degToRad(prop.rotation[0]),
                THREE.MathUtils.degToRad(prop.rotation[1]),
                THREE.MathUtils.degToRad(prop.rotation[2]),
              ]}
              scale={prop.scale}
              onClick={(event) => {
                if (!prop.visible) return;
                if (
                  dragGuardRef.current.isDragging ||
                  performance.now() - dragGuardRef.current.lastDragEndTime < 200
                ) {
                  return;
                }
                event.stopPropagation();
                onSelectProp(prop.id);
                invalidate();
              }}
            >
              <PropMeshContent
                type={prop.type}
                color={propStyle.color}
                emissive={
                  isSelected && !prop.locked
                    ? propStyle.selectedEmissive
                    : '#000000'
                }
                emissiveIntensity={isSelected && !prop.locked ? 0.22 : 0}
                roughness={propStyle.roughness}
                notanEnabled={notanEnabled}
                notanColor={notanPalette.propColor}
                notanTexture={notanTexture}
              />
            </group>
          );
        })}
      </group>

      {selectedProp && selectedGroup && (
        <group name="mortal-mesh-prop-gizmo">
          <TransformControls
            key={`prop-gizmo-${selectedProp.id}-${propTransformMode}`}
            ref={transformRef}
            object={selectedGroup}
            mode={propTransformMode}
            space={propTransformMode === 'translate' ? 'world' : 'local'}
            size={0.72}
            onObjectChange={handlePropObjectChange}
            onChange={() => invalidate()}
          />
        </group>
      )}
    </group>
  );
}
