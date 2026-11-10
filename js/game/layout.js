// Shared restaurant layout: world positions for both locations + the walk graph.
// Owned by the scene builder. Pure data + small helpers, no DOM, no three.js: the game logic
// (node tests) imports it too.
//
// Units: world units at KayKit native scale, treated as metres (a kitchen counter is 2 x 2 and
// 1 tall, a small round table 1.5 wide, a character about 2.4 tall). x and z on the floor, y up.
// Floor points are [x, z]; points with height are [x, y, z]. facing = rotation about y in
// radians, 0 = looking toward +z, PI/2 = looking toward +x. The camera looks at the room
// diagonally from its open front corner (+x, +z), so the x = z diagonal is the vertical axis
// of the screen: the kitchen corner (-x, -z) at the top, the door corner (+x, +z) at the bottom;
// a figure facing PI/4 looks straight at the camera.
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
//      cooks hand over dishes (the table corner toward the camera);
//      seat.plate = [x, y, z] where the dish stands on the table in front of that seat;
//      seat.chair = { pos: [x, z], facing } the chair model (scene)
//   stations [{ id, pos, facing, cookSpot, node, dishSpot, helperSpot, helperNode, helperDishSpot }]
//      pos = centre of the station model, facing = model rotation (its front, toward the room),
//      cookSpot = [x, z] where the cook stands (also graph node `node`, in the lane between the
//      counter and the wall), dishSpot = [x, y, z] where the finished dish waits on the counter;
//      helper* = the same for a second cook helping at the station (1 unit along the wall)
//   cookHomes ['node', ...]                         where idle cooks wait (one per cook)
//   kitchen { shape: 'L', minZ, maxZ, depth, reach, lane, counter, pass: [], open }
//      the L-shaped kitchen: within `depth` of either back wall, up to `reach` along it; cooks
//      at `lane` from the wall, counter centres at `counter` from the wall
//   obstacles [{ kind, x0, x1, z0, z1 }]            decor the walks avoid (sink, fridge, dresser)
//   iso true, swapped true|undefined                 swapped = plan mirrored across x = z
//   graph { nodes: { id: [x, z] }, edges: [[a, b], ...] }
//   speeds { customer, cook }                       base walk speeds in units per second
//   path(from, to) -> [[x, z], ...] and pathLength(from, to) -> number (cached shortest path)
//   pointAt(from, to, s, out) -> [x, z] at distance s along the path (no allocation)

const H = Math.PI / 2;
const r2 = (v) => Math.round(v * 100) / 100;

// Mirror a built layout across the x = z diagonal (the iso camera looks along it, so this
// flips the restaurant left <-> right on screen while every walk keeps its length).
// A direction at angle f (sin f, cos f) becomes (cos f, sin f), i.e. PI/2 - f.
function swapXZ(L) {
  const p2 = (p) => { const t = p[0]; p[0] = p[1]; p[1] = t; return p; };
  const p3 = (p) => { const t = p[0]; p[0] = p[2]; p[2] = t; return p; };
  const f = (a) => r2(H - a);
  const b = L.bounds;
  L.bounds = { minX: b.minZ, maxX: b.maxZ, minZ: b.minX, maxZ: b.maxX };
  p2(L.door.pos);
  L.queue.forEach(p2);
  for (const t of L.tables) {
    p2(t.pos);
    for (const s of t.seats) { p2(s.pos); s.facing = f(s.facing); p3(s.plate); p2(s.chair.pos); s.chair.facing = f(s.chair.facing); }
  }
  for (const s of L.stations) {
    p2(s.pos); s.facing = f(s.facing); p2(s.cookSpot); p3(s.dishSpot); p2(s.helperSpot); p3(s.helperDishSpot);
  }
  for (const id in L.graph.nodes) p2(L.graph.nodes[id]);
  if (L.obstacles) for (const o of L.obstacles) { [o.x0, o.z0] = [o.z0, o.x0]; [o.x1, o.z1] = [o.z1, o.x1]; }
  L.swapped = true;
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

// ------------------------------------------------------------------ iso plan builder
// The diagonal camera looks at the room from its open front corner (x = z = maxX), so the
// plan is laid out around the x = z diagonal (the vertical axis of the screen):
//   - kitchen as an L in the far corner: station counters along the back-left wall (x = minX,
//     facing +x) and the back-right wall (z = minZ, facing +z); the cooks work in a lane
//     between the counters and the wall, facing the room and the camera
//   - tables with both chairs on the far side (seat a on the -x side facing +x, seat b on the
//     -z side facing +z), so every seated guest faces the camera at 3/4; cooks hand the dish
//     over at the table's front corner (front = the +x +z side)
//   - door = the open front corner, the path leaves along the diagonal
// def: { id, bounds, stations: [{ id, wall: 'left'|'right', at }], tables: [[x, z]...],
//        lane, counter, kitchenReach, nodes: { name: [x, z] }, edges: [[a, b]...], alias,
//        obstacles, homes: [[x, z]...], door: [x, z], doorPos, out: [x, z], queue: [[x, z]...],
//        speeds, swap }
// Table derived nodes: t<n>f (front), t<n>L (approach to seat a), t<n>R (approach to seat b);
// a name in def.alias maps several of them onto one shared hub node.
const SEAT = 1.15, CHAIR = 1.25, FRONT = 0.92, APPROACH = 1.15;
function buildIso(def) {
  const nodes = {};
  const edges = [];
  const alias = def.alias || {};
  const name = (id) => alias[id] || id;
  const node = (id, x, z) => { id = name(id); if (!nodes[id]) nodes[id] = [r2(x), r2(z)]; return id; };
  const edge = (a, b) => { a = name(a); b = name(b); if (a !== b) edges.push([a, b]); };
  for (const id in def.nodes) node(id, def.nodes[id][0], def.nodes[id][1]);

  const tables = def.tables.map(([x, z], i) => {
    const id = 't' + (i + 1);
    const front = node(id + 'f', x + FRONT, z + FRONT);
    const L = node(id + 'L', x - SEAT, z + APPROACH);
    const R = node(id + 'R', x + APPROACH, z - SEAT);
    const seats = [
      { id: id + 'a', pos: [r2(x - SEAT), z], facing: H, plate: [r2(x - 0.36), 1.0, z], chair: { pos: [r2(x - CHAIR), z], facing: H } },
      { id: id + 'b', pos: [x, r2(z - SEAT)], facing: 0, plate: [x, 1.0, r2(z - 0.36)], chair: { pos: [x, r2(z - CHAIR)], facing: 0 } },
    ];
    node(seats[0].id, seats[0].pos[0], seats[0].pos[1]);
    node(seats[1].id, seats[1].pos[0], seats[1].pos[1]);
    edge(front, L); edge(front, R); edge(L, seats[0].id); edge(R, seats[1].id);
    return { id, pos: [x, z], front, seats };
  });

  const { minX, minZ } = def.bounds;
  // the cooks work BEHIND the counters, facing the room (and the camera): a lane along each
  // back wall (cooks at `lane` from the wall), the station counter (2 x 2) in front of it with
  // its centre at `counter` from the wall, its front (knobs, oven door) toward the room
  const lane = def.lane, ctr = def.counter;
  const stations = def.stations.map((s) => {
    const left = s.wall === 'left';
    const id = 'st_' + s.id, hid = 'sh_' + s.id;
    const pos = left ? [minX + ctr, s.at] : [s.at, minZ + ctr];
    const spot = left ? [minX + lane, s.at] : [s.at, minZ + lane];
    const help = left ? [minX + lane, s.at + 1] : [s.at + 1, minZ + lane];
    node(id, spot[0], spot[1]);
    node(hid, help[0], help[1]);
    const d = ctr + 0.45; // dish on the counter, toward its front edge
    return {
      id: s.id,
      pos,
      facing: left ? H : 0,
      cookSpot: nodes[id].slice(),
      node: id,
      dishSpot: left ? [r2(minX + d), 1.1, r2(s.at - 0.5)] : [r2(s.at - 0.5), 1.1, r2(minZ + d)],
      helperSpot: nodes[hid].slice(),
      helperNode: hid,
      helperDishSpot: left ? [r2(minX + d), 1.1, r2(s.at + 0.5)] : [r2(s.at + 0.5), 1.1, r2(minZ + d)],
    };
  });

  node('door', def.door[0], def.door[1]);
  node('out', def.out[0], def.out[1]);
  edge('out', 'door');
  const queue = def.queue.map((p, i) => { const q = node('q' + (i + 1), p[0], p[1]); edge('door', q); return p.slice(); });
  const homes = def.homes.map((p, i) => node('h' + (i + 1), p[0], p[1]));
  for (const [a, b] of def.edges) edge(a, b);
  for (const [a, b] of edges) if (!nodes[a] || !nodes[b]) throw new Error('layout ' + def.id + ': bad edge ' + a + '-' + b);

  const layout = {
    id: def.id,
    bounds: def.bounds,
    door: { pos: def.doorPos || def.door.slice(), node: 'door', outside: 'out' },
    queue,
    tables,
    stations,
    cookHomes: homes,
    // the L-shaped kitchen: everything closer than `depth` to a back wall, up to `reach`
    kitchen: { minZ, maxZ: minZ + ctr + 1, depth: ctr + 1, reach: def.kitchenReach, lane, counter: ctr, pass: [], open: [def.bounds.minX, def.bounds.maxX], shape: 'L' },
    obstacles: (def.obstacles || []).map((o) => ({ ...o })),
    graph: { nodes, edges },
    speeds: def.speeds,
    iso: true,
  };
  if (def.swap) swapXZ(layout);
  attachPaths(layout);
  return layout;
}

// ------------------------------------------------------------------ location 1: Village Inn
// 14 x 14 room. Kitchen L in the far corner (fridge in the corner): Juice Bar and Stew Pot on
// the back-left wall, Grill and Oven on the back-right wall, a sink / dresser closing each arm.
// Six tables in a 3-2-1 pyramid that points at the door corner (screen rows: t4 t3 t5 by the
// kitchen, t1 t2 in the middle, t6 by the door). Tables 1-2 are owned at the start.
const ISO = {
  bounds: { minX: -7, maxX: 7, minZ: -7, maxZ: 7 },
  lane: 0.75,
  counter: 2.2,
  kitchenReach: 0.6,
  stations: [
    { id: 's0', wall: 'left', at: -3.4 }, { id: 's1', wall: 'right', at: -3.4 },
    { id: 's2', wall: 'left', at: -1.4 }, { id: 's3', wall: 'right', at: -1.4 },
  ],
  tables: [[0.71, 3.54], [3.54, 0.71], [-0.57, -0.57], [-3.0, 2.6], [2.6, -3.0], [4.53, 4.53]],
  alias: { t1R: 'H12', t2L: 'H12', t3L: 'H34', t4R: 'H34', t3R: 'H35', t5L: 'H35' },
  nodes: {
    C: [-6.25, -6.25],          // where the two cook lanes meet (the cooks' corner)
    EL: [-6.25, 0.45],          // the lanes come out past the end of each counter row
    ER: [0.45, -6.25],
    XL: [-2.9, 0.05],           // ... into the dining room
    XR: [0.05, -2.9],
    H12: [2.07, 2.07], H34: [-1.85, 0.85], H35: [0.85, -1.85],
  },
  edges: [
    ['C', 'st_s0'], ['st_s0', 'sh_s0'], ['sh_s0', 'st_s2'], ['st_s2', 'sh_s2'], ['sh_s2', 'EL'], ['EL', 'XL'],
    ['C', 'st_s1'], ['st_s1', 'sh_s1'], ['sh_s1', 'st_s3'], ['st_s3', 'sh_s3'], ['sh_s3', 'ER'], ['ER', 'XR'],
    ['XL', 'H34'], ['XR', 'H35'],
    ['H12', 't1b'], ['H12', 't2a'], ['H12', 't3f'], ['t1f', 'H12'], ['t2f', 'H12'],
    ['t3f', 'H34'], ['t3f', 'H35'],
    ['H34', 't4f'], ['H35', 't5f'],
    ['t4f', 't1L'], ['t5f', 't2R'],
    ['t6L', 't1f'], ['t6R', 't2f'],
    ['door', 't6f'],
    ['h1', 'C'], ['h2', 'C'], ['h3', 'C'], ['h4', 'C'],
  ],
  // decor the walks must avoid (canonical): sink + fridge past the back-right arm, a dresser
  // past the back-left arm
  obstacles: [
    { kind: 'sink', x0: 1.6, x1: 3.6, z0: -7, z1: -5 }, { kind: 'fridge', x0: 4.6, x1: 6.6, z0: -7, z1: -5 },
    { kind: 'dresser', x0: -7, x1: -5.2, z0: 1.6, z1: 3.6 },
  ],
  homes: [[-5.45, -6.2], [-6.2, -5.45], [-6.3, -4.65], [-4.65, -6.3]],
  door: [6.25, 6.25],
  doorPos: [6.4, 6.4],
  out: [9.4, 9.4],
  queue: [[7.4, 8.3], [8.3, 7.4], [8.4, 9.0]],
};
const named = (ids) => ISO.stations.map((s, i) => ({ ...s, id: ids[i] }));
const renameEdges = (ids) => ISO.edges.map((e) => e.map((n) => n.replace(/^(st|sh)_s(\d)$/, (m, p, d) => p + '_' + ids[+d])));
const INN_IDS = ['juice', 'grill', 'stew', 'oven'];
const INN = buildIso({
  ...ISO,
  id: 'inn',
  stations: named(INN_IDS),
  edges: renameEdges(INN_IDS),
  speeds: { customer: 2.8, cook: 3.9 },
});

// ------------------------------------------------------------------ location 2: Harbor Tavern
// The same plan mirrored across the diagonal (swap): the first station is on the back-right
// wall, the sink and the sea-view windows swap sides, so it reads as a different room while
// every walk keeps its length (same pacing).
const HARBOR_IDS = ['cocoa', 'veggie', 'soup', 'roast'];
const HARBOR = buildIso({
  ...ISO,
  id: 'harbor',
  swap: true,
  stations: named(HARBOR_IDS),
  edges: renameEdges(HARBOR_IDS),
  speeds: { customer: 2.8, cook: 3.9 },
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
