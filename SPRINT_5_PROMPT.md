Read these 3 files FIRST before doing anything else:

1. docs/sprint-5-bug-fix-and-overhaul.md — Sprint 5 spec (5 bugs + visual overhaul + sub-slice plan)
2. docs/design-doc.md — Cyberpunk visual design (Palette A, HUD layout, Three.js recipes)
3. docs/tech-research.md — Technical research (server authority, Rapier, checkpoints, ranking, bounds)

Also read PROJECT_VISION.md for context (last 5 commits were related to this game).

# Your Task: Slice 5 — "Robust Race + Cyberpunk Style"

Implement all 5 user-reported bugs + visual overhaul in this vertical slice.

## 5 Sub-Slices (do in order, tests FIRST for each)

### 5a — Bug #1 (Server-authoritative inputs)
- Server: validate `{throttle, brake, steer, seq, dt}` with Number.isFinite() + range checks (0-1 for throttle/brake, -1 to 1 for steer)
- Reject NaN/Infinity, out-of-order seq, flood (>60 inputs/s)
- Keep current `move` message during transition (backward compat), but new `input` is preferred path
- Tests: unit tests for validation, integration test for end-to-end input→snapshot

### 5b — Bug #5 (Checkpoint lap + ranking)
- Replace `lastZ` with checkpoint array (4 checkpoints around oval)
- Each car: `{lap, nextCheckpoint, t ∈ [0,1), lastT}` where t = progress along spline
- Lap credits only when nextCheckpoint cycles through ALL in order
- Ranking: `total = lap + t`, sort desc
- Tests: unit tests for checkpoint progression, wrong-way detection

### 5c — Bugs #2 + #4 (Track bounds + wrong-way)
- Define track polygon (ring of {x,z}, baked width)
- pointInPolygon check per tick → speedMultiplier = 0.25 when off-track
- Wrong-way detection: Δt < -0.05 for >30 frames triggers "WRONG WAY" HUD warning
- Stuck reset: off-track + <1m/s for >3s → snap to nearest valid spline point
- Tests: unit tests for polygon check, integration test for reset

### 5d — Bug #3 (Car-vs-car collision)
- Start with AABB narrow-phase (60 LOC, no deps) — Rapier is heavier, AABB first
- Each car has Box3 oriented by yaw, SAT for pair tests
- Tests: unit tests for AABB collision, integration test for 2-car scenarios

### 5e — Visual Overhaul (Phase 1 Quick Wins from design-doc.md)
1. EffectComposer pipeline: RenderPass → UnrealBloomPass(1.4, 0.85, 0.0) → FilmPass(0.25) → OutputPass
2. Apply Palette A (#0A0E27 base, #FF006E accent, #9D4EDD purple, #00F5FF cyan) to all materials
3. Google Fonts CDN: Orbitron + Rajdhani + VT323 + Audiowide
4. 4-corner HUD: Position TL, Lap TR, Speed arc BR, Mini-map BL
5. Cars: 3-layer recipe (body + wireframe overlay + TubeGeometry light trail)
6. Track: scrolling grid floor, holographic checkpoints, synthwave sun shader

## Test Discipline (CRITICAL — lesson from Slice 4)
- Tests FIRST, then code
- Run `npm test` after each sub-slice
- 100% green before moving to next sub-slice
- Each bug fix must have at least 1 unit test + 1 integration test

## Acceptance Criteria
- All 5 user-reported bugs fixed + tested
- Visual overhaul applied + tested
- No regression of existing Slice 4 tests
- Update PROJECT_VISION.md §4 with Slice 5 status
- Commit + push after each sub-slice

## Constraints
- ENGLISH only (all code, comments, docs)
- Generic, no project-specific references
- Three.js postprocessing via EffectComposer (not pmndrs — keep deps minimal)
- AABB before Rapier (lighter, ships faster)
- Server-authoritative (never trust client position)

## Workflow
1. Read all 3 docs + PROJECT_VISION.md
2. Run `npm test` to confirm baseline green
3. Sub-slice 5a: write tests → run (red) → implement → run (green) → commit
4. Sub-slice 5b: same pattern
5. Sub-slice 5c: same pattern
6. Sub-slice 5d: same pattern
7. Sub-slice 5e: visual overhaul (no tests required for visual, but verify nothing breaks)
8. Update PROJECT_VISION.md §4 with final status
9. Final commit + push
10. Report: which sub-slices completed, test counts, what shipped

Begin now.