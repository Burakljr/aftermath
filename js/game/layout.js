// Shared restaurant layout: world positions for both locations + the walk graph.
// Owned by the scene builder. Pure data + small helpers, no DOM, no three.js: the game logic
// (node tests) imports it too.
//
// Units: world units at KayKit native scale, treated as metres (a kitchen counter is 2 x 2 and
// 1 tall, a small round table 1.5 wide, a character about 2.4 tall). x to the right, z toward
// the camera (bottom of the screen), y up. Floor points are [x, z]; points with height are
// [x, y, z]. facing = rotation about y in radians, 0 = looking toward +z (the camera / the
// door), PI/2 = looking toward +x, PI = looking at the back wall.
//
// Timing contract: the logic times every walk as pathLength(from, to) / speed and stores
// { from, to, t, dur } on the walking entity; the scene places it at progress t / dur along
// path(from, to). Both sides use the same graph, so they always agree.
//
// Schema of a layout (LAYOUTS[id]):
//   id, bounds { minX, maxX, minZ, maxZ }          room floor (walls stand on the edges)
//   door { pos, node, outside }                     door centre; graph node inside; node outside
//   queue [[x, z], ...]                             spots by the door (graph nodes q1..q3)
//   tables [{ id, pos, front, seats: [{ id, pos, facing, plate, chair }] }]
//      seat.id is also its graph node (where the guest sits); table.front is the node where
//      cooks hand over dishes (kitchen side of the table, the cook faces the camera);
//      seat.plate = [x, y, z] where the dish stands on the table in front of that seat;
//      seat.chair = { pos: [x, z], facing } the chair model (scene)
//   stations [{ id, pos, facing, cookSpot, node, dishSpot }]
//      pos = centre of the station model (against the back wall), facing = model rotation,
//      cookSpot = [x, z] where the cook stands (also graph node `node`), dishSpot = [x, y, z]
//      where the finished dish waits on the counter
//   cookHomes ['node', ...]                         where idle cooks wait (one per cook)
//   kitchen { minZ, maxZ, pass: [{ x0, x1, z }], open: [x0, x1] }   kitchen floor + pass counters
//   graph { nodes: { id: [x, z] }, edges: [[a, b], ...] }
//   speeds { customer, cook }                       base walk speeds in units per second
//   path(from, to) -> [[x, z], ...] and pathLength(from, to) -> number (cached shortest path)
//   pointAt(from, to, s, out) -> [x, z] at distance s along the path (no allocation)

const H = Math.PI / 2;
const r2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ builder
// def: { id, bounds, door: { x, z, out }, rows: [z...], gaps: [z...] (one more than rows:
// above row 0 ... below the last row), aisles: [x...] (free columns joining the gap lines),
// tables: [{ pos: [x, z] }], stations: [{ id, x }], stationZ, cookZ, passZ, open: [x0, x1],
// pass: [{ x0, x1 }], homes: [[x, z]...], queue: [[x, z]...], seatDx, frontDz, speeds }
function build(def) {
  const nodes = {};
  const edges = [];
  const lines = def.gaps.map(() => new Set()); // x positions on each gap line
  const gid = (i, x) => 'g' + i + '_' + r2(x);
  const node = (id, x, z) => { nodes[id] = [r2(x), r2(z)]; return id; };
  for (const x of def.aisles) for (const s of lines) s.add(r2(x));

  // tables: seats left / right facing the table; guests come from the gap below (door side),
  // cooks hand over from the gap above (kitchen side)
  const tables = def.tables.map((t, i) => {
    const id = 't' + (i + 1);
    const [x, z] = t.pos;
    let row = 0;
    for (let k = 0; k < def.rows.length; k++) if (Math.abs(def.rows[k] - z) < Math.abs(def.rows[row] - z)) row = k;
    const sx = def.seatDx;
    const front = node(id + 'f', x, z - def.frontDz);
    lines[row].add(r2(x));
    edges.push([front, gid(row, x)]);
    const seats = [
      { id: id + 'a', pos: [r2(x - sx), z], facing: H, plate: [r2(x - 0.38), 1.0, z], chair: { pos: [r2(x - sx - 0.1), z], facing: H } },
      { id: id + 'b', pos: [r2(x + sx), z], facing: -H, plate: [r2(x + 0.38), 1.0, z], chair: { pos: [r2(x + sx + 0.1), z], facing: -H } },
    ];
    for (const s of seats) {
      node(s.id, s.pos[0], s.pos[1]);
      lines[row + 1].add(r2(s.pos[0]));
      edges.push([s.id, gid(row + 1, s.pos[0])]);
    }
    return { id, pos: [x, z], front, seats };
  });

  // door
  const dx = def.door.x;
  const last = def.gaps.length - 1;
  lines[last].add(r2(dx));
  node('door', dx, def.door.z);
  node('out', dx, def.door.out);
  edges.push(['out', 'door'], ['door', gid(last, dx)]);
  const queue = def.queue.map((p, i) => { const q = node('q' + (i + 1), p[0], p[1]); edges.push(['door', q]); return p; });

  // gap lines: chain the points of each line, aisles join neighbouring lines
  def.gaps.forEach((z, i) => {
    const xs = [...lines[i]].sort((a, b) => a - b);
    xs.forEach((x) => node(gid(i, x), x, z));
    for (let k = 1; k < xs.length; k++) edges.push([gid(i, xs[k - 1]), gid(i, xs[k])]);
  });
  for (const x of def.aisles) for (let i = 1; i < def.gaps.length; i++) edges.push([gid(i - 1, x), gid(i, x)]);

  // kitchen: the cook spots form one line, joined to the opening in the pass
  const kz = def.cookZ;
  const ox = r2((def.open[0] + def.open[1]) / 2);
  if (!lines[0].has(ox)) throw new Error('layout ' + def.id + ': the pass opening needs an aisle');
  const kitchenXs = new Set(def.stations.map((s) => r2(s.x)));
  kitchenXs.add(ox);
  const kxs = [...kitchenXs].sort((a, b) => a - b);
  const kid = (x) => 'k_' + r2(x);
  kxs.forEach((x) => node(kid(x), x, kz));
  for (let k = 1; k < kxs.length; k++) edges.push([kid(kxs[k - 1]), kid(kxs[k])]);
  node('gap', ox, def.passZ);
  edges.push([kid(ox), 'gap'], ['gap', gid(0, ox)]);
  const homes = def.homes.map((p, i) => {
    const h = node('h' + (i + 1), p[0], p[1]);
    let best = kxs[0];
    for (const x of kxs) if (Math.abs(x - p[0]) < Math.abs(best - p[0])) best = x;
    edges.push([h, kid(best)]);
    return h;
  });
  const stations = def.stations.map((s) => {
    const id = 'st_' + s.id;
    node(id, s.x, kz - 0.01); // right in front of the station, on the kitchen line
    edges.push([id, kid(s.x)]);
    return {
      id: s.id,
      pos: [s.x, def.stationZ],
      facing: 0,
      cookSpot: nodes[id].slice(),
      node: id,
      dishSpot: [r2(s.x + 0.5), 1.1, r2(def.stationZ + 0.6)],
    };
  });

  const layout = {
    id: def.id,
    bounds: def.bounds,
    door: { pos: [dx, def.bounds.maxZ], node: 'door', outside: 'out' },
    queue,
    tables,
    stations,
    cookHomes: homes,
    kitchen: {
      minZ: def.bounds.minZ,
      maxZ: def.passZ + 1,
      pass: def.pass.map((p) => ({ x0: p.x0, x1: p.x1, z: def.passZ })),
      open: def.open.slice(),
    },
    graph: { nodes, edges },
    speeds: def.speeds,
  };
  attachPaths(layout);
  return layout;
}

// ------------------------------------------------------------------ paths (Dijkstra, cached)
function attachPaths(layout) {
  const { nodes, edges } = layout.graph;
  const adj = {};
  for (const id in nodes) adj[id] = [];
  for (const [a, b] of edges) {
    if (!nodes[a] || !nodes[b]) throw new Error('layout ' + layout.id + ': bad edge ' + a + '-' + b);
    if (a === b) continue;
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
  const cache = new Map();
  function route(from, to) {
    const key = from + '>' + to;
    let r = cache.get(key);
    if (r) return r;
    if (!nodes[from] || !nodes[to]) {
      r = { points: [], length: 0 };
      if (nodes[from]) r.points = [nodes[from]];
      cache.set(key, r);
      return r;
    }
    const dist = { [from]: 0 };
    const prev = {};
    const done = new Set();
    for (;;) {
      let u = null;
      let best = Infinity;
      for (const id in dist) if (!done.has(id) && dist[id] < best) { best = dist[id]; u = id; }
      if (u === null || u === to) break;
      done.add(u);
      for (const [v, d] of adj[u]) {
        const nd = best + d;
        if (dist[v] === undefined || nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = u; }
      }
    }
    const ids = [];
    if (dist[to] !== undefined) {
      for (let id = to; id !== undefined; id = prev[id]) { ids.push(id); if (id === from) break; }
      ids.reverse();
    }
    r = { points: ids.map((id) => nodes[id]), length: dist[to] || 0 };
    cache.set(key, r);
    return r;
  }
  layout.path = (from, to) => route(from, to).points;
  layout.pathLength = (from, to) => route(from, to).length;
  // point at distance s along path(from, to), written into out ([x, z]); no allocation
  layout.pointAt = (from, to, s, out = [0, 0]) => {
    const pts = route(from, to).points;
    if (!pts.length) return out;
    let left = Math.max(0, s);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= d || i === pts.length - 1) {
        const k = d > 0 ? Math.min(1, left / d) : 1;
        out[0] = a[0] + (b[0] - a[0]) * k;
        out[1] = a[1] + (b[1] - a[1]) * k;
        return out;
      }
      left -= d;
    }
    out[0] = pts[0][0];
    out[1] = pts[0][1];
    return out;
  };
}

// ------------------------------------------------------------------ location 1: Village Inn
// 12 x 20 room. Kitchen along the back wall (z = -10): fridge, 4 stations, sink; cooks stand
// at z = -7.25. Pass counters at z = -5.5 on both sides, open in the middle (x -2..2). Dining
// room: 6 small round tables in 3 rows x 2 columns, a centre aisle, door at the bottom centre.
// Tables 1-2 (owned at the start) are the middle row; 3-4 the row by the kitchen; 5-6 by the door.
const INN = build({
  id: 'inn',
  bounds: { minX: -6, maxX: 6, minZ: -10, maxZ: 10 },
  stationZ: -9.0,
  cookZ: -7.25,
  passZ: -5.5,
  open: [-2, 2],
  pass: [{ x0: -6, x1: -2 }, { x0: 2, x1: 6 }],
  rows: [-1.7, 2.2, 6.1],
  gaps: [-3.6, 0.25, 4.15, 8.0],
  aisles: [0],
  seatDx: 1.22,
  frontDz: 1.3,
  tables: [
    { pos: [-3.2, 2.2] }, { pos: [3.2, 2.2] },
    { pos: [-3.2, -1.7] }, { pos: [3.2, -1.7] },
    { pos: [-3.2, 6.1] }, { pos: [3.2, 6.1] },
  ],
  stations: [{ id: 'juice', x: -3 }, { id: 'grill', x: -1 }, { id: 'stew', x: 1 }, { id: 'oven', x: 3 }],
  homes: [[-1.9, -6.75], [1.9, -6.75], [-4.4, -6.9], [4.4, -6.9]],
  door: { x: 0, z: 9.0, out: 12.4 },
  queue: [[-1.3, 9.2], [1.3, 9.2], [2.5, 9.3]],
  speeds: { customer: 3.0, cook: 3.6 },
});

// ------------------------------------------------------------------ location 2: Harbor Tavern
// Same pieces, a slightly different plan: the pass opening is right of the centre, the door is
// at the bottom left and the tables are staggered around an aisle right of the centre.
const HARBOR = build({
  id: 'harbor',
  bounds: { minX: -6, maxX: 6, minZ: -10, maxZ: 10 },
  stationZ: -9.0,
  cookZ: -7.25,
  passZ: -5.5,
  open: [-0.2, 3.8],
  pass: [{ x0: -6, x1: -0.2 }, { x0: 3.8, x1: 6 }],
  rows: [-1.7, 2.2, 6.1],
  gaps: [-3.6, 0.25, 4.15, 8.0],
  aisles: [1.8],
  seatDx: 1.22,
  frontDz: 1.3,
  tables: [
    { pos: [-2.4, 2.2] }, { pos: [4.2, 2.2] },
    { pos: [-3.6, -1.7] }, { pos: [4.2, -1.7] },
    { pos: [-1.2, 6.1] }, { pos: [4.2, 6.1] },
  ],
  stations: [{ id: 'cocoa', x: -3 }, { id: 'veggie', x: -1 }, { id: 'soup', x: 1 }, { id: 'roast', x: 3 }],
  homes: [[-0.9, -6.75], [4.9, -6.9], [-4.4, -6.9], [1.0, -6.75]],
  door: { x: -4.0, z: 9.0, out: 12.4 },
  queue: [[-2.7, 9.2], [-5.0, 9.2], [-1.5, 9.3]],
  speeds: { customer: 3.0, cook: 3.6 },
});

export const LAYOUTS = { inn: INN, harbor: HARBOR };

export function getLayout(id) {
  return LAYOUTS[id] || INN;
}

// Standalone helpers (same as layout.path / layout.pathLength).
export function path(layoutOrId, from, to) {
  const l = typeof layoutOrId === 'string' ? getLayout(layoutOrId) : layoutOrId;
  return l.path(from, to);
}
export function pathLength(layoutOrId, from, to) {
  const l = typeof layoutOrId === 'string' ? getLayout(layoutOrId) : layoutOrId;
  return l.pathLength(from, to);
}
