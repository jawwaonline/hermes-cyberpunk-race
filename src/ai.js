import { WAYPOINTS } from './track.js';

export class AIDriver {
  constructor(car) {
    this.car = car;
    this.currentWaypointIndex = 0;
    this.targetSpeed = 0.8;
  }

  update() {
    if (this.car.finished) return;

    const pos = this.car.mesh.position;
    const target = WAYPOINTS[this.currentWaypointIndex];

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const distToWaypoint = Math.hypot(dx, dz);

    if (distToWaypoint < 5) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % WAYPOINTS.length;
    }

    const targetAngle = Math.atan2(dx, dz);
    let angleDiff = targetAngle - this.car.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const turnAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.045);
    this.car.rotation += turnAmount;

    const curveAhead = this.isCurveAhead();
    this.car.velocity = curveAhead ? 0.5 : this.targetSpeed;

    this.car.mesh.position.x += Math.sin(this.car.rotation) * this.car.velocity;
    this.car.mesh.position.z += Math.cos(this.car.rotation) * this.car.velocity;
    this.car.mesh.rotation.y = this.car.rotation;
  }

  isCurveAhead() {
    const lookAhead = (this.currentWaypointIndex + 3) % WAYPOINTS.length;
    const target = WAYPOINTS[lookAhead];
    const current = WAYPOINTS[this.currentWaypointIndex];

    const angle1 = Math.atan2(
      WAYPOINTS[(this.currentWaypointIndex + 1) % WAYPOINTS.length].x - current.x,
      WAYPOINTS[(this.currentWaypointIndex + 1) % WAYPOINTS.length].z - current.z
    );
    const angle2 = Math.atan2(target.x - current.x, target.z - current.z);

    let angleDiff = Math.abs(angle1 - angle2);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

    return angleDiff > 0.3;
  }

  reset() {
    this.currentWaypointIndex = 0;
  }
}
