// Shared track constants and waypoints — single source of truth for both client and server
export const TRACK_WIDTH = 20;
export const TRACK_LENGTH = 400;

const TRACK_DEFINITIONS = {
  oval: {
    name: 'Oval',
    description: 'Classic oval with gentle curves',
    controlPoints: [
      { x: 0,    z: -150, y: 0 },
      { x: 80,   z: -150, y: 0 },
      { x: 120,  z: -100, y: 5 },
      { x: 120,  z: 0,    y: 5 },
      { x: 120,  z: 100,  y: 5 },
      { x: 80,   z: 150,  y: 0 },
      { x: 0,    z: 150,  y: 0 },
      { x: -80,  z: 150,  y: 0 },
      { x: -120, z: 100,  y: 5 },
      { x: -120, z: 0,    y: 5 },
      { x: -120, z: -100, y: 5 },
      { x: -80,  z: -150, y: 0 },
      { x: 0,    z: -150, y: 0 },
    ]
  },
  figure8: {
    name: 'Figure-8',
    description: 'Crossing path with elevation changes',
    controlPoints: [
      { x: 0,    z: -120, y: 0 },
      { x: 60,   z: -120, y: 0 },
      { x: 100,  z: -80,  y: 8 },
      { x: 100,  z: 0,    y: 12 },
      { x: 60,   z: 40,   y: 8 },
      { x: 0,    z: 40,   y: 0 },
      { x: -60,  z: 40,   y: 8 },
      { x: -100, z: 0,    y: 12 },
      { x: -100, z: -80,  y: 8 },
      { x: -60,  z: -120, y: 0 },
      { x: 0,    z: -120, y: 0 },
    ]
  },
  scurves: {
    name: 'S-Curves',
    description: 'Winding course with sharp turns',
    controlPoints: [
      { x: 0,    z: -180, y: 0 },
      { x: 60,   z: -180, y: 3 },
      { x: 100,  z: -140, y: 8 },
      { x: 100,  z: -80,  y: 5 },
      { x: 60,   z: -40,  y: 0 },
      { x: 0,    z: 0,    y: 5 },
      { x: -60,  z: 40,   y: 8 },
      { x: -100, z: 80,   y: 5 },
      { x: -100, z: 140,  y: 8 },
      { x: -60,  z: 180,  y: 3 },
      { x: 0,    z: 180,  y: 0 },
      { x: 60,   z: 180,  y: 3 },
      { x: 80,   z: 140,  y: 0 },
      { x: 60,   z: 100,  y: 0 },
      { x: 0,    z: 80,   y: 3 },
      { x: -60,  z: 60,   y: 0 },
      { x: -80,  z: 20,   y: 0 },
      { x: -60,  z: -20,  y: 0 },
      { x: 0,    z: -60,  y: 0 },
      { x: 60,   z: -100, y: 0 },
      { x: 40,   z: -140, y: 0 },
      { x: 0,    z: -180, y: 0 },
    ]
  }
};

let currentTrackName = 'oval';

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function generateWaypointsForTrack(controlPoints) {
  const result = [];
  const n = controlPoints.length;
  const SAMPLES_PER_SEGMENT = 8;

  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];

    for (let j = 0; j < SAMPLES_PER_SEGMENT; j++) {
      const t = j / SAMPLES_PER_SEGMENT;
      const pt = catmullRom(p0, p1, p2, p3, t);
      result.push(pt);
    }
  }

  result[result.length - 1] = { ...result[0] };
  return result;
}

let currentWaypoints = generateWaypointsForTrack(TRACK_DEFINITIONS.oval.controlPoints);

export const WAYPOINTS = currentWaypoints;

export function setCurrentTrack(trackName) {
  if (TRACK_DEFINITIONS[trackName]) {
    currentTrackName = trackName;
    currentWaypoints = generateWaypointsForTrack(TRACK_DEFINITIONS[trackName].controlPoints);
    WAYPOINTS.length = 0;
    WAYPOINTS.push(...currentWaypoints);
  }
}

export function getCurrentTrackName() {
  return currentTrackName;
}

export function getTrackNames() {
  return Object.keys(TRACK_DEFINITIONS);
}

export function getTrackDefinition(trackName) {
  return TRACK_DEFINITIONS[trackName || currentTrackName];
}

export function getWaypoints() {
  return currentWaypoints;
}

export const BOOST_PADS = [
  { x: 55,  z: -130, y: 0, angle: Math.PI / 4,  strength: 1.5 },
  { x: 65,  z: 60,   y: 18, angle: Math.PI / 3,  strength: 1.8 },
  { x: -75, z: -5,   y: 8,  angle: -Math.PI / 2, strength: 1.5 },
];

export const TRACK_BOUNDS = {
  width: TRACK_WIDTH
};
