# Mortal Mesh — Project Progress & Handoff Guide

**Last Updated:** 2026-11-24  
**Status:** Phase 8 Complete — Milestones 17–20 Built, Validated & Production-Offline Verified  
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
