# Stand Cheer Simulator

A browser-only choreography editor for a 6 × 12 school sports-day stand. Built with React, TypeScript, and Three.js; no backend or downloaded models.

## Run

```sh
npm install
npm run dev
```

Open the Vite URL. `npm run build` creates the production app in `dist`; `npm run preview` serves it. `npm run test` runs the domain/state regression tests.

## Editing

- Click a student, row, or column. Shift adds/removes selection; dragging empty space creates a marquee. All/None operate on the complete stand.
- Drag a cyan hand to pose; use camera views or the XYZ gizmo for depth. Click an elbow label to activate bend editing. Elbows preserve the hand target; both arm segments stay 0.40 units long.
- Right drag or Alt+left drag orbits, middle drag pans, and the wheel zooms. Orbit mode also uses left drag.
- Group edits copy body-relative values, not permanent groups. A subsequent individual edit stays independent.
- The inspector controls both arms, wrist rolls, copy/paste, mirror/reset, and global glove colors. Palm and back are opposite physical glove surfaces.
- Pose provides ten editable presets. Pattern generates Wave, Gradient, Alternate, or paired Mirror Formation poses for the current selection/time.

## Animation and projects

Add Keyframe captures **all 72 students**, not just the selection. Pose edits do not change stored keys until Add/Update Keyframe is used. Leaving an unkeyframed pose in a keyed project asks whether to capture, discard, or cancel. Keys snap to 1/30 second. Smooth interpolation blends targets and shortest-arc wrist roll; Step holds the earlier key.

Undo/redo covers editing, not selection/camera/playback navigation. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z operate outside text fields. Ctrl/Cmd+S saves locally.

Project → Save/Load uses this browser's local storage. Initial launch always opens a new stand. Export/Import JSON includes schema version 1, project name, global colors, all working poses, duration/playhead/interpolation, and full-stand keyframes. Invalid imports are rejected before replacing the editor; storage failures leave JSON export available. Use export for portable backups.

## Verification and performance

The domain/state suite has 66 regression tests covering IK bone lengths, independent group edits, snapshots, transactions, patterns, interpolation, keyframe errors, and atomic validation. Real Chromium interactions exercised hand and gizmo drags, elbow control, selection, cameras, glove faces, timeline playback, save/load, and downloaded JSON roundtrips. Layouts were checked at 1440×900, 1280×800, and 1024×768.

The renderer uses shared instanced geometry, demand-driven RAF, reusable pose/math buffers, no shadows/postprocessing, and a 1.25 pixel-ratio cap. A ten-second 72-student playback measurement in the available managed Chromium reported **65.7 ms average / 74.8 ms p95**, with **57 draw calls**. This is below the approximate 60 FPS target; hardware/browser-dependent performance is not guaranteed. WebGL is required.
