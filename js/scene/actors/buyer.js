// Yard visitors (A5): Rıza's van on 'sale' (drives in from the BUYER exit, backs up to the loading spot,
// crates go in, leaves) and the drive-in of a newly bought vehicle on 'purchase' (from the BUYER exit to
// its bay). Visual only; state never waits for it.
import { makeVehicle } from './vehicles.js';
import { Path } from './fleet.js';

const DRIVE = 5.0, LOAD = 3.2;

export function createBuyer(world, { fleet }) {
  const van = makeVehicle('van', 'player', world.materials.vehicle);
  van.mesh.visible = false; van.mesh.castShadow = true;
  world.scene.add(van.mesh);
  const pin = new Path(), pout = new Path();
  pin.route(world, 'BUYER', 'LOAD');
  pout.route(world, 'LOAD', 'BUYER');
  const p = { x: 0, z: 0, dx: 0, dz: 1 };
  let t0 = -99, queued = 0, lastT = 0;
  function place(P, s, rev) {
    P.at(s, p);
    const lane = 3 * Math.min(1, Math.min(s, P.len - s) / 10);
    const x = p.x - p.dz * lane, z = p.z + p.dx * lane;
    van.mesh.position.set(x, world.groundY(x, z), z);
    van.mesh.rotation.set(0, Math.atan2(p.dx, p.dz) + (rev ? Math.PI : 0), 0);
  }
  return {
    update(state, t) {
      lastT = t;
      const k = t - t0;
      const total = DRIVE * 2 + LOAD;
      if (k < 0 || k > total) {
        van.mesh.visible = false;
        if (queued > 0 && (k > total || t0 < -90)) { queued--; t0 = t; }
        return;
      }
      van.mesh.visible = true;
      if (k < DRIVE) { const e = k / DRIVE; place(pin, (e * e * (3 - 2 * e)) * pin.len, false); }
      else if (k < DRIVE + LOAD) {
        place(pin, pin.len, false);
        const c = Math.floor((k - DRIVE) / 0.8);
        if (c !== this._c) { this._c = c; const L = world.layout.YARD.crates; world.fx.dust((L.x0 + L.x1) / 2, 1.5, (L.z0 + L.z1) / 2, 2, { size: 4, spread: 3, rise: 1.5, life: 1.2 }); }
      } else { const e = (k - DRIVE - LOAD) / DRIVE; place(pout, (e * e * (3 - 2 * e)) * pout.len, false); }
    },
    event(type, ev, t) {
      if (type === 'sale') { if (lastT - t0 > DRIVE * 2 + LOAD || t0 < -90) t0 = t; else queued = Math.min(1, queued + 1); }
      if (type === 'purchase' && ev && ev.vehicleId) fleet.driveIn(ev.vehicleId, t);
    },
    count() { return van.mesh.visible ? 1 : 0; },
    dispose() { world.scene.remove(van.mesh); },
  };
}
