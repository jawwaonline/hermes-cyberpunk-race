# Cyberpunk Race Game — Bug Fixes & Design Overhaul Spec

This document is the **delta-spec for the next sprint** of `hermes-cyberpunk-race`.
It is NOT a replacement of `PROJECT_VISION.md` — it is a focused addendum covering
5 user-reported bugs + a visual/UX overhaul based on cyberpunk design research.

Owner: Björn (user). Last updated: 2026-07-01.

---

## 1. User-Reported Bugs (P0)

| # | Symptom | Likely Root Cause | Investigation Path |
|---|---------|-------------------|--------------------|
| 1 | Console error "client.js:116 Server error: Invalid position data" | Server's `validateNumber(x, -X, +X)` rejects when client sends `NaN`/`undefined` (e.g., post-race state when `car.js` no longer publishes position). | Read `src/server.js:230-237` — confirm range + add `Number.isFinite()` check. |
| 2 | Player can leave the track freely | No track-bounds enforcement. The current `track.js` builds barriers as visual decor only, not colliders. | Add invisible walls or off-track slowdown. |
| 3 | Player can drive through/over opponent | No collision detection between cars. | Add AABB collision per tick, both client + server. |
| 4 | Player doesn't know if they're going the correct direction | No "wrong way" indicator, no visual direction cues. | Detect velocity-vs-track-tangent, show HUD warning. |
| 5 | Position/ranking shows wrong player as 1st after opponent lapped them | Lap counter is `lastZ` based (see `src/server.js` after `1e19ab0`). When A laps B, A's z can be < B's z temporarily, breaking `lastZ` diff logic. | Replace with checkpoint-array progress model. |

## 2. Visual / UX Overhaul (P1 — Phase 1 Quick Wins)

See companion `references/design-doc.md` for full spec. Summary:

1. **EffectComposer pipeline**: RenderPass → UnrealBloomPass(strength 1.4, radius 0.85, threshold 0) → FilmPass(0.25) → OutputPass.
2. **Palette A** (Classic Synthwave) replaces current color scheme: `#0A0E27` base, `#FF006E` accent, `#9D4EDD` purple, `#00F5FF` cyan.
3. **Google Fonts** via CDN: Orbitron 700 (numerals), Rajdhani 500 (body), VT323 (telemetry), Audiowide (menus).
4. **HUD layout**: TL = Position ("01/08"), TR = Lap ("LAP 2/3"), BR = Speed arc, BL = Mini-map, Centre-bottom = "WRONG WAY" callouts.
5. **Cars**: 3-layer recipe — `MeshStandardMaterial` body (metalness 0.85, roughness 0.25, emissive `#FF006E`) + `MeshBasicMaterial({wireframe:true})` overlay + TubeGeometry light trail (meshline).
6. **Track**: Neon edges, scrolling grid floor (custom ShaderMaterial), holographic checkpoints (TorusGeometry pulse), synthwave sun sky sphere, speed-line particle FX.

## 3. Architecture Constraints

- **No new dependencies for collision**: lightweight AABB in 60 lines, no physics engine needed.
- **Server authoritative**: position updates are validated server-side; client prediction is a stretch goal, not Phase 1.
- **No breaking changes to WebSocket protocol**: keep `move`/`state`/`error` message types. Add new fields, don't remove.
- **Single-slice delivery**: implement bugs 1-5 + visual overhaul in one vertical slice (Slice 5: "Robust Race + Cyberpunk Style"). Use Slice 4's lesson: tests first, then code.

## 4. Acceptance Criteria

Each bug fix must:
- Be covered by an automated test (add to `tests/`).
- Be manually verified end-to-end in the deployed instance.
- Not regress any existing test (slice 4 had 100% green — keep it).

Visual overhaul must:
- Work in Chrome + Firefox at 60 FPS on a modest GPU.
- Have a visual diff committed (before/after screenshots in `docs/`).
- Pass accessibility check: contrast ≥ 4.5:1 for HUD text against track.

## 5. Out of Scope (Defer)

- Multiplayer > 2 players
- Power-ups / weapons
- AI difficulty levels
- Mobile/touch controls