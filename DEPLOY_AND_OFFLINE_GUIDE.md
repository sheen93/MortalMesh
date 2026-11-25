# Mortal Mesh — Vercel Deploy & Android Offline App Guide

Everything in **Phase 8 (Milestones 17–20)** was implemented, built, and verified in production & offline Chromium overnight.

---

## What Was Completed Overnight

- **Live Two-Bone IK Mode (`IK` / `I` hotkey):** Real-time 3D analytical IK (`hand_l`, `hand_r`, `foot_l`, `foot_r`, `pelvis`) with distinct diamond/ring handles, body-aligned natural elbow/knee poles, ROM limits, single-step Undo/Redo commits on release, Gravity waking, and full immunity on locked figures.
- **Scalable Studio Props (`0/12` -> `12/12`):** Spawn `Box / Block`, `Stool / Seat`, `Cylinder / Column`, `Sphere`, and `Staff / Pole` with `Move | Rotate | Scale` gizmos, `Lock`, `Hide`, `Drop Floor`, `Reset Scale`, and clean inclusion in PNG snapshots (gizmos hidden automatically).
- **Full Scene Save/Load (`.json`), Camera Bookmarks (`8` views) & Auto-Recovery:** Export/import complete multi-figure + prop + lighting + camera scenes (`mortal-mesh-scene` v1) as well as legacy single-pose JSON files, save up to `8` smooth camera views in the top-right **ViewCube** bar, and auto-save edits to `localStorage` (`mortal-mesh:autosave:v1`) across reloads.
- **Galaxy S25 Ultra & Galaxy Tab S8 Responsive Touch UI:** `100dvh` safe-area layout (`env(safe-area-inset-*)`), collapsed top-left **Tools** overlay drawer on phones (`< 768px` & compact landscape), docked tablet sidebar, `46px`/`60px` responsive ViewCube, 1/2/3-finger touch CameraControls, expanded `~2x` coarse-pointer hit colliders for finger/S-Pen posing, and live `orientationchange` WebGL reflow.
- **True Offline-First PWA:** Generated crisp monochrome app icons (`public/icons/`), `public/manifest.webmanifest`, post-build asset precache manifest (`public/sw-precache.json`), native Service Worker (`public/sw.js`), production-only SW registration + `Offline Ready` / `Offline Mode` badge + **Install App** button (`src/components/PwaManager.tsx`), and strict caching headers in `next.config.mjs` + `vercel.json`.

**Overnight Automated Verification Summary:**
- `node scripts/validatePoses.mjs` -> `0` ROM/bone violations across all 50 poses.
- `grep -rn "console\.log" src/` -> zero matches.
- `rm -rf .next && npm run build` -> exited `0` (`/` `303 kB`, First Load JS `390 kB`), generated `public/sw-precache.json` (`27` precached URLs including `/`, `/models/anatomy.glb`, `/draco/draco_decoder.wasm`, `/icons/*`, and `/_next/static/*`).
- Headless Google Chrome CDP true-offline proof against `npm run start`: confirmed active `/sw.js` cache hits, `Offline Ready`, Android-installability (`Install App` button triggered), `setOffline(true)` + full reload booting directly to **`Offline Mode`** with WebGL mannequin, autosaved props/bookmarks, `IK` mode, and `0` console/page errors, plus verified responsive layouts across `1440x900`, `412x915`, `915x412`, `1280x800`, and `800x1280`.

---

## Step 1 — Optional Local Production Preview

Because Service Workers only register in production builds (`NODE_ENV === 'production'`), preview offline mode locally using `npm run start` rather than `npm run dev`:

```bash
rm -rf .next && npm run build && npm run start
```

Open `http://localhost:3000` in Chrome. Wait a second until the bottom of the sidebar shows **`Offline Ready`**. Stop anytime with `Ctrl+C`.

---

## Step 2 — Push to GitHub & Deploy to Vercel (Free HTTPS)

> **Why HTTPS is required:** Android **Google Chrome** and **Samsung Internet** only allow Service Workers and Home Screen PWA installation over **HTTPS** (or `localhost` on the same machine). Opening a local HTTP LAN address like `http://192.168.1.x:3000` from your phone will **not** activate `/sw.js` or show the **Install App** prompt.

### 2A. Push to GitHub

If this folder is not yet connected to a GitHub repo, initialize/commit and push from `/home/sheen/MortalMesh`:

```bash
git status
git add .
git commit -m "Phase 8: live two-bone IK, studio props, scene I/O, mobile touch UI, offline PWA"
# Replace <your-github-repo-url> with your empty GitHub repo URL if no remote is configured:
# git remote add origin <your-github-repo-url>
git push -u origin main
```

*(Run `node scripts/validatePoses.mjs` anytime after editing poses; `npm run build` automatically refreshes `public/sw-precache.json` on Vercel during deploy.)*

### 2B. Deploy to Vercel (3 Clicks)

1. Sign in at Vercel (`https://vercel.com/new`) and click **Add New… -> Project**.
2. Import your `MortalMesh` GitHub repository (`vercel.json` is already configured — keep default Framework Preset **Next.js** and Build Command `npm run build`, zero environment variables needed).
3. Click **Deploy**. In ~60 seconds you'll get a free `https://<your-app>.vercel.app` URL.

---

## Step 3 — Install on Samsung Galaxy S25 Ultra & Galaxy Tab S8

Open your Vercel `https://...` URL on both devices **once while on Wi-Fi/5G**, wait **3–5 seconds** for the mannequin to load, and open **Tools** (phone) or look at the left sidebar footer (tablet) to verify the badge reads **`Offline Ready`**.

### Option A: Google Chrome (Android)
1. Tap the in-app **Install App** button in the bottom of the **Tools / Sidebar** drawer *(if visible)* — **or** tap Chrome's **`⋮` (top-right menu) -> Add to Home screen -> Install**.
2. Confirm **Install**.
3. **Mortal Mesh** now appears in your Samsung app drawer / home screen with its dark monochrome cube icon and launches fullscreen without the browser address bar.

### Option B: Samsung Internet (S25 Ultra & Tab S8)
1. Open the Vercel URL in **Samsung Internet**.
2. Confirm **`Offline Ready`** appears at the bottom of the sidebar/drawer.
3. Tap the **Menu (`≡`, bottom-right)** -> **Add page to** -> **Home screen** *(or tap the **Install** `+` download icon in the address bar if shown)*.
4. Launch **Mortal Mesh** from your Home screen.

---

## Step 4 — Airplane Mode Test & Touch / S-Pen Cheat Sheet

### Quick Offline Verification
1. Open the installed **Mortal Mesh** app icon once while online, check **`Offline Ready`**, then close it.
2. Turn **Airplane Mode ON** on your S25 Ultra and Tab S8.
3. Re-open **Mortal Mesh** from the Home screen:
   - The app launches fullscreen cleanly with the **`Offline Mode`** indicator, 3D mannequin, all 50 poses, Studio Props, IK/FK posing, PNG Snapshot export, and automatic local scene autosave working offline.

### Touch & S-Pen Controls Cheat Sheet
- **1-Finger Drag (empty canvas):** Orbit camera around figure
- **2-Finger Pinch / Drag:** Zoom in/out & pan simultaneously
- **3-Finger Drag:** Screen pan
- **Tap Joint Dot (FK) or Diamond/Ring (IK) / S-Pen Hover & Drag:** Select & pose limb directly (expanded invisible touch hitboxes activate automatically on touchscreens; dragging a gizmo locks camera orbit until release)
- **Bottom Quick Dock:** Switch themes (`White` / `Gray` / `Dark`), toggle **`FK | IK`**, toggle **`Joints`**, **`Gravity`**, **`Ground`**, **`Move`**, **`Lock`**, **`Undo / Redo`**, **`Reset`**, and **`Snapshot`**
- **Top-Right ViewCube & Bookmark Bar:** Tap `FRONT / RIGHT / TOP` or drag the cube to orbit; tap the **Bookmark** icon to save/recall up to `8` camera angles
- **Rotate Screen:** Portrait and landscape transitions reflow the HUD and WebGL canvas automatically without clipping

### How Updates Sync Later
Whenever you push updates to GitHub and Vercel redeploys, simply open Mortal Mesh while connected to Wi-Fi — `/sw.js` detects the new build (`public/sw-precache.json`), downloads updated chunks quietly in the background, and refreshes the offline cache automatically.
