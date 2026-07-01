# Racing Game Tech Research — Server Authority, Collision, Lap, Ranking, Bounds

## 1. Server-Side Validation (Bug #1 fix)

**Why servers reject client x/y/z/rotation:**
- NaN/Infinity, out-of-bounds magnitude, schema mismatch, or implied physics violation (Δposition > maxSpeed × Δt)

**Best practice: server-authoritative inputs**
- Client sends `{throttle, brake, steer, seq, dt}` only
- Server validates `Number.isFinite()` + ranges
- Server runs physics step, broadcasts snapshot
- `seq` for out-of-order detection; rate-limit to 60 inputs/s

**Concrete validation:**
```js
function onInput(p, msg) {
  if (!msg.input) return reject('missing input');
  const { throttle, brake, steer } = msg.input;
  if (!Number.isFinite(throttle) || throttle < 0 || throttle > 1) return reject('invalid throttle');
  if (!Number.isFinite(brake)    || brake    < 0 || brake    > 1) return reject('invalid brake');
  if (!Number.isFinite(steer)     || steer    < -1 || steer    > 1) return reject('invalid steer');
  if (msg.dt < 0 || msg.dt > 0.1) return reject('bad dt');
  if (msg.seq <= p.lastSeq) return drop('out-of-order');
  if (p.inputsPerSecond > 60) return reject('flood');
  p.lastSeq = msg.seq;
}
```

## 2. Collision Detection (Bug #3 fix)

**Library comparison:**
| Library | Package | Engine | Use case |
|---|---|---|---|
| **Rapier 3D** | `@dimforge/rapier3d-compat` (~5MB WASM) | Rust→WASM | Best perf, deterministic, built-in vehicle controller |
| cannon-es | `cannon-es` (~200KB) | JS | Easiest integration, fine for ≤8 cars |
| ammo.js | `ammo.js` | WASM | Most features, heaviest |

**Recommendation: Rapier 3D on server, kinematic interpolation on client**

Server:
```js
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

const chassis = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(spawn.x, spawn.y, spawn.z));
world.createCollider(RAPIER.ColliderDesc.cuboid(1.0, 0.4, 2.0)
  .setRestitution(0.1).setFriction(0.8), chassis);
const vehicle = world.createVehicleController(chassis);

setInterval(() => {
  vehicle.setWheelSteering(steer);
  vehicle.setWheelEngineForce(throttle * 800);
  vehicle.setWheelBrake(brake * 20);
  world.step();
}, 1000 / 60);
```

**Fallback for lightweight:** AABB narrow-phase (60 LOC, no deps) if Rapier is too heavy.

## 3. Lap Counter / Checkpoint Validation (Bug #5 fix)

**Why lastZ breaks:**
- Lapped cars double-count
- Wrong-way direction reverses incorrectly
- Start/finish colinear with pit section
- Disconnect/rejoin resets state

**Recommendation: Checkpoint array + spline progress**

```js
const track = {
  checkpoints: [
    { id: 0, x:   0, z:   0, r: 12 },  // start/finish
    { id: 1, x: 200, z:   0, r: 12 },
    { id: 2, x: 200, z: 200, r: 12 },
    { id: 3, x:   0, z: 200, r: 12 }
  ],
  curve: new THREE.CatmullRomCurve3([...controlPoints], true)
};

const car = { lap: 0, nextCheckpoint: 1, t: 0, lastT: 0 };

function updateCar(car, pos, dt) {
  // 1) Checkpoint check
  const cp = track.checkpoints[car.nextCheckpoint];
  const dx = pos.x - cp.x, dz = pos.z - cp.z;
  if (dx*dx + dz*dz < cp.r * cp.r) {
    if (car.nextCheckpoint === 0) { car.lap++; onLapComplete(car); }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % track.checkpoints.length;
  }
  // 2) Progress + wrong-way
  const u = projectOntoCurve(track.curve, pos);
  const dt_progress = wrapDelta(u - car.lastT);
  if (dt_progress < -0.05) car.wrongWayStreak++;
  else car.wrongWayStreak = Math.max(0, car.wrongWayStreak - 1);
  car.lastT = car.t;
  car.t = u;
}

function wrapDelta(d) {
  if (d >  0.5) return d - 1;
  if (d < -0.5) return d + 1;
  return d;
}
```

## 4. Position / Ranking (Bug #5 fix continued)

**Recommendation: `total = lap + t`, sort desc, 1-indexed.**

```js
const ranking = cars
  .map(c => ({ id: c.id, total: c.lap + c.t }))
  .sort((a, b) => b.total - a.total);
cars.forEach(c => {
  c.position = ranking.findIndex(r => r.id === c.id) + 1;
});
```

Client interpolates displayed position (snap on >0.5 position delta, hold on small jitter).

## 5. Track Bounds (Bug #2 fix)

**Recommendation: Off-track slowdown (no invisible walls).**

```js
const trackPolygon = [...]; // ring of {x,z}
const grassSlowdown = 0.25;

function updateOffTrack(car, pos) {
  car.offTrack = !pointInPolygon(pos.x, pos.z, trackPolygon);
  if (car.offTrack) {
    car.speedMultiplier = grassSlowdown;
    car.offTrackStreak++;
    // Stuck reset
    if (car.speed < 1 && car.offTrackStreak > 90) {
      const safe = nearestValidSplinePoint(track.curve, pos);
      car.body.setTranslation({ x: safe.x, y: safe.y, z: safe.z }, true);
      car.offTrackStreak = 0;
    }
  } else {
    car.speedMultiplier = 1.0;
    if (car.offTrackStreak > 60) {  // was off > 2s
      car.strikes++;
      if (car.strikes > 3) car.timePenalty += 2.0;
    }
    car.offTrackStreak = 0;
  }
}
```

Invisible walls explicitly discouraged in modern design (frustrating to players).

## 6. URL References

- Server authority: drcodes.com, accelbyte.io, gameandanimearmy.com
- Physics: github.com/dimforge/rapier.js, threejs.org rapier example, discourse.threejs.org
- Netcode: codersblock.org, zacksinisi.com, bsz-bw.de PDF
- Checkpoints: uefncentral.com, frothzon.itch.io, github.com/Phlarx/tm-checkpoint-counter
- Track bounds: boxthislap.org, driver61.com, docs.studio-397.com
- Reference: gitlab.com/harshsbajwa/caro (Three.js + Rapier + WS racing)