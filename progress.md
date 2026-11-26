# Mortal Mesh — Project Progress & Handoff Guide

**Last Updated:** 2026-11-26  
**Status:** Phase 14 Complete — Atelier Default, 3-Point Rembrandt Lighting & 2-Value Notan Shader, Non-Destructive Proportion Morphs, Head-Unit Ruler, Composition Crops/Grids & Reference Image Overlay Built & Verified  
**Local Server:** Stopped cleanly (start preview via `rm -rf .next && npm run build && npm run start`, or dev via `npm run dev`)

---

## 1. Project Overview & Vision

**Mortal Mesh** is a 3D anatomy & figure-posing CAD/artist studio web application built with Next.js App Router, React Three Fiber, Drei, and `camera-controls`.
- **Phases 1–6 (Gates 1–14 Complete):** Studio engine (`frameloop="demand"`), 604 KB Quaternius rigged mannequin (`public/models/anatomy.glb`), calibrated 52-bone local axes & anatomical ROM limits, SkinnedMesh floor grounding, toggleable joint-space gravity solver, `Ground: ON/OFF`, infinite CAD floor, `White / Gray / Dark` studio themes, collapsible accordion inspector + bottom `StudioDock`, top-right CSS-3D ViewCube, 50-step Undo/Redo, bilateral Mirror L↔R, versioned Pose JSON I/O, Transparent/Studio PNG Snapshot exporter, interactive Key-Light orbiting, and artist keyboard shortcuts.
- **Phase 7 (Milestones 15 & 16 Complete):**
  - **Milestone 15 (Gate 15 Approved):** Multi-mannequin staging (up to `6` isolated figures cloned via `SkeletonUtils.clone` from a single cached GLB template), distinct finishes (`Classic`, `Slate`, `Ivory`, `Clay`), Show/Hide & Duplicate & Delete controls, per-figure Undo/Redo history, X/Z staging preservation on pose presets, and complete **gravity-immune & edit-immune Figure Lock**.
  - **Milestone 16:** Searchable, categorized **50 Most Famous Poses Library** (`src/data/poses.ts`) across 6 categories (`Foundation`, `Classical`, `Action`, `Combat`, `Dance`, `Gesture`), compact sidebar search + category filter + full frosted `PoseLibraryModal`, locked-figure toast protection, and automated ROM validation script (`scripts/validatePoses.mjs`).

### Core Design & Engineering Guardrails
- **Isolated Multi-Figure Cloning:** `/models/anatomy.glb` is fetched once with `DRACOLoader('/draco/')` and cloned per instance via `SkeletonUtils.clone(template.scene)` with per-instance cloned materials and `frustumCulled = false` on all cloned `SkinnedMesh`es.
- **Complete Lock Immunity:** Locking a figure zeroes & sleeps its solver (`JointSpaceGravitySolver.step({ locked: true })`), hides its joint hitboxes, detaches `TransformControls`, and disables all manual edits/presets/gravity while firing `"Unlock figure to apply a pose"` if clicked in the Pose Library.
- **Demand-Driven Rendering (`frameloop="demand"`):** Every spawn, pose switch, tint, lock toggle, gizmo drag, and gravity step calls `invalidate()` cleanly and goes 100% idle at rest.
- **Permanent Mandatory Rule:** `progress.md` MUST be updated automatically at the end of every milestone/run before halting at a Gate.

---

## 2. Tech Stack & Pinned Versions

Declared in `package.json`:
- **Framework:** `next` `14.2.18` (App Router)
- **UI Runtime:** `react` `^18.3.1`, `react-dom` `^18.3.1`, `typescript` `^5.6.3`
- **3D Engine:** `three` `^0.169.0` (`@types/three` `^0.169.0`, including `SkeletonUtils`), `@react-three/fiber` `^8.17.10`, `@react-three/drei` `^9.117.3`, `camera-controls` `^2.9.0`
- **Styling:** `tailwindcss` `^3.4.15`, `postcss` `^8.4.49`, `autoprefixer` `^10.4.20` (with offline local `--font-sans` / `--font-mono` stacks in `globals.css`)

---

## 3. Milestone 16 — Complete Categorical Log of All 50 Famous Poses (`src/data/poses.ts`)

All **50 poses** (`Foundation: 5`, `Classical & Fine Art: 10`, `Action & Comic Hero: 10`, `Martial Arts & Combat: 8`, `Dance & Athletics: 8`, `Seated & Expressive Gesture: 9`) passed `node scripts/validatePoses.mjs` with `0` ROM/bone violations.

### Category Summary

| Category Key | Display Label | Count |
| --- | --- | --- |
| `foundation` | Foundation | 5 |
| `classical` | Classical & Fine Art | 10 |
| `action` | Action & Comic Hero | 10 |
| `combat` | Martial Arts & Combat | 8 |
| `dance` | Dance & Athletics | 8 |
| `gesture` | Seated & Expressive Gesture | 9 |
| **All** | **Total** | **50** |

### Foundation (`foundation` — 5 poses)

1. `t-pose` — **T-Pose**: Neutral anatomical bind pose grounded cleanly at the origin
2. `a-pose` — **A-Pose**: Relaxed standing posture with lowered arms and balanced stance
3. `vitruvian-man` — **Vitruvian Man**: Symmetric star proportion study echoing Leonardo da Vinci canon
4. `neutral-standing` — **Neutral Standing**: Natural everyday stance with gentle spinal S-curve and ease
5. `attention-stance` — **Attention Stance**: Tall aligned posture with chest lifted and arms braced cleanly

### Classical & Fine Art (`classical` — 10 poses)

1. `contrapposto` — **Contrapposto (David)**: Classic weight-shift stance with opposing hip drop and shoulder counter-tilt
2. `the-thinker` — **The Thinker (Rodin)**: Hunched seated contemplation with right elbow braced onto the knee supporting the chin
3. `discobolus` — **Discobolus (Discus Thrower)**: Extreme classical torsion winding the back arm behind the hip prior to release
4. `venus-pudica` — **Venus Pudica**: Graceful modest classical stance with soft shoulder turn and crossed shielding forearms
5. `adlocutio` — **Adlocutio (Orator)**: Augustus Prima Porta commanding oratorical stance with raised proclaiming right arm
6. `atlas-bearing-sky` — **Atlas Bearing Sky**: Strained Titan squat bracing elbows and palms upward beneath celestial load
7. `creation-of-adam` — **Creation of Adam Reach**: Sistine Chapel languid reclining reach extending the forearm and trailing fingers
8. `laocoon-twist` — **Laocoön Serpentine Twist**: Dramatic Baroque diagonal writhe arching the ribcage away while wrenching both arms
9. `odalisque-reclining` — **Odalisque Reclining**: Side-resting figure propped gracefully on one bent arm with long crossed leg line
10. `kneeling-supplicant` — **Kneeling Supplicant**: Upright one-knee / twin-knee devotional kneel with palms pressed toward the chest

### Action & Comic Hero (`action` — 10 poses)

1. `superhero-landing` — **Three-Point Superhero Landing**: Iconic comic-book knee-down impact landing with right fist planted toward the floor
2. `rooftop-spider-perch` — **Rooftop Spider-Perch**: Deep coiled rooftop perch with wide knees and fingertips poised low between feet
3. `mid-air-jump` — **Mid-Air Hero Jump** `[AIR]`: Dynamic aerial leap with tucked knee and trailing reaching arm above floor
4. `superman-flight` — **Superman Flight** `[AIR]`: Horizontal high-speed heroic flight punching one fist forward overhead
5. `power-levitation` — **Power Levitation** `[AIR]`: Upright hovering levitation with swept-back cape shoulders and bent trailing knee
6. `action-lunge` — **Action Lunge**: Dynamic forward lunge with torso counter-twist and braced striking arms
7. `sprint-mid-stride` — **Sprint Mid-Stride**: Explosive sprint stride with high knee drive and crisp contralateral arm swing
8. `matrix-dodge` — **Backward Matrix Dodge**: Deep cinematic hyper-extended backbend dodging horizontally above bent braced knees
9. `skydiving-freefall` — **Skydiving Freefall** `[AIR]`: Belly-to-earth arched freefall posture with spread stabilizing arms and bent shins
10. `heroic-power-stance` — **Heroic Power Stance**: Wide grounded comic power stance with fists anchored on the hips and lifted chest

### Martial Arts & Combat (`combat` — 8 poses)

1. `orthodox-boxing-guard` — **Orthodox Boxing Guard**: Tight chin-tucked boxing peekaboo guard with lead shoulder and staggered stance
2. `crane-kick-balance` — **Crane Kick Balance**: Single-leg crane chamber balance with outstretched wing-raised wrists
3. `high-roundhouse-kick` — **High Roundhouse Kick**: Extended horizontal side/roundhouse kick supported cleanly on a pivoted standing leg
4. `jeet-kune-do-guard` — **Jeet Kune Do Guard**: Side-on intercepting stance with extended lead hand and coiled rear striking arm
5. `two-handed-sword-guard` — **Two-Handed Sword Guard**: Centered two-handed middle guard gripping an imaginary hilt forward of the torso
6. `archer-full-draw` — **Archer Full Draw**: Extended left bow-arm sightline paired with right drawing elbow anchored past the cheek
7. `rising-uppercut` — **Rising Uppercut**: Upward driving corkscrew uppercut twisting hips and shoulders into a rising right fist
8. `low-spear-thrust` — **Low Spear Thrust**: Deep martial low-horse lunge driving both arms along a fierce forward thrust line

### Dance & Athletics (`dance` — 8 poses)

1. `ballet-arabesque` — **Ballet Arabesque**: Elevated classical arabesque line extending rear leg high behind while reaching forward
2. `ballet-grand-jete` — **Ballet Grand Jeté** `[AIR]`: Suspended grand jeté split leap with graceful arched spine and swept port de bras
3. `yoga-tree-pose` — **Yoga Tree Pose**: Vrksasana single-leg balance with raised arms overhead and open turned-out knee
4. `yoga-warrior-ii` — **Yoga Warrior II**: Virabhadrasana II wide lunging stance with arms parallel to the horizon and turned gaze
5. `track-sprinter-set` — **Track Sprinter Set**: Track starting-block set position coiled forward over planted hands ready for the gun
6. `handstand-balance` — **Handstand Balance**: Inverted gymnastics handstand grounded directly through stacked wrists and shoulders
7. `parkour-vault` — **Parkour Vault** `[AIR]`: Dynamic speed-vault clearing an obstacle horizontally over one planted push-off hand
8. `baseball-pitch-windup` — **Baseball Pitch Wind-Up**: High-torque pitching delivery tucking the glove arm ahead of the coiled throwing shoulder

### Seated & Expressive Gesture (`gesture` — 9 poses)

1. `seated-casual` — **Seated Casual**: Balanced upright seated study resting forearms lightly near the thighs
2. `cross-legged-meditate` — **Cross-Legged Meditate**: Centered cross-legged meditation seated quietly on the floor with open resting palms
3. `exhausted-slouch` — **Exhausted Slouch**: Heavy rounded-shoulder fatigue collapsing the torso and bowing the head downward
4. `arms-crossed-confident` — **Arms Crossed Confident**: Self-assured standing attitude with folded forearms tucked securely across the chest
5. `casual-hip-lean` — **Casual Hip Lean**: Asymmetric relaxed hip lean with one hand perched on the waist and crossed ankles
6. `over-the-shoulder-turn` — **Over-the-Shoulder Turn**: Dynamic contrapposto twist turning shoulders and chin cleanly back over one shoulder
7. `reaching-skyward` — **Reaching Skyward**: Long upward stretch balancing on toes while extending one hand open toward the sky
8. `kneeling-despair` — **Kneeling Despair**: Dramatic double-knee drop throwing the chest open and palms upward in anguish
9. `victory-arms-raised` — **Victory Arms Raised**: Triumphant V-arm celebration thrusting twin fists skyward with chest lifted high

### Search, Gallery & Multi-Figure Staging Behavior
- **Sidebar Pose Presets (`FloatingSidebar.tsx`):** Search bar (`"Search 50 poses..."`, clear button + `Escape` clear, input-guarded against triggering `R/G/H/0/?` shortcuts), horizontal category pills (`All`, `Foundation`, `Classical`, `Action`, `Combat`, `Dance`, `Gesture`) with live `filtered/50` count, `max-h-[220px] studio-scroll` list with `AIR` badges, `"Show all 50 poses"` reset button on empty filter, and auto-clearing of non-matching search queries when switching to `All` or another category with 0 matches for that query.
- **Full Pose Library Overlay (`PoseLibraryModal.tsx`):** Frosted responsive 1/2/3-column card grid showing pose names, category tags, `AIR` badges, and 1-line artistic descriptions; resets search `query` and `category` to `All` automatically whenever closed, and auto-clears stale queries on empty category switches or `"Show all 50 poses"`.
- **Locked Figure Protection:** Both sidebar pose rows and modal cards use `aria-disabled={isLocked}` so clicking any pose while the selected figure is locked displays `"Unlock figure to apply a pose"` without modifying the frozen figure.
- **X/Z Preservation:** Applying any pose preset preserves the active mannequin's current `X/Z` world staging position.

---

## 4. Modified & Created Files (Milestone 16 + Filter Polish + 50-Pose IK Overhaul)

- `src/data/jointLimits.ts` — calibrated physiological ROM limits (`pelvis`, `createSpineSpec`, `upperarm_l/r`, `hand_l/r`, `thigh_l/r`, `calf_l/r`, `foot_l/r`) preserving exact Euler orders (`YZX` pelvis, `XYZ` all other bones) and locked axes.
- `scripts/solvePoses.mjs` *(new)* — analytical 3D two-bone IK solver (`PoseBuilder`, `solveTwoBoneIK`, `solveHandOrientation`, `solveFoot`, `setFingers`, dual-branch `XYZ` + ROM-constrained quaternion refiner `quatToClampedEulerDeg`) calibrating all 50 poses directly against `public/models/anatomy.glb`.
- `src/data/poses.ts` — regenerated and visually refined all 50 iconic poses across 6 categories (`POSE_CATEGORIES`, `handGesture` builders, `filterPosePresets`).
- `scripts/validatePoses.mjs` *(new)* — Node + TypeScript verification script asserting 50 unique poses, category counts, valid bone names, finite numbers, and 100% ROM compliance against `src/data/jointLimits.ts`.
- `src/components/StudioPrimitives.tsx` — added `SearchIcon` and `ExpandGalleryIcon`.
- `src/components/PoseLibraryModal.tsx` *(new)* — frosted searchable/filterable 50-pose gallery modal with compact `{cat.label}` pills, `useEffect` reset on close, auto-clearing category transitions, and `"Show all 50 poses"` empty-state action.
- `src/components/FloatingSidebar.tsx` — upgraded **Pose Presets** with search input, category pills that auto-clear conflicting stale search queries, scrollable pose list (`AIR` badges), `"Show all 50 poses"` empty-state reset, locked-toast `aria-disabled` click handling, and **Expand Gallery**.
- `src/app/page.tsx` — wired `isPoseLibraryOpen`, `<PoseLibraryModal>`, and `Escape` dismissal.

---

## 5. Final Verification Status

- **IK Pose Generator (`DIAG_IK=1 node scripts/solvePoses.mjs`):** Exited with code `0` (`Generated 50 poses in src/data/poses.ts (audit warnings: 0).`).
- **50-Pose Validation (`node scripts/validatePoses.mjs`):** Exited with code `0` (`VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}, 0 ROM/bone violations)`).
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`NO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited with code `0` cleanly after final edits (`/` `289 kB`, First Load JS `376 kB`, 0 TypeScript/ESLint errors).
- **Live Browser Verification (`http://localhost:3000/`):**
  - Clean `rm -rf .next && npm run dev` verified cleanly prior to Phase 8.

---

## 6. Phase 8 — Live Two-Bone IK, Studio Props, Scene I/O, Touch/Tablet UI & Offline PWA (Milestones 17–20)

### 6.1 Implemented Architecture & Features

- **Milestone 17 — Live Viewport Two-Bone IK & Scalable Studio Props:**
  - `src/physics/runtimeIK.ts`: Browser-safe analytical two-bone IK solver (`solveLimbIK`) dynamically measuring scaled bone lengths (`upperarm -> lowerarm -> hand`, `thigh -> calf -> foot`), computing body-aligned natural elbow/knee pole hints blended smoothly with existing bend planes, honoring `'YZX'`/`'XYZ'` Euler orders and `jointLimits.ts` ROM clamping via dual-branch extraction + ROM refinement, and micro-refining distal flexion around ROM boundaries.
  - `src/components/AnatomyModel.tsx`: Added `FK | IK` mode support, 5 distinct diamond+ring IK handles (`hand_l`, `hand_r`, `foot_l`, `foot_r`, `pelvis`) driven via world `TransformControls` proxy, `Ground` floor constraints, `Gravity` downstream wake integration, single Undo/Redo snapshot commits on release, lock immunity, and `isCoarsePointer` enlarged invisible raycast colliders (`~2x` radius).
  - `src/types/props.ts` & `src/components/StudioProps.tsx`: Added up to `12` CAD-styled geometric studio props (`box`, `stool`, `cylinder`, `sphere`, `staff`) with theme-matched matte materials, `Move | Rotate | Scale` `TransformControls`, floor collision clamping, `Drop Floor`, `Reset Scale`, `Lock`, `Hide`, and clean snapshot visibility (gizmos & IK handles hidden automatically in PNG exports).
  - `src/components/StudioDock.tsx`, `src/components/FloatingSidebar.tsx`, `src/hooks/useStudioShortcuts.ts`, `src/components/ShortcutsModal.tsx`: Added `FK | IK` toggles, `I` hotkey, and collapsible **Studio Props** accordion.

- **Milestone 18 — Full Scene Save/Load (`.json`), Camera Bookmarks & Auto-Session Recovery:**
  - `src/types/sceneIO.ts` & `src/utils/sceneSerialization.ts` (reusing `parsePoseSnapshotObject` in `src/utils/poseSerialization.ts`): Strict versioned `MortalMeshSceneFile` (`app: 'mortal-mesh-scene'`, `version: 1`) serializing all staged mannequins (`1..6`, locks, finishes, poses, pins, exact root positions), `StudioProp` list, studio/lighting/IK settings, live camera position/target, and up to `8` saved `CameraBookmark` entries, plus unified `parseSceneOrPoseFile` accepting both full scenes and legacy v1 single-pose `.json` files.
  - `src/components/StudioCanvas.tsx` & `src/components/ViewportGizmo.tsx`: Exposed `CameraBridge` (`getView`, `setView`, `invalidateView`), `onChange` ViewCube sync, and interactive **Camera Views** popover (`+ Save View`, `0/8`..`8/8`, smooth animated recall, delete).
  - `src/app/page.tsx`: Wired **Save Scene**, **Load Scene**, **New Blank Scene**, mount restore from `localStorage` (`mortal-mesh:autosave:v1`), and `600ms` debounced auto-save across discrete pose/scene edits.

- **Milestone 19 — Responsive Touch, S-Pen, Safe Areas & Multi-Device Layout:**
  - `src/hooks/useViewportProfile.ts`: Tracks desktop (`>=1200`), tablet (`768..1199`), phone (`<768`), `isCoarsePointer`, `isLandscape`, `isCompactLandscape`, firing canvas `invalidate()` cleanly across `resize`, `orientationchange`, and `visualViewport`.
  - `src/app/layout.tsx` & `src/app/globals.css`: Exported Next.js `viewport` (`viewportFit: 'cover'`, `maximumScale: 1`), `100dvh`/`100dvw`, `overscroll-behavior: none`, `.studio-canvas-shell { touch-action: none }`, `.studio-modal-scroll`, and larger coarse-pointer range thumbs.
  - `src/components/FloatingSidebar.tsx`, `src/components/ViewportGizmo.tsx`, `src/components/StudioDock.tsx`, `src/components/StudioToast.tsx`, `src/components/PoseLibraryModal.tsx`, `src/components/ShortcutsModal.tsx`: Added `env(safe-area-inset-*)` offsets, collapsed top-left **Tools** overlay drawer on phone/compact-landscape with tap-outside backdrop dismiss, `46px`/`60px` responsive ViewCube scaling, >= `40px` touch dock controls, and explicit `CameraControls` 1/2/3-finger touch mapping (`TOUCH_ROTATE`, `TOUCH_DOLLY_TRUCK`, `TOUCH_TRUCK`).

- **Milestone 20 — Offline-First PWA & Deployment Deliverables:**
  - `scripts/generatePwaIcons.mjs` -> generated valid monochrome RGBA icons (`public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`).
  - `public/manifest.webmanifest`: Full standalone web app manifest linked in `src/app/layout.tsx`.
  - `scripts/generatePrecache.mjs` & `package.json`: Post-build script hashing and indexing all `.next/static/*` assets + `/`, `/manifest.webmanifest`, `/models/anatomy.glb`, `/draco/*`, and `/icons/*` into `public/sw-precache.json`.
  - `public/sw.js` & `src/components/PwaManager.tsx`: Deterministic native Service Worker (`CacheFirst` immutable assets/chunks, `NetworkFirst` navigation with `/` fallback, `StaleWhileRevalidate` static fallback) + production registration, `Offline Ready` / `Offline Mode` badge, and conditional **Install App** (`beforeinstallprompt`) button.
  - `next.config.mjs` & `vercel.json`: Production HTTP cache/MIME/SW scope headers.
  - `DEPLOY_AND_OFFLINE_GUIDE.md` *(new)*: User wake-up deployment & Samsung Galaxy S25 Ultra / Tab S8 install/offline guide.

### 6.2 Phase 8 Final Verification Outputs

- **Pose Validation (`node scripts/validatePoses.mjs`):** Exited `0` (`VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}, 0 ROM/bone violations)`).
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`NO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `303 kB`, First Load JS `390 kB`, 0 TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=c4371b89135a`, `27` URLs).
- **Round-Trip & Runtime IK Test (Node):** `PASS scene_roundtrip + runtimeIK err_arm=0.0094 err_leg=0.0015`.
- **Production HTTP Headers (`npm run start`):** Verified `200 OK` with expected `Cache-Control`, `Content-Type`, and `Service-Worker-Allowed: /` across `/`, `/sw.js`, `/sw-precache.json`, `/manifest.webmanifest`, `/models/anatomy.glb`, `/draco/draco_decoder.wasm`, and `/icons/icon-maskable-512.png`.
- **True Offline & Responsive Browser Verification:**
  - **Headless Chrome 157 CDP Offline Proof:** Confirmed active `/sw.js` (`mortal-mesh-cache-c4371b89135a`) caching `/`, `/models/anatomy.glb`, `/draco/draco_decoder.wasm`, and `/manifest.webmanifest`; verified `localStorage` autosave (`mortal-mesh-scene`, 2 props, 1 bookmark, `ik`); reloaded cleanly with `Network.emulateNetworkConditions({ offline: true })`, booting offline with **`Offline Mode`**, rendering `Contrapposto` + props + 5 IK handles + **`Install App`**, spawning `Staff 3` (`3/12`) offline, and rendering cleanly on `800x1280` portrait with `0` console errors and `0` page exceptions.
  - **Multi-Viewport Browser QA (`1440x900`, `412x915`, `915x412`, `1280x800`, `800x1280`):** Verified zero horizontal overflow, clean mobile **Tools** drawer + backdrop dismissal, compact/full ViewCube separation, `PoseLibraryModal` touch scrolling, and **New Blank Scene** reset with `0` console/page errors. Production server stopped cleanly afterward (`no background tasks running`).

---

## 7. Phase 9 — Curvilinear Perspective (`4-PT` & `5-PT`), 26-Zone ViewCube & `Core`-Mode Hand Gestures (Milestones 21–23)

### 7.1 Implemented Architecture & Features

- **Milestone 21 — `4-PT` & `5-PT` Curvilinear Perspective, Guides & Warped Picking:**
  - `src/types/anatomy.ts`: Extended `CameraPreset` to `'1-point' | '2-point' | '3-point' | '4-point' | '5-point'` with `CAMERA_PRESETS[id].fov`, `CAMERA_PRESET_ORDER`, `isCameraPreset`, and `isCurvilinearPreset`.
  - `src/utils/lensWarp.ts` *(new)*: Shared analytical forward (`screenNdcToSourceNdc`) and inverse (`sourceNdcToScreenNdc`) curvilinear lens projection math (`4-PT` vertical cylindrical + `5-PT` aspect-preserving hemispherical fisheye, curvature clamped `0.2..1.0`, default `0.65`), `projectWorldPointToScreen`, and `attachCurvilinearPointerWarp` for `TransformControls._getPointer`.
  - `src/components/CurvilinearLens.tsx` *(new)*: Demand-driven R3F post-process pass (`WebGLRenderTarget` with `RGBAFormat` + WebGL2 MSAA + `HalfFloatType` fallback, custom GLSL warp shader with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` and alpha-preserving Transparent PNG cutout mode), R3F `setEvents({ compute })` inverse raycasting override cleanly restored when returning to rectilinear modes, and `CurvilinearRenderHook` wired into `SnapshotExporter`.
  - `src/components/PerspectiveGuides.tsx` *(new)*: Theme-matched fullscreen `pointer-events-none` SVG guide overlay drawing vertical curved zenith/nadir meridians (`4-PT`) and concentric dome ellipses + cardinal vanishing arcs (`5-PT`), naturally excluded from canvas PNG snapshots.
  - `src/types/sceneIO.ts` & `src/utils/sceneSerialization.ts`: Backward-compatible serialization/parsing of `perspectiveMode`, `lensCurvature`, and `showPerspectiveGuides` across saved scenes and `localStorage` autosave.
  - `src/components/StudioCanvas.tsx`, `src/components/StudioProps.tsx`, `src/components/AnatomyModel.tsx`: Separated `CameraRig` FOV sync (`activePreset`) from camera look-at snapping (`snapTrigger`) so loaded scenes keep saved views while updating lens FOV; wrapped bone, IK, Move-Body, and Studio Prop `TransformControls` with `attachCurvilinearPointerWarp`.

- **Milestone 22 — Interactive 26-Zone ViewCube:**
  - `src/components/ViewportGizmo.tsx` & `src/data/studioThemes.ts`: Upgraded each of the 6 CSS-3D cube faces into an orthonormal `(normal, uAxis, vAxis)` `3×3` grid assigning canonical shared zone IDs (`zone_${dx}_${dy}_${dz}`) across all **26** zones (**6 faces**, **12 edges**, **8 corners**). Hovering any edge or corner highlights every touching face segment simultaneously and updates a fixed-height non-shifting hover readout badge (`FRONT · TOP · RIGHT`, `FRONT · BOTTOM`, etc.). Added `1-PT..5-PT` camera bar, `Curvature` slider (`20%–100%`), `Perspective Guides` toggle, `>5px` drag-to-orbit threshold, and `52px`/`64px` responsive touch sizing.

- **Milestone 23 — On-Mannequin Fixed Hand Gesture Pop-Up (`Core` Mode):**
  - `src/data/handGestures.ts` *(new)* & `scripts/validatePoses.mjs`: Calibrated **12** artist hand gestures (`relaxed`, `open`, `spread`, `fist`, `grab`, `hold`, `point`, `peace`, `rock`, `middle-finger`, `thumbs-up`, `pinch`) parameterized symmetrically for `hand_l` and `hand_r`, plus `detectMatchingHandGesture`. Extended `scripts/validatePoses.mjs` to assert zero ROM violations across all 50 poses and all `12×2` hand presets.
  - `src/types/poseIO.ts` & `src/components/AnatomyModel.tsx`: Extended `PoseBridge` with `applyHandGesture`, `mirrorHandGesture`, and `getHandGestureId`; projected the selected `hand_l`/`hand_r` world position via `projectWorldPointToScreen` strictly when `jointsDisplay === 'core'`, `controlMode === 'fk'`, `!moveBodyEnabled`, and unlocked (`>= 1.5px` throttled `useFrame` updates).
  - `src/components/HandGesturePopover.tsx` *(new)* & `src/app/page.tsx`: Frosted floating 12-gesture selector with `Left/Right Hand` header, 1-tap `L → R` / `R → L` hand mirror, active gesture detection, single-step Undo/Redo + autosave integration, mobile bottom-dock-safe centering, desktop offset avoiding the wrist gizmo ring, and automatic dismissal on lock, mode change to `All`/`Off`, IK/Move Body, or `Escape`.

### 7.2 Phase 9 Final Verification Outputs

- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`NO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `310 kB`, First Load JS `397 kB`, 0 TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=01a1b7685d97`, `27 URLs`).
- **Headless Chrome Production & Offline CDP QA (`npm run start` + `verify_phase9_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`):
  - **26-Zone ViewCube:** Audited `54` zone buttons forming `26` unique zone IDs (`faces: 6`, `edges: 12`, `corners: 8`), confirmed synchronized 3-button highlight + `FRONT · TOP · RIGHT` readout on corner hover, clicked corners, and orbited via pointer drag.
  - **Curvilinear `4-PT` & `5-PT`:** Verified visual differences across `1-PT`, `4-PT`, and `5-PT`, Curvature slider adjustment to `90%`, `Perspective Guides` toggle, and **5-PT Transparent PNG** export (`2880×1800`, `cornerAlpha: 0`, `centerAlpha: 255`).
  - **Core Hand Gestures:** Opened popover by clicking `hand_l`, applied `Fist`, `Rock`, `Middle Finger`, `Grab`, and `Peace`, mirrored `L → R`, verified `Ctrl+Z` Undo restored `"grab"`, verified auto-dismissal on switching to `All` joints and on figure `Lock`.
  - **Responsive & Offline PWA:** Passed horizontal overflow audit across `1440×900`, `412×915`, `915×412`, `1280×800`, and `800×1280`, plus offline reload (`Offline Mode`) preserving staged scene & sculpted hand pose cleanly. Production server stopped cleanly afterward (`no background tasks running`).

### 7.3 Anatomical Thumb Axis & Position Calibration (All 50 Poses & 12 Hand Gestures)

- **Root-Cause Diagnosis (`public/models/anatomy.glb`):** Direct skeleton inspection verified that across `thumb_01/02/03_l` and `thumb_01/02/03_r`, local `+X` bends the thumb anatomically across the palm toward the fingers (same sign `+X` on both hands), `Y` rotates axial CMC pronation (`s * y`), and `Z` moves perpendicular to the palm (`+Z` on L / `-Z` on R pushes downward below the wrist rather than across the palm). Previously `thumb_02` and `thumb_03` had `X` locked in `jointLimits.ts` and flexed along `Z`.
- **ROM & Symmetry Fixes:**
  - `src/data/jointLimits.ts`: Enabled anatomical `+X` flexion (`Bend`) on `thumb_01` (`[-45, 75]`), `thumb_02` (`[-15, 80]`), and `thumb_03` (`[-20, 85]`), enabled CMC `Twist` (`Y`) and `Side` (`Z`) on `thumb_01`, and locked `Y`/`Z` on `thumb_02`/`thumb_03`.
  - `src/data/handGestures.ts`: Recalibrated all **12** hand presets (`relaxed`, `open`, `spread`, `fist`, `grab`, `hold`, `point`, `peace`, `rock`, `middle-finger`, `thumbs-up`, `pinch`) identically across left & right hands (`x_r = x_l`, `y_r = -y_l`, `z_r = -z_l`), including pad-to-pad `pinch` fingertip contact.
  - `scripts/solvePoses.mjs` & `src/data/poses.ts`: Recalibrated all 6 finger/thumb presets (`fist`, `open`, `flat`, `grip`, `graceful`, `relaxed`) and regenerated all **50** poses cleanly (`audit warnings: 0`).
  - `scripts/validatePoses.mjs`: Added automated L↔R thumb symmetry checks (`l.x === r.x`, `l.y === -r.y`, `l.z === -r.z`) and locked `thumb_02/03` `Y/Z === 0` assertions across all 12 hand gestures.
- **Verification Outputs:**
  - `DIAG_IK=1 node scripts/solvePoses.mjs`: `Generated 50 poses in src/data/poses.ts (audit warnings: 0).`
  - `node scripts/validatePoses.mjs`: Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
  - `rm -rf .next && npm run build`: Exited `0` (`/` `310 kB`, First Load JS `397 kB`, `Generated public/sw-precache.json (version=1af0de89e4c8, 27 URLs)`).
  - Headless Chrome Close-Up Visual & Regression QA (`verify_thumbs_cdp.mjs` & `verify_phase9_cdp.mjs`): Both exited `0` (`"status":"PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`). Visually inspected close-up 3D renders across all 12 mirrored hand gestures plus `Orthodox Boxing Guard`, `Kneeling Supplicant`, `Contrapposto (David)`, and `Two-Handed Sword Guard`. Production server stopped cleanly afterward.

---

## 8. Phase 10 — Exaggerated Fisheye Dome Lens, Floating Safe-Distance Popovers & Zero-Duplication 5-Zone Studio HUD (Milestones 24–26)

### 8.1 Implemented Architecture & Features

- **Milestone 24 — Exaggerated `Fisheye` Dome Perspective (`src/types/anatomy.ts`, `src/utils/lensWarp.ts`, `src/components/CurvilinearLens.tsx`, `src/components/PerspectiveGuides.tsx`, `src/components/ViewportGizmo.tsx`, `src/components/StudioCanvas.tsx`, `src/utils/sceneSerialization.ts`):**
  - Replaced separate `4-PT` & `5-PT` camera presets with a unified `'fisheye'` (`Fisheye`) mode (`Home | 1-PT | 2-PT | 3-PT | Fisheye | Bookmarks`) while transparently migrating legacy scene JSON values (`'4-point'`, `'5-point'`, `'4pt'`, `'5pt'`) to `'fisheye'` in `parseCameraPreset`.
  - Added `getFisheyeOptics(k)` (`k ∈ [0.1, 1.0]`, ramping FOV from `56°` to `122°` and hemispherical dome angle `phi` from `0.30` to `1.35 rad`) alongside `getFisheyeReferenceDistance(k)` framing distance compensation in `CameraRig` (`minDistance = 1.0` in Fisheye mode, ViewCube clamp `Math.max(1.15, controls.distance)`).
  - Updated `CurvilinearLens.tsx` GLSL shader (`#include <tonemapping_fragment>` + `#include <colorspace_fragment>` + straight-alpha Transparent PNG export) and `PerspectiveGuides.tsx` SVG overlay (3 concentric dome ellipses + curved cardinal arcs + ticks), keeping inverse pointer raycasting and `TransformControls` pointer picking accurate across the warped lens.

- **Milestone 25 — Safe-Distance Unified Contextual Pop-Up (`src/components/JointControlPopover.tsx`, `src/components/AnatomyModel.tsx`, `src/components/StudioProps.tsx`, deleted `src/components/HandGesturePopover.tsx`):**
  - Replaced `HandGesturePopover.tsx` with `JointControlPopover.tsx` anchored beside the active bone, Core-mode hand (`Gestures | Wrist` tabs), IK handle, or Studio Prop at guaranteed safe clearance (`136px` desktop/tablet, `104px` mobile) while avoiding sidebar, ViewCube, right rail, and bottom dock bounds.
  - Replaced per-frame `useFrame` screen projection with a `cameraRestSeq` + selection/mode/viewport `useEffect` in `AnatomyModel.tsx` and `StudioProps.tsx` (`CameraControls` `'rest'` event listener in `StudioCanvas.tsx`), preventing mid-drag slider or gizmo popover jitter.

- **Milestone 26 — Zero-Duplication 5-Zone Studio HUD (`src/components/StudioRightRail.tsx`, `src/components/FloatingSidebar.tsx`, `src/components/StudioDock.tsx`, `src/app/page.tsx`):**
  - **Zone 1 (`FloatingSidebar.tsx`):** Controlled open/collapse (`isOpen` / `onToggleOpen`, mobile collapsed pill label **`Stage`**); stripped Active Joint Inspector, Joint & Rig, Physics & Floor, Studio Lighting, and Prop Gizmo; renders inline Lock ONLY on `!isSelected` Scene Figure rows; retains **Scene Figures**, **Pose Presets** (search, categories, `Expand Gallery`, 50 poses, `Mirror L↔R`), **Studio Props**, **Scene & Files** (`Save Scene`, `Load Scene`, `Save Pose`, `Load Pose`, `New Blank Scene`), **Anatomy Layers** (`Soon`), and **PwaStatusFooter**.
  - **Zone 2 (`ViewportGizmo.tsx`):** 26-zone ViewCube + `Home | 1-PT | 2-PT | 3-PT | Fisheye | Bookmarks` + contextual `Fisheye Dome` & `Perspective Guides` card.
  - **Zone 3 (`StudioRightRail.tsx` *(new)*):** Compact right-edge vertical icon rail opening one frosted popover at a time for **Physics & Floor** (`Gravity Physics`, `Joint Damping`, `Clear All Pins`, `Ground Floor`, `Ground Snap`, `Elevation (Y)`, `Drop`), **Studio Lighting** (`Key Azimuth`, `Key Elevation`, `Key Intensity`, `Reset Light`), and **Studio Theme** (`White | Gray | Dark`).
  - **Zone 4 (`StudioDock.tsx`):** Streamlined high-frequency dock containing ONLY `FK | IK`, split `Joints` (`Core ↔ Off` toggle + `Joint Display Options` chevron popover with `Core | All | Off` & `Joint Limits`), `Move`, active `Lock`, `Undo`, `Redo`, `Reset`, `Snapshot`, and `?`.
  - **Zone 5 (`JointControlPopover.tsx`):** Floating contextual controls with non-racy `onMannequinAnchorChange` / `onPropAnchorChange` arbitration and single-active-popover `Escape` / background pointer dismissal in `src/app/page.tsx`.

### 8.2 Phase 10 Final Verification Outputs

- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`NO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `312 kB`, First Load JS `399 kB`, `0` TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=26f4acb1eb4a`, `27 URLs`).
- **Headless Chrome Multi-Viewport & Offline CDP QA (`npm run start` + `verify_phase10_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`):
  - **Fisheye Dome & Picking:** Verified `'4-PT'`/`'5-PT'` removed and `'Fisheye'` active; confirmed dynamic dome ellipses (`3`) + paths (`10`) in `PerspectiveGuides`, distinct visual frames across `1-PT`, `Fisheye 20%`, and `Fisheye 100%`, guides toggle, inverse pointer raycasting selecting `thigh_r` under `100%` Fisheye, and **Fisheye Transparent PNG** export (`2880×1800`, `cornerAlpha: 0`, `centerAlpha: 255`).
  - **Safe-Distance Contextual Popover & Unified Hand Card:** Picked `upperarm_l` at `134px` safe clearance (`overlapsSidebar: false`, `overlapsDock: false`, `overlapsRail: false`) with zero `left`/`top` drift during continuous axis slider dragging; verified `hand_l` in `Core` mode exposes `Gestures | Wrist` tabs (`Peace`, wrist sliders, `Mirror L → R`, `Ctrl+Z` Undo back to Peace, `Escape` dismissal).
  - **5-Zone Zero-Duplication & Inline Lock Audit:** Confirmed Left Panel excludes Joint & Rig / Active Joint Inspector / Physics & Floor / Studio Lighting while containing **Scene & Files**; confirmed Bottom Dock excludes Theme / Gravity / Ground while opening `Joint Display Options` popover; confirmed `inlineLockAudit` (`fig1HasInlineLock: true`, `fig2ActiveHasInlineLock: false`); confirmed Right Rail single-popover exclusivity across Physics, Lighting, and Theme (`White | Gray | Dark`).
  - **Responsive & Offline PWA:** Passed horizontal overflow and HUD non-overlap checks across all 5 target viewports (`desktop_1440x900`, `phone_412x915` with `STAGE` pill, `phone_land_915x412` including open Physics & Floor compact-landscape popover, `tablet_1280x800`, and `tablet_port_800x1280`), visually verified captured PNG screenshots, and confirmed offline reload (`Offline Mode`) cleanly boots with an active WebGL mannequin canvas. Production server stopped cleanly afterward (`no background tasks running`).

### 8.3 Foveated Dual-Pass Fisheye Render Quality Upgrade

- **Root Cause & Fix (`src/components/CurvilinearLens.tsx`):** Eliminated `3.3×` central bilinear blur and outer floor-grid aliasing at high Fisheye dome settings by upgrading `CurvilinearLens.tsx` to a **foveated dual-pass renderer**:
  - Allocates a lazy zoomed `centerTargetRef` (`centerZoom = Math.min(3.15, tan(phi)/phi)`) whenever `tan(phi)/phi > 1.22`, temporarily pausing `gl.shadowMap.autoUpdate` and `scene.matrixWorldAutoUpdate` on the second render pass to reuse Pass 1 shadows and bone transforms with zero idle overhead.
  - Composites both buffers in GLSL using **5-tap optimized Catmull-Rom reconstruction** (`0.72` sharpness weight with 4-texel min/max anti-ringing guard on Transparent PNG cutouts), **4-tap Rotated-Grid Supersampling (`RGSS`)** when outer screen-space texel footprint exceeds `1.35`, and a smooth `0.76 -> 0.97` overlap blend band (`dFdx`/`dFdy` computed in uniform control flow).
- **Verification Outputs:**
  - `node scripts/validatePoses.mjs` + `grep -rn "console\.log" src/` + `rm -rf .next && npm run build`: Exited `0` (`/` `314 kB`, First Load JS `401 kB`, `Generated public/sw-precache.json (version=f552bca7f115, 27 URLs)`).
  - `verify_fisheye_hq.mjs`: Exited `0` (`"status": "PASS"`, `fisheyeRenderMs: 345`, `idleGlDrawCallsIn1500ms: 0`, `consoleErrorCount: 0`, `webglWarningCount: 0`, `pageExceptionCount: 0`); visually verified crisp `100%` Fisheye renders across `White`, `Gray`, and `Dark` themes (`fisheye_hq_white_100.png`, `fisheye_hq_gray_100.png`, `fisheye_hq_dark_100.png`).
  - `verify_phase10_cdp.mjs`: Exited `0` (`"status": "PASS"`, `transparentPngFisheye` `2880×1800` `cornerAlpha: 0, centerAlpha: 255`, `consoleErrorCount: 0`, `pageExceptionCount: 0`). Production server stopped cleanly afterward.

## 9. Phase 11: Multi-Model Pipeline, Universal Rig Adapter, Skeleton Mode & Multi-Model Offline PWA (Milestones 27–29)

### 9.1 Staged & Optimized Rigged Models (`public/models/`)

All four new GLB assets from `/home/sheen/Documents/Mortal Mesh/models/` were cleaned in Blender 4.0.2, reparented where skeletons had disconnected chains, compressed with `KHR_draco_mesh_compression` via `@gltf-transform/cli`, and staged alongside `anatomy.glb` (`4.2 MB` total across all 5 models):

| Model ID | Label | File | Size | Triangles | Skeleton / Mapping | Blender Reparenting & Cleanup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `classic` | Classic | `public/models/anatomy.glb` | `604K` | `13,743` | `65` joints (`52` canonical mapped) | Preserved untouched as canonical rig reference |
| `mannequin-2` | Mannequin 2 | `public/models/mannequin-2.glb` | `172K` | `41,004` | `55` `Bip001` joints (`51/52` mapped; `spine_02` folded 50/50 into `spine_01` + `spine_03`) | Stripped `Take 001`; fixed `Bip001 L/R Thigh -> Bip001 Pelvis_04` and `Bip001 L/R Clavicle -> Bip001 Spine1_06`; Draco compressed (from `2.51 MB`) |
| `mannequin-3` | Mannequin 3 | `public/models/mannequin-3.glb` | `1.7M` | `28,880` | `66` `mixamorig1:*` joints (`52/52` mapped) | Stripped `mixamo.com` clip; converted `KHR_materials_pbrSpecularGlossiness` to standard PBR; Draco compressed (from `3.35 MB`) |
| `female` | Female | `public/models/mannequin-female.glb` | `190K` | `30,350` | `53` Mixamo joints (`52/52` mapped) | Stripped animations; Draco compressed (from `1.49 MB`) |
| `skeleton` | Skeleton | `public/models/skeleton-rig.glb` | `1.6M` | `93,575` | `238` joints (`52/52` canonical mapped via `71` vertebral + limb segments) | Decimated `0.35` keeping all `6` bone textures; fixed `HEAD_29 -> VERTEBRAE_C1(atlas)_36`, `RADIUS.R_88`/`ULNA.R_89 -> MCH_forearm.R_124`, and `10` `MCH_toe*Pivot.L/R -> MCH_toes.L/R`; Draco compressed (from `14.56 MB`) |

### 9.2 Implemented Architecture & Features

- **Milestone 27 — Canonical Reference & GLB Optimization (`src/rig/canonicalReference.ts` *(new)*):** Extracted `CANONICAL_REST_LOCAL_QUATS` and `CANONICAL_REST_WORLD_QUATS` across all `52` canonical poseable joints from `public/models/anatomy.glb`.
- **Milestone 28 — Universal `RigAdapter`, Multi-Model Cached Loader & Serialization (`src/data/modelCatalog.ts` *(new)*, `src/rig/rigAdapter.ts` *(new)*, `src/components/AnatomyModel.tsx`, `src/physics/runtimeIK.ts`, `src/physics/gravitySolver.ts`, `src/types/scene.ts`, `src/types/sceneIO.ts`, `src/utils/sceneSerialization.ts`):**
  - Added `MODEL_CATALOG`, `MODEL_ORDER`, and `isMannequinModelId`; extended `MannequinRecord` & `SerializedMannequin` with backward-compatible `modelId` (defaulting legacy scenes to `'classic'`) and optional `previousModelId`.
  - Built `RigAdapter` (`src/rig/rigAdapter.ts`) with `THREE.PropertyBinding.sanitizeNodeName` bone resolution (resolving spaces, Mixamo `:`, and Blender `.` suffixes without collisions), automated A-Pose -> T-Pose arm/forearm/pronation calibration (`calibrateArmSideToTPose`), world-basis quaternion conjugation (`alignQuat = W_m^-1 * W_c`), multi-vertebra chain distribution on `skeleton` (`spine_01..03`, `neck_01`), and `spine_02` folding on 2-spine `mannequin-2`.
  - Upgraded `AnatomyModel.tsx` to cache GLTF+DRACO templates per `modelId`, calibrate T-Pose `Box3` normalization (`fitScale = 2.0 / size.y`), render non-blocking per-figure loading badges while existing figures remain live, route FK gizmos through canonical `boneGizmoProxyRef`, preserve natural/textured materials under `'classic'` while tinting `'slate'`/`'ivory'`/`'clay'`, and pass `rigAdapter` through `solveLimbIK`, `JointSpaceGravitySolver`, pose presets, hand gestures, mirror, and snapshot capture/restore.
- **Milestone 29 — Model Selector UI, Skeleton Mode & Multi-Model Offline PWA (`src/components/FloatingSidebar.tsx`, `src/components/JointControlPopover.tsx`, `src/app/page.tsx`, `scripts/generatePrecache.mjs`, `public/sw.js`, `src/components/PwaManager.tsx`, `vercel.json`, `next.config.mjs`):**
  - Added compact wrapping per-figure **Model** selector buttons (`Classic | M2 | M3 | Female | Skeleton`), unselected figure short badges, `Finish: Bone` labeling on `skeleton`, functional **Skeleton Mode** toggle (`#anatomy-skeleton-mode-toggle`) under **Anatomy Layers** (replacing `Soon`, restoring `previousModelId` on toggle-off), and a `hasFingerBones` guard in `JointControlPopover.tsx`.
  - Updated `scripts/generatePrecache.mjs` + `public/sw.js` + `src/components/PwaManager.tsx` to precache `/` + `anatomy.glb` immediately while background-warming the 4 additional `.glb` models (`optionalModelUrls`, `WARM_ALL_MODELS`, `SW_MODELS_CACHE_STATUS`) and displaying `Offline Ready (5/5 Models)`; configured `Content-Type: model/gltf-binary` + immutable cache headers for `/models/*` in `vercel.json` and `next.config.mjs`.

### 9.3 Phase 11 Final Verification Outputs

- **TypeScript (`npx tsc --noEmit`):** Exited `0` (`0` errors).
- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`NO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `321 kB`, First Load JS `408 kB`, `0` TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=17c5c6062f0a`, `27` core URLs + `4` optional models).
- **Headless Chrome Multi-Model, Visual & Offline QA (`npm run start` + `verify_phase11_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`, `networkFailureCount: 0`):
  - **GLB MIME & Precache:** Verified HTTP `200` + `Content-Type: model/gltf-binary` across all 5 `.glb` assets and `Offline Ready (5/5 Models)` in Sidebar footer.
  - **5 Models × Poses Visual Matrix:** Switched live across `classic`, `mannequin-2`, `mannequin-3`, `female`, and `skeleton` through `T-Pose`, `Contrapposto (David)`, `Action Lunge`, and `The Thinker (Rodin)` and visually verified all captured PNG renders (accurate alignment, zero detached bones, `Finish: Bone` on Skeleton, zero pill text truncation).
  - **Skeleton Mode, FK/IK, Gestures & Fisheye 100%:** Confirmed `Skeleton Mode` toggles `Female ↔ Skeleton` while preserving `Contrapposto`; verified FK axis slider adjustment (`lowerarm_l`), Hand Gestures (`Peace`), live `hand_l` IK handle dragging, and `Fisheye 100%` Transparent PNG export (`cornerAlpha: 0`, `centerAlpha: 255`) on `Skeleton`.
  - **Mixed Multi-Figure Gravity, Scene JSON & Responsive Layouts:** Verified `Female` (Locked) + `Skeleton` (`Action Lunge`, Gravity ON), `Save Scene` JSON exporting `["female", "skeleton"]`, `localStorage` autosave reload preservation, and zero overflow/overlap across `1440×900`, `412×915`, `915×412`, `1280×800`, and `800×1280`.
  - **Full Offline Multi-Model Switching:** Reloaded under CDP offline emulation (`Offline Mode`) and switched Figure 2 across `["female", "mannequin-2", "skeleton"]` completely offline with `0` console errors, `0` page exceptions, and `0` app/model network failures.
- **Phase 10 Regression Suite (`verify_phase10_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `transparentPngFisheye` `2880×1800` `cornerAlpha: 0, centerAlpha: 255`, `consoleErrorCount: 0`, `pageExceptionCount: 0`). Production server stopped cleanly afterward.

---

## 10. Phase 12: Clean Mobile UI, Studio Tap-to-Minimize Zen Mode, Precision Joint Pin-Rings & Custom Arc Rotation Gizmo

### 10.1 Delivered Systems & UX Refinements

- **Non-Distracting Precision Joint Pin-Rings (`src/components/JointRingMarkers.tsx`, `src/data/studioThemes.ts`):**
  - Replaced bulky filled dark spheres with camera-facing GLSL SDF anti-aliased hollow pin-rings (`PlaneGeometry(1, 1)` + crisp contrasting outer hairline, core diameter `0.027m` / finger `0.014m`, transparent center letting surface musculature and joints stay visible).
  - Visual states via uniforms: idle translucent ring (`uState=0`), hover glow (`uState=1`), selected pinpoint dot (`uState=2`), double-ring pinned (`uState=3`), `0.24x` dimming of unselected joints on active selection, and complete fade-out of unselected rings during active FK arc dragging (`isDraggingFK`).
  - Expanded `StudioThemeHitboxColors` across `White`, `Gray`, and `Dark` themes (`ringIdleColor`, `ringIdleOpacity`, `ringContrastColor`, `ringHoverColor`, `ringSelectedColor`, `ringPinnedColor`) paired with generous invisible hit-sphere colliders (`0.042m` desktop / `0.058m` coarse core; `0.02m` / `0.032m` fingers).
- **Custom Studio Joint Arc Rotation Gizmo (`src/components/JointArcGizmo.tsx`, `src/components/AnatomyModel.tsx`, `src/components/StudioCanvas.tsx`):**
  - Replaced stock Three.js `<TransformControls mode="rotate" />` with an aesthetic, studio-matched 3-axis intrinsic-Euler rotation arc gizmo (`mortal-mesh-arc-gizmo` inside `mortal-mesh-gizmo` for clean exclusion from Transparent/Studio PNG exports), using muted architectural axis colors (`gizmoX`, `gizmoY`, `gizmoZ`).
  - Computes exact intrinsic Euler axis world frames (`XYZ` limbs and `YZX` pelvis) directly from `rigAdapter.getCanonicalRestWorldQuat` + current canonical angles so dragging axis `a` mutates only `angles[a]` through `clampJointAngles`, eliminating cross-axis drift and ±180° Euler gimbal flips.
  - Combines face-on ray-plane `atan2` rotation (with curvilinear Fisheye inverse pointer warp via `screenNdcToSourceNdc`) and smooth screen-tangent projection when grazing edge-on (`|axisWorld · viewDir| <= 0.28`), plus live frosted degree readout (`[data-testid="gizmo-angle-readout"]`), translucent swept angle wedge, ROM span indicator, active radial needle, synchronous `CameraControls` locking on drag start (`enabled=false; cancel(); stop()`), floor-penetration-only guard mid-drag (re-snapping once on release), and memoized `InfiniteStudioFloor` tuple props so the CAD floor grid never flickers during drag.
- **Studio Tap-to-Minimize Zen Mode (`src/components/StudioCanvas.tsx`, `src/components/AnatomyModel.tsx`, `src/app/page.tsx`):**
  - Tapping empty studio space (single pointer `< 8px` travel, not multi-touch, `>= 220ms` after any orbit/gizmo drag end) cleanly fades & slides out all floating chrome (`FloatingSidebar`, `ViewportGizmo`, `StudioRightRail`, `StudioDock`, and active popovers) and exposes a compact translucent top-left restore pill (`[data-testid="restore-hud-pill"]`, `"Controls"`).
  - Tapping/clicking the 3D mannequin mesh (`instance.rootGroup` yielding automatically when `event.intersections` includes `mortal-mesh-hitboxes`, `mortal-mesh-ik-handles`, or `mortal-mesh-gizmo`), dragging camera orbit, or pinching never triggers Zen Mode; tapping empty space again, pressing `Escape`, or clicking `"Controls"` restores the studio HUD.
- **Mobile Clean-Canvas UI (`src/components/ViewportGizmo.tsx`, `src/components/JointControlPopover.tsx`, `src/components/StudioDock.tsx`):**
  - Compacted phone/compact-landscape top-right chrome into a `46px` ViewCube (`64×64px` stage) plus a single `Camera & Lens` trigger pill (`[data-testid="compact-camera-trigger"]`, showing e.g. `Fisheye · 70%`) and bookmark button opening an on-demand popover (removing the permanent `Fisheye Dome` card on mobile while adding a close button on desktop).
  - Converted phone contextual editing (`viewport.isMobile`) into an ultra-compact docked **Bottom Control Tray** (`left: 10px, right: 10px`) with 4-column hand gesture micro-grid, inline `Gestures | Wrist` tabs, single-axis pill + slider selector, and full unobstructed upper studio space (`79%` clear height on `412×915`), plus tightened mobile `StudioDock` padding to eliminate horizontal overflow (`dockOverflow: false`).

### 10.2 Phase 12 Final Verification Outputs

- **TypeScript (`npx tsc --noEmit`):** Exited `0` (`0` errors).
- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches (`ZERO_CONSOLE_LOG`).
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `327 kB`, First Load JS `415 kB`, `0` TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=fdc898936541`, `27` core URLs, `4` optional models).
- **Phase 12 Headless Chrome QA (`verify_phase12_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`):
  - Selected `upperarm_l` precision pin-ring (`x: 755, y: 334`), dragged `JointArcGizmo` with live frosted readout (`"Twist -32°"` -> final `y: -52°`) and zero cross-axis drift (`x: 0, z: 0`), verified `idleDrawCalls: 0` after release under `frameloop="demand"`, and verified `Fisheye 70%` arc gizmo + Transparent PNG cutout (`cornerAlpha: 0, centerAlpha: 255`).
  - Verified Desktop & Galaxy S25 Ultra (`412×915`) Zen Mode: empty studio tap minimizes HUD (`sidebarOpacity: "0"`, `dockOpacity: "0"`, `railOpacity: "0"`, `[data-testid="restore-hud-pill"]` shown), mannequin tap & orbit drag keep Zen active, and second empty tap restores HUD cleanly.
  - Verified Mobile (`412×915`) layout: compact camera pill (`"Fisheye · 70%"`, `hasBigLensCard: false`), zero overflow (`docOverflow: false, dockOverflow: false`), `hand_l` selection (`368, 338`) + `Peace` gesture inside docked Bottom Tray (`popHeight: 131`, `upperClearFraction: 0.79`, `overlapsDock: false`, `overlapsStage: false`). Visually inspected all 7 Phase 12 PNG screenshots (`p12_desktop_rings.png`, `p12_desktop_arc_gizmo.png`, `p12_desktop_arc_dragging.png`, `p12_desktop_fisheye_gizmo.png`, `p12_desktop_zen.png`, `p12_mobile_fisheye_clean.png`, `p12_mobile_hand_tray.png`, `p12_mobile_zen.png`).
- **Phase 11 & Phase 10 Regression Suites (`verify_phase11_cdp.mjs`, `verify_phase10_cdp.mjs`):** Both exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`, `networkFailureCount: 0`) covering all 5 `.glb` models, offline model switching, Skeleton Mode, FK/IK/gestures, Fisheye HDR/PNG export (`2880×1800`, `cornerAlpha: 0`), and 5-viewport zero-overlap layout audits. Production server stopped cleanly afterward (`0` background tasks remaining).

---

## 11. Phase 13: Studio IK Mode Overhaul (Reticles, Custom Move Gizmo, Direct Drag, Limb Swivel & Pelvis Squat)

### 11.1 Delivered Systems & UX Refinements

- **Billboarded Precision IK Reticles & 1-Gesture Direct Drag (`src/components/IKHandleMarkers.tsx`, `src/data/studioThemes.ts`):**
  - Replaced bulky 3D octahedron and horizontal-torus handles with camera-facing GLSL SDF billboarded target reticles (`uShape=0` hollow circle + 4 cardinal ticks for hands/feet, `uShape=1` hollow L1 diamond ring for pelvis, plus outer contrast hairline and idle/hover/selected uniforms) inside `mortal-mesh-ik-handles` for clean snapshot exclusion.
  - Added distance scaling in `useFrame`, calm focus dimming of non-selected handles, synchronous `CameraControls` locking (`enabled=false; cancel(); stop()`), Fisheye warp pointer mapping (`screenNdcToSourceNdc`), and 1-gesture screen-plane dragging (`>= 4px` pointer travel drags immediately without pre-selecting; `< 4px` tap selects).
- **Custom Studio IK Move Gizmo (`src/components/IKMoveGizmo.tsx`, `src/components/AnatomyModel.tsx`):**
  - Replaced stock Three.js `<TransformControls mode="translate" />` on IK handles with a custom `IKMoveGizmo` matching `JointArcGizmo`: muted architectural `+X/+Y/+Z` translation rails, edge-on/foreshortened collider hiding (scaling down AND swapping `raycast` to `NOOP_RAYCAST` because Three.js `Raycaster` ignores `visible = false`), conditional horizontal `XZ` floor-glide arc pad when viewing above horizon, slender center screen-plane drag ring (`[0.198, 0.222]`), frosted live delta pill (`[data-testid="ik-gizmo-readout"]`), live 2-bone limb chain beams (`ikChainColor`), terracotta elastic reach tether + ghost target ring when exceeding reach, and Fisheye inverse warp support.
  - Kept `<TransformControls>` for `Move` body mode and `<JointArcGizmo>` for FK mode untouched.
- **Stable Limb IK Refinement, Swivel & Pelvis Squat (`src/physics/runtimeIK.ts`, `src/types/poseIO.ts`):**
  - Upgraded `solveLimbIK` with continuous drag pole blending (`poleHintOverride`), smooth Hermite bend-plane blending, fine `[8, 2, 0.5]` float coordinate-descent refinement, symmetric elbow/knee swivel (`swivelDeg`), and extended metadata (`upperPos`, `lowerPos`, `achievedPos`, `reachRatio`, `isMaxReach`, `isClamped`, `resolvedPole`).
  - Added `solvePelvisSquatIK` for hip-led squatting/crouching with planted feet (`pinFeet`) and flat-floor ankle dorsiflexion leveling (`levelX`), plus floor-penetration-only guard mid-drag with single `recomputeGroundOffset(0)` settle on release to stop foot bounce.
  - Exposed `applyIKSwivel`, `resetIKLimb`, and `plantFootIK` on `PoseBridge`.
- **Practical Desktop & Mobile IK Contextual Controls (`src/components/JointControlPopover.tsx`, `src/app/page.tsx`, `src/components/StudioCanvas.tsx`):**
  - Added `ikPinFeet` (default `true`) and per-handle `ikSwivelByHandle` state in `page.tsx`, resetting swivels cleanly across preset/reset/scene/figure switches.
  - Upgraded desktop popovers and Galaxy S25 Ultra (`412×915`) docked Bottom Control Tray: Hand IK features `Gestures | Limb` tabs (preserving 1-tap `Gestures` default + `Mirror L → R` and adding `Elbow Swivel` + `Reset IK limb`), Foot IK adds `Knee Swivel` + `Plant` (`[data-testid="ik-plant-foot"]`) + `Reset IK limb`, and Pelvis IK adds `Pin Feet (Squat)` (`[data-testid="ik-pin-feet-toggle"]`) + `Drop` + `Reset`.
  - Memoized `StudioLighting`, `canvasBgArgs`, `canvasFogArgs`, and `StageReference` in `StudioCanvas.tsx` so unrelated UI toast timers trigger `0` idle WebGL draw calls under `frameloop="demand"`.

### 11.2 Phase 13 Final Verification Outputs

- **TypeScript (`npx tsc --noEmit`):** Exited `0` (`0` errors).
- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `VALIDATED 50 POSES (categories={"foundation":5,"classical":10,"action":10,"combat":8,"dance":8,"gesture":9}) + 12x2 HAND GESTURES (0 ROM/bone violations)`.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches.
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `334 kB`, First Load JS `421 kB`, `0` TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=37b05d559a6e`, `27` core URLs, `4` optional models).
- **Phase 13 Headless Chrome QA (`verify_phase13_cdp.mjs`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`):
  - **Direct 1-Gesture Drag & Readout:** Grabbed unselected `hand_l` reticle (`x: 885, y: 336`), dragged smoothly with frosted readout `"Left Hand · Δ66cm"`, verified `idleAfterDirectDrag: 0` draw calls, adjusted Elbow Swivel & `Reset IK limb`, and lifted + `Plant`ed `foot_l` (`x: 736, y: 638`).
  - **Pelvis Squat & Ankle Leveling:** Dragged `pelvis` center screen-plane ring (`x: 716, y: 452`) downward with `Pin Feet` ON (`"Pelvis · Squat -33cm"`, `idleAfterSquat: 0`), visually verified natural bent knees + flat planted feet in `p13_desktop_ik_pelvis_squat.png`.
  - **Fisheye 70% & Clean Transparent PNG Cutout:** Dragged `hand_l` (`x: 995, y: 235`) under `Fisheye` Dome `70%`, exported Transparent PNG (`cornerAlpha: 0, centerAlpha: 255`), and visually verified `p13_desktop_fisheye_ik.png`.
  - **Galaxy S25 Ultra (`412×915`) Compact IK Tray:** Verified `hand_l` tray (`popHeight: 101`, `upperClearFraction: 0.82`, `dockOverflow: false`, `overlapsDock: false`, `overlapsStage: false`) and `foot_l` tray (`popHeight: 98.75`, `upperClearFraction: 0.82`, `hasPlantBtn: true`, `hasSwivelSlider: true`), visually verified in `p13_mobile_ik_hand_tray.png` and `p13_mobile_ik_foot_tray.png`.
- **Phase 12, Phase 11 & Phase 10 Regression Suites (`verify_phase12_cdp.mjs`, `verify_phase11_cdp.mjs`, `verify_phase10_cdp.mjs`):** All three exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`, `networkFailureCount: 0`). Production server stopped cleanly afterward (`0` background tasks running).

---

## 12. Phase 14: Atelier Default, 3-Point Rembrandt Lighting & 2-Value Notan, Non-Destructive Proportion Morphs, Head-Unit Ruler, Composition Overlays & Reference Image HUD

### 12.1 Delivered Systems & Artist Workflow Enhancements

- **Milestone 30 — Classical Atelier Boot, 3-Point Lighting & 2-Value Notan (`src/data/lightingPresets.ts`, `src/utils/notanGradient.ts`, `src/components/StudioCanvas.tsx`, `src/components/StudioRightRail.tsx`, `src/components/AnatomyModel.tsx`, `src/components/StudioProps.tsx`, `scripts/generatePrecache.mjs`, `public/sw.js`):**
  - Updated fresh boot and `New Blank Scene` defaults in `src/app/page.tsx` and `src/types/scene.ts` (`createInitialMannequin(modelId = 'female')`) to open in **Neutral Gray** (`#686E78`, `rgb(104, 110, 120)`) with a matte `Ivory` **Female** mannequin (`public/models/mannequin-female.glb`) posed in `Contrapposto (David)` (`'contrapposto'`) and Rembrandt 3-point key/rim/fill lighting (`DEFAULT_KEY_LIGHT`: azimuth `42°`, elevation `48°`, key `1.85`, rim `0.75` @ `175°` offset, fill `0.38`).
  - Added 4 single-tap studio lighting presets in `src/data/lightingPresets.ts` (`Rembrandt`, `Chiaroscuro`, `Top-Down`, `Rim`) alongside `Rim Light`, `Fill Light`, `2-Value Shadow (Notan)` toggle, and `Shadow Split` (`20%–80%`) inside the exclusive `Studio Lighting` right-rail popover (`src/components/StudioRightRail.tsx`).
  - Implemented crisp hard-step `2-Value Shadow (Notan)` shading using a procedural `256×1` `THREE.DataTexture` (`NearestFilter`) in `src/utils/notanGradient.ts`, swapping materials to `THREE.MeshToonMaterial` with rim/fill suppression across all 5 mannequin rigs (`AnatomyModel.tsx`) and Studio Props (`StudioProps.tsx`) with clean restoration and disposal.
  - Promoted `/models/mannequin-female.glb` into `CORE_URLS` alongside `/models/anatomy.glb` inside `scripts/generatePrecache.mjs` (`public/sw.js` + `src/components/PwaManager.tsx`), leaving 3 optional models in `OPTIONAL_MODEL_URLS` (`28` core URLs, `3` optional models, `0` duplicate URLs, `Offline Ready (5/5 Models)`).
- **Milestone 31 — Non-Destructive Proportion Morphs & Live Head-Unit Ruler (`src/data/proportions.ts`, `src/rig/rigAdapter.ts`, `src/physics/runtimeIK.ts`, `src/components/JointArcGizmo.tsx`, `src/components/FloatingSidebar.tsx`, `src/components/HeadUnitRuler.tsx`):**
  - Added `FigureProportions` (`headScale`, `shoulderWidth`, `torsoLength`, `hipWidth`, `limbLength`), clamping/equality helpers, and 3 canon presets (`6.5H` Stylized, `7.5H` Natural, `8.5H` Heroic) in `src/data/proportions.ts`, with backward-compatible Scene JSON round-trip (`src/types/sceneIO.ts`, `src/utils/sceneSerialization.ts`) and Pose JSON serialization (`src/types/poseIO.ts`, `src/utils/poseSerialization.ts`).
  - Added depth-sorted top-down non-cascading hierarchical bone scaling (`applyProportions` / `syncProportionScales`) across all 5 skeletons (including multi-segment torso bones and `skeleton-rig.glb` intermediate thorax nodes) inside `src/rig/rigAdapter.ts`, preserving unstretched hands/feet/joints and feeding live IK segment re-measurement in `src/physics/runtimeIK.ts`.
  - Built the collapsible `Proportions` sub-drawer under each active figure inside `FloatingSidebar.tsx` (disabled when figure is locked, single Undo/Redo commit on slider release or preset tap) and projected live SkinnedMesh world bounds + optional Fisheye warp into `src/components/HeadUnitRuler.tsx` (excluded cleanly from PNG exports).
- **Milestone 32 — Exclusive `Guides & Ref` Right-Rail Hub & Viewport Overlays (`src/components/StudioRightRail.tsx`, `src/components/CompositionOverlay.tsx`, `src/components/ReferenceOverlay.tsx`):**
  - Added `Guides & Ref` as the 4th exclusive right-rail popover (`FrameGuidesIcon`, `RulerIcon`, `ImageIcon` in `StudioPrimitives.tsx`): `Head-Unit Ruler` toggle, `Composition Frame` (`Off | 4:5 | 16:9 | 1:1 | 9:16`), `Composition Grid` (`Off | Thirds | Cross | Golden` + `Flip Spiral`), and 100% client-side local `Reference Image` loader with `Backdrop` (click-through `pointer-events: none` when locked, drag-repositionable when unlocked) vs draggable/minimizable `Corner PiP` card, plus `Opacity`, `Scale`, `Flip H`, `Lock`, `Remove`, and `URL.revokeObjectURL` cleanup.

### 12.2 Phase 14 Final Verification Outputs

- **TypeScript (`npx tsc --noEmit`):** Exited `0` (`0` errors).
- **Pose & Hand Gesture Validation (`node scripts/validatePoses.mjs`):** Exited `0` — `50` poses + `12x2` hand gestures, `0` violations.
- **Log Audit (`grep -rn "console\.log" src/`):** Zero matches.
- **Production Build (`rm -rf .next && npm run build`):** Exited `0` (`/` `345 kB`, First Load JS `432 kB`, `0` TypeScript/ESLint errors), generated `public/sw-precache.json` (`version=1442cc2006d0`, `28` core URLs, `3` optional models, `0` duplicate URLs).
- **Phase 14 Headless Chrome QA (`verify_phase14_cdp.mjs` against `npm run start`):** Exited `0` (`"status": "PASS"`, `consoleErrorCount: 0`, `pageExceptionCount: 0`, `networkFailureCount: 0`):
  - **Atelier Default & Demand Rendering:** Confirmed Gray (`rgb(104, 110, 120)`), `Female`, `Ivory`, `Contrapposto (David)`, and `idleAtelier: 0` / `idleAfterNotan: 0` WebGL draws.
  - **3-Point Lighting, Notan & Fisheye PNG Export:** Cycled all 4 lighting presets, toggled `2-Value Shadow (Notan)` + `Shadow Split` (`0.3` → `0.7`), and exported Transparent PNG under `Fisheye 70%` (`cornerAlpha: 0, centerAlpha: 255`).
  - **Proportions & Cross-Rig Skeleton Scaling:** Verified live Head-Unit Ruler updates across canon presets (`stylized: "5.9 Heads · 187cm"`, `natural: "7.1 Heads · 196cm"`, `heroic: "8.6 Heads · 209cm"`) and switched cleanly to `Skeleton` (`"8.7 Heads · 210cm"`) with intact ribs/spine, plus Scene JSON save/load round-trip.
  - **Guides & Ref Overlay + Core Regressions:** Verified `4:5` composition frame, `Thirds` + `Golden` spiral flip, local reference `Backdrop` click-through (`upperarm_l` pick passed through locked backdrop), `Corner PiP` card, Zen Mode empty-tap minimize/restore, FK ring selection, IK direct drag (`"Left Hand · Δ39cm"`), and Pelvis squat (`"Pelvis · Squat -30cm"`).
  - **Zero-Duplication, 5-Viewport Audit & Offline SW Reload:** Verified zero HUD duplication (`4` right-rail buttons), zero overflow/overlap across `1440×900`, `412×915`, `915×412`, `1280×800`, and `800×1280`, offline reload preserving Gray atelier, `8.6 Heads · 209cm`, `4:5` crop, and `"Offline Mode"`, and visually inspected all 9 Phase 14 screenshots (`p14_atelier_default.png`, `p14_notan_gray.png`, `p14_notan_fisheye.png`, `p14_proportions_heroic_ruler.png`, `p14_proportions_skeleton.png`, `p14_guides_ref_backdrop.png`, `p14_guides_ref_pip.png`, `p14_mobile_atelier.png`, `p14_mobile_guides_popover.png`). Production test server stopped cleanly afterward (`0` background tasks running).
