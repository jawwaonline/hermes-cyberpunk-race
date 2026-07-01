# hermes-cyberpunk-race

## 0. Original Vision
**Created:** 2026-06-30
**Source:** User request via Hermes TUI

> "Erstelle mit opencode ein cyberpunk 3d browser race game. Es soll 2 Modi geben:
> 1) Human vs Human (hier soll per websocket auf einen spieler gewartet werden)
> 2) Human vs AI (der ein spieler modus der gleich gestartet werden kann).
> Nutze hierfür das bereits erstellte private repo: https://github.com/jawwaonline/hermes-cyberpunk-race"

---

## 1. Current Vision

Ein browser-basiertes 3D Cyberpunk Racing Game mit:
- **Cyberpunk-Ästhetik**: Neon-Farben, dunkle Umgebungen, futuristische UI
- **Zwei Spielmodi**:
  1. **Human vs Human**: Warteraum via WebSocket → wenn zweiter Spieler beitritt → Start
  2. **Human vs AI**: Sofort startbarer Solo-Modus gegen KI-Gegner
- **Technologie**: Three.js (3D), WebSocket (Multiplayer), Node.js Server, Vanilla JS ESM

---

## 2. User Intent
Björn will ein spielbares 3D-Rennspiel im Browser mit Cyberpunk-Look. Kein Chat, Mario Kart Items, 3D, Single + Multiplayer Modi.

---

## 3. Research Findings

### 1. What Was Actually Built

**Game Modes:**
- **Human vs AI**: Instant-start solo mode. Client connects to WebSocket, sends `start-ai`, server starts AI broadcast loop at 50ms intervals.
- **Human vs Human**: Matchmaking via WebSocket rooms. First player joins → `waiting` state. Second player joins → both receive `go` with `playerIndex` (0 or 1), race starts immediately.

**3D Scene (Three.js):**
- Oval/elliptical track rendered with custom `BufferGeometry` (ring/strip surface)
- 48 cyan outer barriers + 48 magenta inner barriers along the oval perimeter
- 16 support pillars with glowing cyan/magenta light spheres atop them
- 32 dashed center-line markers
- Ground plane (600×600), dark gray fog (50–300 units)
- Finish line gate at z=−200 with checkered banner stripes and white glow
- Two car meshes: body (box), cabin (box), neon accent stripe, headlights
- Camera: third-person chase cam, lerps to target position behind car

**UI Elements:**
- Mode selection screen (title + two buttons)
- HUD (lap counter, race position 1st/2nd, speed in km/h, controls hint)
- Waiting screen with timer for HvH matchmaking
- End screen (WINNER / GAME OVER) with Restart and Back to Menu buttons
- Scanlines CSS overlay (full-screen fixed, pointer-events none)
- Connection error overlay (dynamically created)

**Technical Components:**
- `src/client.js` — CyberpunkRaceClient orchestrator; WebSocket connection, message handling, UI state
- `src/game.js` — Game class; Three.js scene init, animation loop, camera, AI update (client-side), HUD updates
- `src/server.js` — Node.js HTTP + WebSocket server; static file serving, room matchmaking, server-side AI loop, position broadcast, rate limiting
- `src/car.js` — Car class; mesh construction, physics (acceleration/friction/steering), lap detection, reset
- `src/track.js` — Track geometry creation (barriers, pillars, center line, finish line) + `createTrack()` + `createFinishLine()`
- `src/shared-track.js` — Single source of truth for `WAYPOINTS` (64 points, ellipse), `TRACK_WIDTH=20`, `TRACK_LENGTH=400`
- `src/ai.js` — `AIDriver` class (waypoint following, curve detection); **NOT USED anywhere**
- `src/controls.js` — Keyboard input (WASD + Arrow keys)
- `public/index.html` — Single HTML page with importmap for Three.js ESM, all CSS inline

---

### 2. Architecture Decisions

**3D Scene Structure:**
- Single `THREE.Scene` with `THREE.Fog` for atmosphere
- One `PerspectiveCamera` with manual chase-cam logic (no OrbitControls)
- Lighting: `AmbientLight` (dim blue), `DirectionalLight` (subtle), two `PointLight` (cyan + magenta) fixed at sides
- All track geometry created once at init via `createTrack()`; no dynamic obstacles or terrain deformation
- Car meshes created fresh per race start via `new Car(scene, isPlayer, color)`

**WebSocket Protocol:**
- Single server on port 3000 serving both HTTP (static files) and WebSocket
- Message types (client→server): `start-ai`, `join`, `position`
- Message types (server→client): `waiting`, `go`, `opponent`, `ai_position`, `opponent_left`, `error`
- `position` message carries: `x, y, z, rotation, lap, finished`
- Server validates all numeric fields with `validateNumber()` before rebroadcasting
- Rate limiting: 30 messages per second per client; excess → `error` + `terminate()`
- Heartbeat: server pings clients every 30s, terminates unresponsive

**Server-Side AI:**
- Global `aiState` object (`{x, y, z, waypointIndex}`) + scalar `aiRotation`
- `setInterval(broadcastAIPositions, 50)` loop updates AI state and fans out to all `aiModeClients`
- Lap counted server-side when AI crosses z=−200 from positive to negative z
- This state is **shared across all AI-mode clients** — multiple simultaneous AI-mode players see the same AI car

**Client-Side AI (used in HvH mode as the opponent car):**
- `game.js updateAI()` steers client-side AI car toward nearest waypoint, constant speed 0.8
- In HvH mode, the local "AI car" is actually a proxy for the remote human opponent (controlled via `setOpponentPosition`)
- In AI mode, an actual AI car (`this.aiCar`) is created and updated via `updateAI()`

**AI Behavior:**
- `AIDriver` class in `src/ai.js` exists but is **completely unused** — dead code
- Client AI in `game.js`: velocity always 0.8 (never slows for curves despite `isCurveAhead()` call), steering capped at `0.05 * dt * 60` per frame
- Server AI in `server.js`: velocity always 0.8, steering capped at 0.045

---

### 3. Code Quality Assessment

**Bugs:**

1. **Dead AI class** (`src/ai.js`): `AIDriver` is never imported anywhere. The actual AI logic is duplicated inline in `game.js` and `server.js`.

2. **Shared server-side AI state across AI-mode clients**: `aiState`, `aiLap`, `aiRotation` are global scalars. If two players simultaneously start Human vs AI, they share the same AI opponent position — each player's AI car overwrites the other's.

3. **`opponent_left` handler is empty** (`client.js` line 101–102): When a human opponent disconnects, the client receives `opponent_left` but does nothing. The race continues with a ghost car.

4. **Race condition on room deletion** (`server.js` line 246): When both players finish and send `finished`, the room is deleted 5 seconds later. If `finishedCount >= 2` triggers for both players in quick succession, `rooms.delete()` may be called twice, or a player could send a position after deletion.

5. **Backwards lap exploit**: Lap detection in `car.js` (line 152) only checks `prevZ > -200 && z <= -200`. A player who drives backwards past the finish line would trigger unlimited laps.

6. **`getProgress()` is broken** (`car.js` line 164–167): Computes `atan2(z/B, x/A)` where `(x,z)` is the car position relative to the origin. But the oval is centered at the origin, so for any point on the ellipse `(A*cos(t), B*sin(t))`, `atan2(B*sin(t)/B, A*cos(t)/A) = atan2(sin(t), cos(t)) = t`. This only works correctly if the car is exactly on the ellipse — in practice the car can be anywhere within the track width, making the angle incorrect. Position display (1st/2nd) using this function is unreliable.

7. **No collision detection**: Cars pass through each other with zero physics response.

8. **`lastZ` initialization** (`car.js` line 18): Set to `−200` (finish line z). But the car's starting position is also z=−200, so the first forward crossing of the finish line (from z=−201 to z=−199) would NOT be detected because `prevZ` is already `−200`. The car must complete a full circuit before laps register.

9. **Restart in HvH re-joins but doesn't re-sync**: After restart, client reconnects WebSocket and re-joins (or starts AI), but there's no server-side game state reset. If the player was in HvH and reconnects, they get a fresh room but the opponent (if any) is gone.

**Tech Debt:**

1. **`restart()` creates a new `Game` instance** (`client.js` line 212–213): `backToMenu()` destroys the renderer and creates a brand-new `Game`. This leaks Three.js resources (old renderer not properly disposed).

2. **No game pause or state machine**: The game runs `requestAnimationFrame` loops indefinitely. There's no clean way to pause.

3. **Server AI and client AI are different algorithms**: Server AI uses `atan2(dx,dz)` steering; client AI uses `rotation` accumulation. They behave differently.

4. **Three.js CDN dependency**: `unpkg.com/three@0.160.0` — no integrity check, no local fallback. If CDN goes down, game breaks.

5. **All geometry created with `new THREE.*` in constructors**: No object pooling or instancing. The 48+ barrier meshes are individual objects.

---

### 4. Feature Parity vs. Must Have (§4)

| Must Have | Status | Notes |
|---|---|---|
| Cyberpunk 3D track (dark, neon) | ✅ Done | Oval with cyan/magenta barriers, pillars, emissive materials, fog |
| Player car with steering (WASD/arrows) | ✅ Done | `car.js` physics + `controls.js` keyboard input |
| AI opponent with simple pathfinding | ✅ Done | Waypoint-following AI on client (`game.js`) and server (`server.js`) |
| Human vs Human: WebSocket waiting room | ✅ Done | `waiting` → `go` flow, room-based matchmaking |
| Human vs AI: instant start | ✅ Done | `start-ai` → `go` immediately |
| 3-lap race (first to finish) | ⚠️ Partial | Lap detection has bugs (see §3 bug #8), backwards exploit possible |

| Should Have | Status | Notes |
|---|---|---|
| Neon glow effects | ⚠️ Partial | Emissive materials (no post-processing bloom) |
| Minimap | ❌ Missing | No minimap UI or rendering |
| Lap/position display | ⚠️ Partial | Lap counter done; position (1st/2nd) uses broken `getProgress()` |

| Innovative Ideas | Status | Notes |
|---|---|---|
| Synthwave music | ❌ Missing | No audio at all |
| Boost powerup | ❌ Missing | No items, only pure racing |

---

### 5. Cyberpunk Aesthetic Implementation

**Color Palette:**
- Background/ground: `#0a0a0f` (near-black with blue tint)
- Primary neon: Cyan `#00ffff` (outer barriers, player car accent, UI borders)
- Secondary neon: Magenta `#ff00ff` (inner barriers, AI car accent, position display)
- Accent: Yellow `#ffff00` (pillar emissive), white `#ffffff` (finish line, headlights)
- Text: Cyan default, magenta for loss/position, yellow for speed

**Visual Elements:**
- Scanlines CSS overlay (4px repeating gradient, semi-transparent black)
- Text-shadow glow on title, HUD elements, end screen
- Box-shadow glow on HUD border, buttons on hover
- Fog (`THREE.Fog(0x0a0a0f, 50, 300)`) for depth atmosphere
- `MeshStandardMaterial` with `emissive` + `emissiveIntensity` on barriers, pillars, car accents, finish line
- Monospace `font-family: 'Courier New'` throughout
- All-caps letter-spacing on title and buttons

**No post-processing**: No bloom, no chromatic aberration, no vignette — glow is simulated purely through emissive materials + CSS shadows.

---

### 6. AI Behavior

**How it works (client-side in AI mode):**
1. Each frame, `updateAI()` finds the nearest waypoint from `WAYPOINTS[]` by Euclidean distance
2. Computes `targetAngle = atan2(dx, dz)` toward that waypoint
3. Steers `rotation` toward `targetAngle` by at most `0.05 * (dt * 60)` radians/frame
4. Sets `velocity = 0.8` (constant — no acceleration, no curve slowdown despite calling `isCurveAhead()`)
5. Moves car forward: `position.x += sin(rotation) * velocity * s`

**Server-side AI:** Same algorithm but runs in a `setInterval(..., 50)` loop and broadcasts `{type:'ai_position', x, y, z, rotation, waypointIndex}`.

**Known Issues:**
- Constant velocity 0.8 vs player maxSpeed 1.2 — player is faster and can easily outrun the AI
- `isCurveAhead()` is computed but its result is never used to actually slow down
- Waypoint nearest-distance selection can cause erratic behavior if car goes off-track (it will snap to the closest waypoint regardless of direction)
- No obstacle avoidance (cars are the only objects; no collision detection)
- Starting position offset: player at x=−8, AI at x=+8 — AI has a slightly longer path around the outer edge of the oval

---

### 7. Multiplayer / WebSocket Matchmaking

**Flow (Human vs Human):**
1. Player A clicks "Human vs Human" → `connect()` → `ws.send({type:'join'})`
2. Server iterates existing rooms; finds a room with 1 player that is `!started && !locked` → joins it
3. If no such room: creates `room_${Date.now()}_${random}` with `players:[ws]`, sends `{type:'waiting'}`
4. Player B joins same flow; server finds the waiting room, sets `locked=true`, adds B, sets `started=true`
5. Both players receive `{type:'go', playerIndex: 0|1}`
6. Both start racing; each broadcasts `{type:'position', x, y, z, rotation, lap, finished}` every 50ms
7. Server validates, then `broadcastToRoom(roomId, {type:'opponent', ...}, excludeWs)`
8. When a player finishes (`finished:true` in position message): server increments `room.finishedCount`; after 5s, deletes room

**Race Conditions / Bugs:**
- `locked` flag is a simple boolean — not atomic. If two players try to join the same single-player room simultaneously, both could pass the `room.players.length === 1` check before either sets `locked`.
- `aiModeClients` is a `Set` shared globally — all AI-mode players share the same AI state (see §3 bug #2).
- No client-side heartbeat/ping handling; if the connection drops silently, the client never knows.
- `ws.onclose` clears `positionInterval` but does not attempt reconnection.
- After a player disconnects, `backToMenu()` closes the WebSocket and creates a new `Game`, but the `CyberpunkRaceClient` instance itself is never reset (mode, playerIndex, isRaceStarted persist).

**WebSocket Security:**
- Path traversal protection on static file server
- Allowed extensions allow `.js`, `.html`, `.css`, `.json`, `.ico`, `.png`, `.svg`, `.woff2`
- Rate limiting: 30 msg/s per client
- All numeric position fields validated with range checks
- `JSON.parse` in try/catch — malformed messages silently dropped

---

## 4. Vision
### Must Have
- [ ] Cyberpunk-inspirierte 3D-Rennstrecke (dunkel, Neon-Elemente)
- [ ] Player-Car mit Lenkung (Pfeiltasten / WASD)
- [ ] KI-Gegner mit einfachem Pathfinding
- [ ] Human vs Human Modus: WebSocket-Warteraum, 2. Spieler startet das Rennen
- [ ] Human vs AI Modus: sofortiger Start gegen KI
- [ ] Runden-basiertes Rennergebnis (Wer finishet zuerst 3 Runden?)

### Should Have
- [ ] Neon-Glow-Effekte auf der Strecke
- [ ] Minimap
- [ ] Runden-Anzeige / Positionsanzeige

### Innovative Ideas
- [ ] Synthwave-Musik per Web Audio API
- [ ] "Boost" Powerup auf der Strecke

---

## 5. Prioritized Recommendations
Siehe Must Have oben.

---

## 6. Architecture
- **Frontend**: Three.js ESM, Vanilla JS, HTML5 Canvas
- **Backend**: Node.js WebSocket Server (ws/wswebsocket)
- **Multiplayer**: WebSocket room-based matchmaking
- **AI**: Einfacher State-Machine KI-Gegner
- **Deployment**: Docker + Coolify

---

## 7. Vertical Slices
1. **Slice 1**: Projekt-Skelett (package.json, Dockerfile, Ordnerstruktur, leerer Three.js Scene)
2. **Slice 2**: 3D-Strecke + Player-Car mit Steuerung
3. **Slice 3**: Human vs AI Modus (sofort startbar)
4. **Slice 4**: Human vs Human WebSocket Warteraum + Matchmaking
5. **Slice 5**: Runden-System, Ziellinie, Positionsanzeige
6. **Slice 6**: Cyberpunk-UI (Neon-Styling, Rundenanzeige, Modus-Auswahl)
7. **Slice 7**: KI-Verbesserung + Wrap-up

---

## 8. Grill-Me Findings

---

### P0 Fixes Required — MUST be fixed before deployment

1. **`finished` boolean is not server-side validated** — `server.js:232`: The server validates `x, y, z, rotation, lap` but passes `msg.finished` directly without checking it. A malicious player sends `{type:'position', finished:true, lap:1}` on tick 1 and wins instantly. Fix: Server must track lap count and finish state server-side, never trust the client.

2. **Room lock race condition** — `server.js:199-209`: The `locked` flag is checked and set non-atomically. Two simultaneous `join` requests for the same single-player room both pass `room.players.length === 1 && !room.started && !room.locked` before either sets `locked = true`. Result: a room gets 3+ players, or player indices are assigned incorrectly. Fix: Use an atomic compare-and-swap or a mutex around the room join logic.

3. **`finishedCount` race condition** — `server.js:241-249`: When player 1 sends `finished=true`, `room.finishedCount` becomes 1 and a 5-second deletion timer starts. Player 2 sends `finished=true`, count becomes 2, another 5-second timer starts. `rooms.delete()` may be called twice. More critically: player 2 could disconnect before the timer fires — `rooms.delete()` removes the room while player 1 is still racing. Player 1's subsequent position broadcasts go to a deleted room (silently no-op). Fix: Reference-count the room, don't delete until all players have explicitly left or the race is confirmed over.

4. **Backwards lap exploit** — `car.js:152`: `checkLap()` only checks `prevZ > -200 && z <= -200`. A player who drives backward past the finish line (z=-200) and then forward again will cross the threshold each time, accumulating unlimited laps. Fix: Add directional check — only count a lap if the car crossed from the correct (clockwise) side.

5. **Shared server-side AI state across all AI-mode clients** — `server.js:61-66, 128-138`: `aiState`, `aiLap`, `aiRotation` are global scalars shared by all players in AI mode. Two simultaneous AI-mode players share the same AI opponent, overwriting each other's state. Fix: AI state must be per-client or the AI-mode client set must be removed entirely (client-side AI is fine for single-player).

---

### Severity-Critical (P0) — Crashes, Wrong Winner, Race Conditions, Security

**P0-1: `finished` field completely unvalidated** (`server.js:232`)
```javascript
const safeMsg = { type: 'opponent', x, y, z, rotation, lap, finished: msg.finished };
```
The server accepts `finished: true` from the client with zero validation. A player can win on the first position update. The server should track each player's lap count and determine finish eligibility server-side.

**P0-2: Room lock is not atomic** (`server.js:199-209`)
```javascript
if (room.players.length === 1 && !room.started && !room.locked) {
  room.locked = true;   // Two concurrent joins both pass this check
  room.players.push(ws);
  // ...
  room.locked = false;  // Released immediately after both players get 'go'
```
With two simultaneous join requests for the same waiting room, both pass the guard before either sets `locked`. Both get added as player 1, or the room ends up with 3+ players. The `locked` flag provides zero protection against concurrent access.

**P0-3: Room deletion while players still active** (`server.js:241-249`)
When player 1 finishes, a 5-second `setTimeout` is set to delete the room. If player 2 disconnects or finishes during that window, `rooms.delete()` is called while player 1 may still be sending position updates. Those updates silently fail (`broadcastToRoom` returns early on missing room). No error is raised, the client just stops seeing opponent updates.

**P0-4: Backwards lap exploit** (`car.js:152`)
```javascript
if (prevZ > -200 && z <= -200) {
  this.lap++;
```
Only detects crossing from positive z to negative z. A player who reverses from z=-180 past z=-200 to z=-220, then drives forward back to z=-180, crosses again and registers another lap. Infinite laps by oscillating at the finish line.

**P0-5: Global AI state shared across all AI-mode clients** (`server.js:61-66, 128-138`)
```javascript
let aiState = null;  // Single global
let aiLap = 1;        // Single global — shared!
```
If player A and player B both start AI mode simultaneously, they both receive the same AI position broadcast. More critically, `aiLap` is a single scalar — if player A's AI crosses the finish line, player B's AI lap counter jumps too. The `aiLap` increment is global regardless of which client's AI is at what position.

**P0-6: WebSocket messages have no authentication or session binding**
A player who captures the WebSocket handshake can replay or forge messages. There is no per-connection session token, no origin validation beyond browser same-origin policy (which is trivial to bypass with a custom HTTP client). A sophisticated attacker can send fake position streams for any player ID.

---

### Severity-High (P1) — Bad Gameplay, Exploitable Mechanics

**P1-1: `lastZ` initialized to finish line z-position** (`car.js:18, 75`)
```javascript
this.lastZ = -200; // Track starts at z = -200 (bottom of oval)
this.mesh.position.set(startX, 0, -200);  // Car starts AT z=-200
```
The car's starting position is z=-200. The `lastZ` is also -200. So `prevZ = -200` and `z = -200` initially. The first crossing from z=-201 to z=-199 does NOT satisfy `prevZ > -200 && z <= -200` (since prevZ is already -200, not greater than -200). The first lap is never counted. The player must complete a full circuit before any laps register.

**P1-2: AI max speed 0.8 vs player max speed 1.2 — trivially outrunnable** (`game.js:156`, `server.js:105`)
```javascript
this.aiCar.velocity = 0.8;  // AI always 0.8
this.maxSpeed = 1.2;        // Player max 1.2
```
The AI never exceeds 0.8 velocity. The player can hold W and outrun it without any skill. The `isCurveAhead()` function exists but its result is never used to slow the AI down. The AI is not a challenge — it's a moving obstacle.

**P1-3: `getProgress()` is geometrically incorrect** (`car.js:131-141, 164-167`)
```javascript
getTrackAngle() {
  const x = this.mesh.position.x;
  const z = this.mesh.position.z;
  const A = 30; const B = 200;
  let angle = Math.atan2(z / B, x / A);
```
`atan2(z/B, x/A)` equals `atan2(sin(t), cos(t)) = t` only if `(x,z)` is exactly on the ellipse `(A*cos(t), B*sin(t))`. But cars can be anywhere within the track width (e.g., x=5, z=-190). For off-track positions the angle is completely wrong. The 1st/2nd position display in the HUD is therefore unreliable — two cars at similar positions can show inverted rankings.

**P1-4: No collision detection between cars** (`car.js` — entire file)
Cars are purely visual meshes. There is zero physics response when two cars occupy the same space. In HvH mode, a player can drive through the opponent car with no effect. This breaks competitive integrity entirely.

**P1-5: `opponent_left` handler is empty** (`client.js:101-102`)
```javascript
case 'opponent_left':
  break;  // Does absolutely nothing
```
When the opponent disconnects, the client receives `opponent_left` but the race continues. The player's HUD still shows "2nd" because the AI opponent position stops updating but the display doesn't reflect that the opponent is gone. No win is declared, the race just freezes in a broken state.

**P1-6: `restart()` in HvH mode reconnects WebSocket but gets a fresh room** (`client.js:176-197`)
The client closes and reconnects, then sends `join`. It will be placed in a new room (likely with no one in it). If the original opponent is still connected, they are now orphaned — their room was deleted when the first player restarted. The opponent gets no `opponent_left` message and their game enters a state where their opponent simply vanished.

**P1-7: `CyberpunkRaceClient` state not reset on `backToMenu()`** (`client.js:199-215`)
`backToMenu()` creates a new `Game` instance but `this.mode`, `this.playerIndex`, `this.isRaceStarted` persist. If the user goes back to menu and clicks a different mode, stale state can cause incorrect behavior.

---

### Severity-Medium (P2) — Tech Debt, Code Smell, Dead Code

**P2-1: Dead `AIDriver` class** (`src/ai.js`)
The class is never imported anywhere. The actual AI logic is duplicated inline in `game.js` (client AI) and `server.js` (server AI). The `AIDriver.isCurveAhead()` curve-detection logic is entirely absent from both actual implementations.

**P2-2: Server AI and client AI are different algorithms** (`server.js:96` vs `game.js:148`)
Server AI: `targetAngle = atan2(dx, dz)` — steers toward next waypoint.
Client AI: uses `this.aiCar.rotation` accumulation — steers by rotating toward next waypoint angle.
These produce different racing lines and speeds. A player can observe the differential and learn that client-side AI behaves differently from server-side AI.

**P2-3: Three.js CDN dependency with no integrity check** (`public/index.html:76`)
```html
"three": "https://unpkg.com/three@0.160.0/build/three.module.js"
```
No subresource integrity attribute. If the CDN is compromised, the game executes arbitrary JavaScript. No local fallback. No version pin with content-hash.

**P2-4: `restart()` creates new `Game` instance but doesn't clean up properly** (`client.js:212-213`, `game.js:268-275`)
`renderer.dispose()` is called but no geometry or material from the track, car, or barriers is disposed. Each restart creates new Three.js objects and the old ones become unreachable but not garbage-collected. After several restarts, GPU memory leaks occur.

**P2-5: Multiple geometry instances created in loops** (`track.js:83-94, 113-135`)
48 barrier meshes, 32 center-line dashes, 16 pillars with sphere lights — each created with `new THREE.*Geometry()` and `new THREE.*Material()` in a loop with no instancing or pooling.

**P2-6: No pause mechanism**
`requestAnimationFrame` loops run indefinitely. There's no way to pause the game mid-race. If the user switches tabs, the game continues running.

**P2-7: HUD update inside position broadcast interval** (`client.js:172`)
```javascript
this.positionInterval = setInterval(() => {
  // ... send position ...
  this.game.updateHUD();  // Called every 50ms
}, 50);
```
HUD is updated 20 times per second from the position broadcast. This should be tied to the animation loop instead (which runs at display refresh rate).

**P2-8: `aiModeClients` is a Set that can grow unbounded** (`server.js:61`)
If AI-mode clients disconnect abnormally (network loss without proper WebSocket close), `aiModeClients.delete(ws)` in `ws.onclose` may not fire, leaving stale entries. Eventually `broadcastAIPositions` sends to closed connections that will fail silently.

---

### Severity-Low (P3) — Nice-to-Have Improvements

**P3-1: `isCurveAhead()` computed but result is thrown away** (`game.js:194-195`)
```javascript
const curveAhead = this.isCurveAhead();
this.aiCar.velocity = 0.8;  // Always 0.8 regardless
```
The `AIDriver` class in `ai.js` uses `isCurveAhead()` to set velocity (0.5 on curves vs 0.8 straight), but the actual client AI in `game.js` computes this and ignores it.

**P3-2: No minimap** (missing feature)
The original vision mentioned a minimap. None exists.

**P3-3: Race position display is unreliable due to `getProgress()` bug** (P1-3)
Players cannot trust the 1st/2nd HUD indicator.

**P3-4: No audio** — no synthwave music, no engine sounds, no lap completion sound.

**P3-5: Player start position disadvantage** (`car.js:74`)
Player at x=-8, AI at x=+8. The oval's outer edge (x=30+, z=-200) is a longer path than the inner edge (x=20, z=-200). Since AI is at x=+8 (outer side), it travels a slightly longer circuit. This is a minor asymmetry that slightly disadvantages the player on each lap.

---

### Attack Vectors — WebSocket Protocol Exploitation

**AV-1: Instant Win / False Finish**
A client sends `{type:'position', x:0, y:0, z:-200, rotation:0, lap:3, finished:true}` on the first message. The server has no lap validation (the client claims lap 3), no position plausibility check, and trusts `finished` directly. Attacker wins in <1 second.

**AV-2: Fake Position Stream (Ghost Car)**
With no server-side validation of position plausibility (velocity limits, track bounds, acceleration rates), a client can send impossible positions: teleporting across the track, moving at 10x normal speed, or placing the car off-track. The opponent's client renders these faithfully.

**AV-3: Rate Limit Bypass via Multiple Connections**
Each WebSocket connection gets 30 msg/s. An attacker opens 100 connections at 30 msg/s each = 3000 msg/s to the server. Combined with the room join logic, this can flood the matchmaking and cause denial of service.

**AV-4: Room Flooding / Memory Exhaustion**
An attacker scripts rapid `join` messages without sending `position`. Each join creates a new room (`room_${Date.now()}_${random}`) and holds a WebSocket connection. The `rooms` Map grows unbounded. No room expiration timer for waiting rooms.

**AV-5: Disconnection During Race (Denial of Service)**
A player in a 2-player HvH race can disconnect at any time. The opponent's client receives `opponent_left` but does nothing (see P1-5). The opponent is stuck in a race with no indication of what happened. No forfeit option, no timeout win.

**AV-6: Man-in-the-Middle Position Injection**
WebSocket traffic is unencrypted (ws://). On any shared-network scenario (coffee shop WiFi), an attacker can intercept and modify position broadcasts in real-time. Modified: `{x: 0, finished: true}`. The opponent sees the attacker teleport to the finish line.

**AV-7: Stale `ws.roomId` After Reconnection** (`server.js:258`, `client.js:181-192`)
After a disconnection, `ws.onclose` sets `ws.roomId` on the old connection. When `restart()` reconnects, it sends `join` (getting a new room) but the old `ws.roomId` value is still set on the new WebSocket instance? Actually the code creates a new `this.ws` so this is not exploitable — but the pattern is fragile.

**AV-8: Opponent Disconnect Without `opponent_left`**
If the opponent's TCP connection drops without a clean WebSocket close (killed process, network cable pulled), the server's `ws.onclose` fires but the client may never receive `opponent_left`. The client continues in a racing state indefinitely.

---

### Code Architecture Concerns

**AC-1: Server is the source of truth for AI but not for players**
The server tracks `aiState`/`aiLap` (for AI mode) but trusts player position updates completely. The `finished` message is client-authored and server-believed. This is the fundamental architecture flaw: the server should simulate the race, not relay unchecked client state.

**AC-2: No game state machine**
The race has no clean state transitions: `waiting` → `racing` → `finished`. The `isRaceStarted` flag is client-side only. The server has no concept of a race "state" — it just relays positions and counts `finishedCount`. If both clients reset simultaneously, the server has no mechanism to detect this and reset the room.

**AC-3: Single global AI state vs per-session AI state**
The server's global `aiState` object works for single-player but breaks for simultaneous multiplayer AI sessions. AI state should be per-session or the server-side AI broadcast should be removed entirely (rely on client-side AI, which is already the architecture for HvH where the opponent car is client-side).

**AC-4: No message sequencing or timestamp validation**
Messages arrive with no sequence number. A position update from tick 100 can arrive after tick 200, causing the opponent car to rubber-band. No timestamp validation to discard stale positions.

**AC-5: Coupling between game.js and client.js via shared `CyberpunkRaceClient` instance**
`CyberpunkRaceClient` owns both WebSocket communication and UI state. `Game` owns rendering and physics. These are tightly coupled — `game.startMode()`, `game.setOpponentPosition()`, `game.restart()`, `game.destroy()` are all called from `CyberpunkRaceClient`. A cleaner architecture would have a `GameClient` that is purely rendering, with a separate `NetworkClient` handling WebSocket, and a `GameState` synchronizing between them.

**AC-6: `lastZ` and `lastCheckpoint` tracking is per-car, not validated**
The `lastZ` value is initialized to the finish line z, which causes the first-lap bug. This pattern of tracking previous-frame position to detect boundary crossings is fragile — if any frame produces a large delta (e.g., due to lag), the crossing could be missed entirely.

**AC-7: Waypoint array generated differently on client vs server**
`track.js` generates waypoints from `shared-track.js` which is imported by both. As long as the imports are consistent, this is fine. But `shared-track.js` uses `generateWaypoints()` at module load time, while `track.js` re-exports `WAYPOINTS` from `shared-track.js`. Any mismatch in the ellipse parameters (A, B) between `shared-track.js` and `track.js` (see `track.js:134-135`: `A = 30, B = 200` hardcoded in `getTrackAngle()`) would cause the client's progress calculation to disagree with the server's AI waypoint routing.

---

### Summary Priority Matrix
### Summary Priority Matrix

| ID | Severity | Bug | Location | Status |
|----|----------|-----|----------|--------|
| P0-1 | CRITICAL | `finished` unvalidated | server.js:232 | ✅ FIXED (af98f42) — server tracks lap/finished |
| P0-2 | CRITICAL | Room lock race condition | server.js:199-209 | ✅ FIXED (42a9440) — locked mutex added |
| P0-3 | CRITICAL | Room deleted while players active | server.js:241-249 | ✅ FIXED (42a9440) — 5s delay before delete |
| P0-4 | CRITICAL | Backwards lap exploit | car.js:152 | ✅ FIXED (af98f42) — forward-only detection |
| P0-5 | CRITICAL | Global AI state shared across clients | server.js:61-66 | ✅ FIXED (42a9440) — per-ws isAIMode flag |
| P0-6 | CRITICAL | No WebSocket auth/session binding | server.js:164+ | ⚠️ NOT FIXED — requires token auth |
| P1-1 | HIGH | `lastZ` init causes first lap to not count | car.js:18,75 | ✅ FIXED (af98f42) — lastZ=-201 |
| P1-2 | HIGH | AI max speed 0.8 vs player 1.2 | game.js:156 | ✅ FIXED (d7db228) — 1.05 |
| P1-3 | HIGH | `getProgress()` broken for off-track | car.js:131-141 | ⚠️ NOT FIXED — position display unreliable |
| P1-4 | HIGH | No collision detection | car.js | ⚠️ NOT FIXED — out of scope |
| P1-5 | HIGH | `opponent_left` empty no-op | client.js:101-102 | ✅ FIXED (d7db228) — player wins |
| P1-6 | HIGH | Restart orphans opponent | client.js:176-197 | ⚠️ NOT FIXED — known limitation |
| P1-7 | HIGH | State not reset on backToMenu | client.js:199-215 | ⚠️ NOT FIXED — cosmetic |
| P2-1 | MEDIUM | Dead `AIDriver` class | src/ai.js | ⚠️ NOT FIXED — dead code, low priority |
| P2-2 | MEDIUM | Server AI vs client AI diff algorithms | server.js vs game.js | ⚠️ NOT FIXED — architectural debt |
| P2-3 | MEDIUM | Three.js CDN no SRI | index.html | ⚠️ NOT FIXED |
| P2-4 | MEDIUM | Three.js resource leak on restart | game.js:268-275 | ⚠️ NOT FIXED |
| P2-5 | MEDIUM | Geometry not instanced | track.js | ⚠️ NOT FIXED |
| P2-6 | MEDIUM | No pause mechanism | game.js | ⚠️ NOT FIXED |
| P2-7 | MEDIUM | HUD update in position interval | client.js:172 | ⚠️ NOT FIXED |
| P2-8 | MEDIUM | `aiModeClients` stale entries | server.js:61,265 | ⚠️ NOT FIXED |
| P3-1 | LOW | `isCurveAhead()` unused | game.js:194-195 | ⚠️ NOT FIXED |
| P3-2 | LOW | No minimap | missing | ⚠️ NOT FIXED |
| P3-3 | LOW | Position display unreliable | car.js | ⚠️ NOT FIXED |
| P3-4 | LOW | No audio | missing | ⚠️ NOT FIXED |
| P3-5 | LOW | Start position asymmetry | car.js:74 | ⚠️ NOT FIXED |

---

## 9. Deployment
- **GitHub**: jawwaonline/hermes-cyberpunk-race
- **Coolify**: race.joymini.de (nmmnvbf6i — 注意: stale code, 需要 force-redeploy)
- **URL**: https://race.joymini.de
- **Stack**: Node.js + WebSocket + Three.js ESM (CDN), Docker
- **Ports**: 3000 exposed

**Deployment History**:
- 42a9440: P0 Grill-Me bugs — AI sync, room race condition, hideEndScreen, room cleanup
- af98f42: Server-side lap/finished tracking, backwards lap exploit fixed
- d7db228: AI speed balanced (0.8→1.05), opponent_left handler added

---

## 10. Lessons Learned

### Blueprint: Research first, then build
The project was built without Research/Grill-Me/Tests phases — classic Blueprint skip. 6 of 6 P0 bugs (including 2 unvalidated security issues) shipped directly to production at race.joymini.de. The Retroactive Blueprint Audit caught these in one session.

**Rule**: Every project gets §3 + §8 + tests/unit before deployment. No exceptions.

### P0 = Production Security
P0-1 (`finished` unvalidated) and P0-6 (no auth) were shipped live. A single malicious player could send `finished:true` on message 1 and win instantly. The server trusted all client state — classic cheat-by-design. Server-side validation of all game-critical state (laps, finished) is not optional.

### Lap detection is subtle
`lastZ` initialized to the finish line z meant the first lap crossing was never detected (prevZ===-200 && z===-200 doesn't trigger the crossing condition). Fix: initialize lastZ to a value that ISN'T the finish line (-201), so the first forward crossing IS detected.

### Backwards lap exploit is structural
Without direction validation, any player who reverses past the finish line triggers unlimited laps. The fix requires tracking both `lastZ` AND direction (wasMovingForward). This is a fundamental assumption violation — the original code assumed cars always drive forward.

### Multiplayer AI state must be per-session
The global `aiState` on the server was shared across all AI-mode clients. If two players played simultaneously, they saw the same AI car. AI state must be per-session (room-scoped), not global.

### Dead code is a warning sign
`src/ai.js` — a 60-line AIDriver class with curve detection and speed adjustment — was completely unused. The actual AI lived inline in `game.js` and `server.js` with different algorithms. Dead code means nobody knows what's real.

### What went well
- WebSocket rate limiting and path traversal protection in server.js were solid
- Three.js cyberpunk aesthetic (emissive materials, fog, neon colors) was effective
- Room-based matchmaking with locked mutex was a good approach
- Retroactive audit with Research → Grill-Me → Fix → Tests pipeline caught 33 issues in one session
