// Shared track constants and waypoints — single source of truth for both client and server
export const TRACK_WIDTH = 20;
export const TRACK_LENGTH = 300;

// Waypoints: generated once, imported by both track.js (client rendering)
// and server.js (server-side AI + game state)
function generateWaypoints() {
  const WAYPOINTS = [];
  const RADIUS = TRACK_WIDTH / 2 + 2; // = 12

  // Straight section going forward (+z)
  for (let i = 0; i < TRACK_LENGTH; i += 25) {
    WAYPOINTS.push({ x: 0, z: i - TRACK_LENGTH / 2 });
  }

  // First curve (right turn, +x direction)
  WAYPOINTS.push({ x: TRACK_WIDTH / 2, z: TRACK_LENGTH / 2 });
  for (let i = 0; i <= 20; i++) {
    const angle = (Math.PI * i) / 20;
    WAYPOINTS.push({
      x: Math.cos(angle) * RADIUS,
      z: TRACK_LENGTH / 2 + Math.sin(angle) * RADIUS
    });
  }

  // Straight section going back (-z)
  WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 });
  for (let i = 0; i < TRACK_LENGTH; i += 25) {
    WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 - i });
  }

  // Second curve (left turn, -x direction)
  WAYPOINTS.push({ x: -TRACK_WIDTH / 2, z: -TRACK_LENGTH / 2 });
  for (let i = 0; i <= 20; i++) {
    const angle = (Math.PI * i) / 20;
    WAYPOINTS.push({
      x: Math.cos(angle + Math.PI) * RADIUS,
      z: -TRACK_LENGTH / 2 + Math.sin(angle + Math.PI) * RADIUS
    });
  }

  WAYPOINTS.push({ x: 0, z: -TRACK_LENGTH / 2 });
  return WAYPOINTS;
}

export const WAYPOINTS = generateWaypoints();
