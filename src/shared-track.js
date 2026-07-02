// Shared track constants and waypoints — single source of truth for both client and server
export const TRACK_WIDTH = 20;
export const TRACK_LENGTH = 400;

const CONTROL_POINTS = [
  { x: 0,   z: -200, y: 0 },   // Start/finish straight
  { x: 50,  z: -190, y: 0 },   // gentle right curve start
  { x: 90,  z: -150, y: 3 },   // sweeping right - mild banking
  { x: 120, z: -90,  y: 8 },   // climbing into hairpin
  { x: 130, z: -20,  y: 15 },  // sharp right turn entry
  { x: 110, z: 50,   y: 22 },  // apex of elevated hairpin
  { x: 60,  z: 100,  y: 18 },  // descending from hairpin
  { x: 10,  z: 140,  y: 5 },   // chicane entry
  { x: -30, z: 160,  y: 0 },   // sharp left chicane
  { x: -70, z: 140,  y: 3 },   // chicane middle
  { x: -100, z: 90,  y: 0 },   // chicane exit
  { x: -110, z: 30,  y: 8 },   // sweeping curve entry (banked)
  { x: -100, z: -40, y: 15 },  // high-speed banked turn
  { x: -60,  z: -90, y: 10 },  // descending sweeper
  { x: -20,  z: -130, y: 3 },  // back straight approach
  { x: 10,   z: -170, y: 0 },  // final curve to start/finish
  { x: 0,    z: -200, y: 0 },  // close loop
];

const SAMPLES_PER_SEGMENT = 8;
const NUM_SEGMENTS = CONTROL_POINTS.length - 1;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function generateWaypoints() {
  const WAYPOINTS = [];
  const n = CONTROL_POINTS.length;

  for (let i = 0; i < n; i++) {
    const p0 = CONTROL_POINTS[(i - 1 + n) % n];
    const p1 = CONTROL_POINTS[i];
    const p2 = CONTROL_POINTS[(i + 1) % n];
    const p3 = CONTROL_POINTS[(i + 2) % n];

    const samples = (i < n - 1) ? SAMPLES_PER_SEGMENT : SAMPLES_PER_SEGMENT;
    for (let j = 0; j < samples; j++) {
      const t = j / SAMPLES_PER_SEGMENT;
      const pt = catmullRom(p0, p1, p2, p3, t);
      WAYPOINTS.push(pt);
    }
  }

  // Sprint 10 fix: snap the very last waypoint to the first one. The Catmull-Rom
  // spline's last segment can end a few metres off the start because of how
  // the parameter `t` runs (it goes 0..1-1/N at the last sample). Snapping
  // ensures a truly closed loop for the racing track — without this, the
  // player's "lap" never completes and `computeTrackTangent` would produce
  // a near-zero-length vector between the last and first waypoints, which
  // Three.js reports as "Computed radius is NaN".
  WAYPOINTS[WAYPOINTS.length - 1] = { ...WAYPOINTS[0] };
  return WAYPOINTS;
}

export const WAYPOINTS = generateWaypoints();

export const BOOST_PADS = [
  { x: 55,  z: -130, y: 0, angle: Math.PI / 4,  strength: 1.5 },
  { x: 65,  z: 60,   y: 18, angle: Math.PI / 3,  strength: 1.8 },
  { x: -75, z: -5,   y: 8,  angle: -Math.PI / 2, strength: 1.5 },
];

export const TRACK_BOUNDS = {
  width: TRACK_WIDTH
};
