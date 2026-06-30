// Shared track constants and waypoints — single source of truth for both client and server
export const TRACK_WIDTH = 20;
export const TRACK_LENGTH = 400; // Oval straight section length

// Waypoints: generated once, imported by both track.js (client rendering)
// and server.js (server-side AI + game state)
function generateWaypoints() {
  // Simple ellipse with waypoints forming a closed circuit
  // First waypoint at bottom (z = -B), going counterclockwise
  const N = 64; // Power of 2 for clean division
  const A = 30; // x-axis radius (half width of oval)
  const B = 200; // z-axis radius (half length of oval)
  
  const WAYPOINTS = [];
  
  for (let i = 0; i < N; i++) {
    // Angle starting from -PI/2 so first point is at (0, -B) = bottom
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const x = A * Math.cos(angle);
    const z = B * Math.sin(angle);
    WAYPOINTS.push({ x, z });
  }
  
  // Explicitly set last waypoint to first to ensure perfect closure
  // This avoids floating point drift
  WAYPOINTS[N - 1] = { ...WAYPOINTS[0] };
  
  return WAYPOINTS;
}

export const WAYPOINTS = generateWaypoints();

// Track geometry constants for collision/boundary checking
export const TRACK_BOUNDS = {
  ovalRadiusX: 30,
  ovalRadiusZ: 200,
  width: TRACK_WIDTH
};
