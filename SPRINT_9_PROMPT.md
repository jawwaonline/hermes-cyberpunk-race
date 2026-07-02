# Sprint 9 — Cyberpunk Race Game: Production-Grade AAA Polish

## Mission
Take the existing cyberpunk browser racing game at /home/hermes/projects/hermes-cyberpunk-race/ from "functional prototype" (current live at testrace.joymini.de) to **"indie premium mobile-quality"** that a real player would want to play for 5+ minutes.

## Current State (verified 2026-07-02)
- Last commit on main: **cad4837** (Sprint 6 + Dockerfile fix). Live is **Sprint 8** code (commit 36424ca).
- 104/104 unit tests pass for Sprint 8.
- Three.js renders, HUD works, WebGL works (verified via Playwright preflight, 992KB screenshot).
- BUT: flat oval track, basic cars (box+wheel), no audio, no postprocessing, minimal environment.

## Constraints
- Do NOT delete working Sprint 8 functionality. Extend, don't replace.
- Use existing architecture (server.js + client.js + src/ + public/).
- 60 fps target at 1280x720. Mobile not required.
- Self-host all assets. No external CDNs (privacy).
- All new code must pass `deployment-preflight` Step 1-3 at minimum (JSON validity, imports, docker build).

---

## 🎯 MANDATORY Definition of Done (BLOCKING)

You cannot declare Sprint 9 complete unless EVERY box below is checked:

```
[ ] Every file in src/ parses as valid ES module (node --check for each)
[ ] package.json is valid JSON (`python3 -c "import json; json.load(open('package.json'))"`)
[ ] npm ci --omit=dev succeeds from scratch
[ ] npm test passes (104/104 minimum, more is better)
[ ] The server boots without throwing (5-second timeout smoke)
[ ] The primary UI element (canvas) exists in the rendered DOM after page load
[ ] A headless browser test captures no pageerror within 8s of load
[ ] All new symbols imported by src/ are exported by their source module
[ ] A `git status` shows no untracked debug files
[ ] A 60-second playwright screenshot exists at /tmp/sprint9-final.png showing:
    - canvas with non-blank content (dataUrl > 10KB)
    - HUD visible with Position, Lap, Speed, Minimap, Progress Bar
    - A 3D track with banking or elevation (NOT flat oval)
    - At least 3 environmental props (buildings, signs, trees, etc.)
```

## VERIFIED (mandatory output)
List what you actually ran and confirmed.

## NOT VERIFIED (mandatory honesty)
List what you did not test (be explicit about browser tests, audio, etc.).

## DEPLOYMENT RISK
HIGH / MED / LOW + reason.

---

## 🎨 Art Direction

**Reference works:**
- **Wipeout HD** (sleek anti-gravity vehicles, luminous track markings, banked turns)
- **Blade Runner 2049** (volumetric fog, massive animated billboards, orange/teal palette accents)
- **Tron Legacy** (black glossy surfaces, glowing cyan/magenta outlines)
- **Asphalt 9** (diegetic speed gauges, clean minimal text)

**Visual target:** Dystopian megacity street circuit at night. Slick wet asphalt, towering skyscrapers, animated holographic advertisements, particle rain, deep atmospheric fog. Synthwave palette: `#0A0E27` (deep blue), `#FF006E` (magenta), `#9D4EDD` (purple), `#00F5FF` (cyan).

**Quality bar:** "AAA mobile arcade racing" — NOT "tech demo". Every section must include one concrete, non-obvious design decision. No bullet lists without a narrative reason.

---

## 🚗 Track (MANDATORY)

Replace the flat oval with a **Catmull-Rom spline track** with:
- At least 12 control points forming an interesting loop
- Banking on corners (track tilts 15-30° inward)
- At least 1 elevation change (bridge, tunnel, or hill)
- 4 distinct corner types: hairpin, sweeper, chicane, banked turn
- Track surface with shader-based grid lines that flow toward camera (Tron style)
- Track barriers/walls with glowing edges
- At least 3 boost pads that glow when car drives over them
- Direction arrows painted on track surface (no ambiguity about direction)

---

## 🏎️ Cars (MANDATORY)

Replace box+wheel with a **premium vehicle group**:
- Main chassis: low-poly mesh with custom shader (fresnel rim lighting, holographic wireframe overlay that pulses with speed)
- 4 wheels with rotation based on speed
- 2 thruster lights at rear with emissive material + particle trail when accelerating
- Subtle roll animation on z-axis when turning
- Subtle pitch animation on x-axis when accelerating/braking
- AI opponent (single car) with simple rubber-band AI that keeps pressure

---

## 🌃 Environment (MANDATORY)

Add atmospheric depth:
- Procedural cityscape backdrop (10-20 simple building silhouettes at distance, parallax)
- 3-5 animated holographic billboards (canvas-texture scrolling neon ads)
- Particle rain effect (lightweight — 200 particles max)
- Atmospheric fog (THREE.Fog with `near`/`far` to add depth)
- Sun/moon sphere in sky with gradient + horizontal stripes (synthwave style)

---

## 🎬 Post-Processing (MANDATORY)

Use Three.js EffectComposer with:
- UnrealBloomPass (threshold 0.6, strength 0.7, radius 0.4 — tuned so only emissive surfaces glow)
- Chromatic aberration (subtle, RGB offset scales with speed)
- Vignette + film grain (low intensity)
- Speed-based radial blur (kicks in above 70% max speed)

---

## 🔊 Audio (MANDATORY)

WebAudio API procedural audio (no external files):
- Engine drone (sawtooth + filter, pitch scales with speed)
- Background music loop (3-voice detuned synth, 120 BPM, in A minor)
- SFX: checkpoint chirp, lap complete arpeggio, wrong-way bell, off-track growl, crash noise
- Mute toggle in HUD

---

## 🎮 Game Modes

Both modes must work via WebSocket:
- **Human vs AI**: Player races against AI car (existing, refine)
- **Human vs Human**: 2-player local split-screen (existing, refine)

---

## ⚙️ Process — Build → Critique → Fix × 3

**Iterate three times.** Each pass improves quality.

### Pass 1: Skeleton
- All mandatory features stubbed in
- 60+ fps target
- Tests passing

### Pass 2: Critique (use grep + reading code, not running browser)
- After Pass 1, take a screenshot via the playwright helper (see below)
- Identify top 5 visual/feel issues
- List them

### Pass 3: Polish
- Fix the top 3 from Pass 2
- Verify Definition of Done

---

## 🛠️ Helper: Pre-Commit Preflight (MANDATORY before each commit)

Run this BEFORE each `git commit`:

```bash
cd /home/hermes/projects/hermes-cyberpunk-race
python3 -c "import json; json.load(open('package.json'))" || { echo "FAIL: package.json broken"; exit 1; }
for f in $(find src/ -name "*.js"); do node --check "$f" || { echo "FAIL: $f"; exit 1; }; done
grep -rhoE "^import .* from ['\"]([^'\"./][^'\"]*)['\"]" src/ | sort -u | while read mod; do
  if [ ! -d "node_modules/$mod" ]; then echo "MISSING: $mod"; exit 1; fi
done
echo "✓ preflight OK"
```

If it fails, fix and re-run. Do not commit broken code.

---

## 📸 Helper: Browser Screenshot (for Pass 2 critique)

After Pass 1, before starting Pass 2:

```bash
cd /home/hermes/projects/hermes-cyberpunk-race
PORT=3001 nohup node src/server.js > /tmp/sprint9-server.log 2>&1 &
SERVER_PID=$!
sleep 4
node ~/.hermes/skills/deployment-preflight/scripts/preflight-3d.js
# Screenshot at /tmp/preflight-3d.png
kill $SERVER_PID
```

Look at the screenshot. Identify issues. Document them.

---

## 📦 Deliverables

1. **Working code** committed to main (or a feature branch with PR)
2. **No fewer than 110 unit tests passing** (current 104 + new tests for new modules)
3. **Screenshot** at `/tmp/sprint9-final.png` showing the polished result
4. **VERIFIED / NOT VERIFIED / DEPLOYMENT RISK** block at end of summary
5. **List of files changed** with line counts

---

## ⏱️ Budget

You have ~50 minutes. Spend it on:
- Pass 1 (skeleton): 30 min
- Pass 2 (critique via code-reading + screenshot): 5 min
- Pass 3 (polish top 3): 12 min
- Final preflight + commit + summary: 3 min

If you're running over time on Pass 1, that's fine — better to ship Pass 1 cleanly than Pass 3 buggy.

---

## 🚨 Anti-Patterns (DO NOT DO)

- ❌ Do NOT delete or rewrite Sprint 8 working code. Extend.
- ❌ Do NOT add npm dependencies unless absolutely necessary. Use Three.js built-ins.
- ❌ Do NOT use external CDN scripts. Self-host.
- ❌ Do NOT use placeholder comments like "// TODO" or "// implement this".
- ❌ Do NOT claim "done" without running the preflight check above.
- ❌ Do NOT fake a screenshot. If you didn't run the preflight, say so in NOT VERIFIED.

---

## Begin now.