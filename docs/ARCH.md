# Aftermath v2: architecture and module contracts

Status: phase-1 plan. Builders code against this file. Rules, copy and balance come from `docs/DESIGN.md`; looks come from `docs/UI-SPEC.md` (Saha) and proto-B. If a builder must change a contract here, they edit this file in the same change and report it.

Chains: **logic → ui** and **scene-world → scene-actors** run in parallel, then **integrator** joins them.

---

## 0. Ground rules for all builders

- Static ES modules, no build step, no CDN, no runtime network fetch. Relative paths only. three.js via import map (`three`, `three/addons/`).
- `js/game/**` is pure logic: no DOM, no `window`, no `navigator`, no three. It must import and run in Node 22 (`node --test`). It may import `../bus.js`.
- `js/scene/**` is the 3D view: three.js only, no game rules, no DOM except its canvas. It never imports `js/game/**` or `js/ui/**`; it reads the plain state object it is given (section 5.2) and constants it owns.
- `js/ui/**` is DOM: no three. It imports `js/game/index.js` and `js/bus.js`. It talks to the scene only through the `deps.scene` object it receives.
- Logic never calls `Date.now()` inside `tick`. Game time is `s.clock` (seconds). Real time is used only by `save()` (`lastSave`) and by main for offline time.
- Logic randomness only through `js/game/rng.js` (`rand()`), so tests can seed it.
- Hot loops (scene update, chip projection) allocate nothing per frame: reuse vectors, pools, typed arrays.
- Copy: DESIGN §9. No emoji, no "!", no banned words, a unit on every number, Turkish formatting, literal Turkish caps (`İ`, `I`). Every gameplay string lives in `js/game/copy.js`; static UI labels live in the ui module that renders them. Both are linted (section 9).
- Do not commit, push or touch git config. Do not edit files you do not own (section 1). Do not touch v1 files: the integrator deletes them at the end.
- Screenshots go to `scratchpad/v2/<role>/`; progress notes to `scratchpad/v2/progress-<role>.md` (scratchpad = `/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad`).

---

## 1. File tree and owners

Owner keys: **L** logic, **W** scene-world, **A** scene-actors, **U** ui, **I** integrator. Every file has exactly one owner.

```
index.html                         I   game shell, import map, layers, sprite inline
manifest.webmanifest               I
sw.js                              I   network-first, CACHE 'aftermath-v2'
README.md, LICENSES.md             I   (builders put licence lines in their progress notes)
docs/ARCH.md                       architect, then I
tools/serve.mjs                    I   unchanged (PORT env)
tools/balance.mjs                  L   headless pacing simulation (prints a contract table)
js/bus.js                          I   unchanged
js/audio.js                        I   small edits only (section 3.4)
js/main.js                         I   glue (section 8)

js/game/index.js                   L   barrel: the whole game API (section 4)
js/game/data.js                    L   DISTRICTS, ITEMS, CREWS, RECIPES, MONSTERS, BAL, ATTACK, GOALS data, BUYERS
js/game/rng.js                     L   rand(), setSeed(n), setRandom(fn)
js/game/format.js                  L   fmtMoney, fmtTime, fmtDur, fmtPct, fmtTon, fmtInt, trUpper
js/game/copy.js                    L   all gameplay strings (NPC lines, objectives, reasons, toasts, headlines, receipt labels)
js/game/state.js                   L   newState, load, save, wipe, normalize, hasV1Save
js/game/sim.js                     L   tick: phases, attack, cleanup, fleet travel, spread, factory, market, upkeep, rival
js/game/actions.js                 L   act(s, id, arg) dispatcher + every player action
js/game/tender.js                  L   estimate dry-run, chance grid, honest resolve, reveal sampling
js/game/ftue.js                    L   FTUE step table, ftueView, ftueAllows, debugFtue
js/game/goals.js                   L   goal chain G1..G15, objective priority
js/game/select.js                  L   UI selectors (pure, cheap)
js/game/debug.js                   L   debugScenario(name), debugUnlockAll (used by tests, ui-lab, main hooks)

js/scene/scene.js                  W   createScene facade (section 5)
js/scene/layout.js                 W   world grid, district rects, road graph, yard, corpsePlacement (section 6)
js/scene/util.js                   W   rng, noise, Builder, merge helpers (ported from proto-B)
js/scene/env.js                    W   sky, sun, fog, sea, time-of-day presets per phase
js/scene/post.js                   W   post chain (grade, bloom, vignette), quality-aware
js/scene/materials.js              W   facade/ground/sea shaders, shared actor materials (vehicle, glow, beacon)
js/scene/city.js                   W   static city: 6 district identities, roads, Kordon promenade, hills, landmarks
js/scene/districts.js              W   per-district runtime: variant toggles, lights wave, cones, upkeep dressing, highlights
js/scene/damage.js                 W   deterministic damaged variants, time-sliced build queue, crater + scatter
js/scene/rubble.js                 W   rubble piles with 3 discrete steps
js/scene/fx.js                     W   flames, smoke, steam, dust, sparks, embers, debris, water stream, flash, ring (pooled)
js/scene/camera.js                 W   gameplay rig: band view offset, frame(), zoom stops, pan clamp, shake, override hook
js/scene/picking.js                W   ground raycast -> district/yard, vehicle screen-space pick (via actors)
js/scene/anchors.js                W   project(anchor)
js/scene/yard.js                   W   garage bays, gate, crate stacks from inv, factory shed glow, company sign
js/scene/traffic.js                W   civilian cars, parked cars, pedestrians, gulls, cars-out wave on clean
js/scene/quality.js                W   'high' / 'low' presets, budget counters
js/scene/lab/lab.js                W   scene-lab driver (URL params, buttons, __setTime, stats overlay)
js/scene/lab/fake-state.js         W   builds state-v2-shaped objects for every phase (section 5.2 subset)
js/scene/lab/fake-sim.js           W   tiny rule mimic: eta countdown, value drain, events
js/scene/lab/actor-cases.js        A   extra lab buttons for actors (W ships an empty stub exporting [])
scene-lab.html                     W
vendor/three/**                    W   copied from proto-B (r187 module build + used addons + LICENSE)

js/scene/actors/index.js           A   createActors(world) (W ships a no-op stub with the full shape)
js/scene/actors/vehicles.js        A   meshes + liveries: fire truck, excavator, tipper, crane truck, buyer van, rival
js/scene/actors/fleet.js           A   fleet entity -> vehicle instance, path follow, yard parking, beacons
js/scene/actors/work.js            A   water arcs, excavator + tipper shuttle, crane + tarps + sparks + crates
js/scene/actors/route.js           A   dashed route line on dispatch
js/scene/actors/buyer.js           A   buyer van visit on 'sale', drive-in on 'purchase'
js/scene/actors/magmadon.js        A   Magmadon model (alive + corpse pose), carve chunks, mutant palette
js/scene/actors/corpse.js          A   placement from layout.corpsePlacement, per-district carve steps, rare glint
js/scene/actors/robot.js           A   KALKAN-07
js/scene/actors/attack.js          A   attack cinematic director (pose = f(attack, t)), camera override

js/ui/index.js                     U   createUI(root, deps)
js/ui/dom.js                       U   h(), icon(), tap(), shake(), rollup helpers
js/ui/layout.js                    U   skeleton, layers, band computation
js/ui/hud.js  objective.js  tabs.js  panel-city.js  fleet-strip.js  district-sheet.js  upkeep-sheet.js
js/ui/call.js  npc.js  tender.js  receipt.js  depot.js  factory.js  company.js  settings.js  news.js
js/ui/notices.js  world.js  floats.js  broadcast.js  title.js  ftue-view.js  unlock.js  toasts.js
js/ui/motion.js  haptics.js  loading.js                       U   (one component per file, section 7)
js/ui/lab/lab.js, js/ui/lab/fixtures.js, js/ui/lab/fake-scene.js   U
ui-lab.html                        U
css/fonts.css  css/ui.css  css/game.css                       U   (ui.css = Saha tokens + components)
assets/ui/fonts/**  assets/ui/icons/**                       U   copied from explore/ui (with OFL / MIT texts)
assets/lab/**                      U   static backgrounds for ui-lab only (proto-B shots), never loaded by the game

tests/logic/*.test.mjs             L   node tests/logic/run.mjs (= node --test tests/logic/*.test.mjs); helpers.mjs, bot.mjs
tests/scene/*.cjs                  W   (actors files: tests/scene/actors-*.cjs, owner A)
tests/ui/*.cjs                     U
tests/e2e/*.cjs, tests/shots.cjs   I
```

Deleted by I at the end: `js/data.js js/state.js js/sim.js js/ui.js js/render.js js/util.js css/style.css`.

Shared-file rule: W creates `js/scene/actors/index.js` and `js/scene/lab/actor-cases.js` as stubs in milestone W1. Ownership of both passes to A the moment A starts; W never edits them again.

---

## 2. World facts every module agrees on

### 2.1 Districts (2 columns × 3 rows) and rename table

Ids stay v1 ids at the DESIGN §5.1 positions. Row 0 is the far edge (sea, Kordon promenade). Row 2 is next to the yard.

```
        ~~~~~~~~~~~~~ Körfez ~~~~~~~~~~~~~      (sea, -z)
        ===== Kordon promenade + quay =====
  row 0 |  KORDON (0)     |  LİMAN (3)     |
  row 1 |  KEMERALTI (5)  |  KONAK (1)     |
  row 2 |  KÜLTÜRPARK (4) |  ALSANCAK (2)  |
        ============ çevre yolu ============
        [ AFTERMATH SAHASI: garaj · depo · fabrika · kapı ]   (+z, near camera)
```

| id | DESIGN name | v2 name | caps | col,row | identity (scene) | -da | -daki | -a | -dan | -ı | -ın |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Liman | Kordon | KORDON | 0,0 | waterfront apartments, palms, promenade | Kordon'da | Kordon'daki | Kordon'a | Kordon'dan | Kordon'u | Kordon'un |
| 3 | Sanayi | Liman | LİMAN | 1,0 | port cranes, warehouses, ferry pier | Liman'da | Liman'daki | Liman'a | Liman'dan | Liman'ı | Liman'ın |
| 5 | Eski Çarşı | Kemeraltı | KEMERALTI | 0,1 | low dense old bazaar, narrow lanes, awnings | Kemeraltı'nda | Kemeraltı'ndaki | Kemeraltı'na | Kemeraltı'ndan | Kemeraltı'nı | Kemeraltı'nın |
| 1 | Merkez | Konak | KONAK | 1,1 | Saat Kulesi square (NW corner of the cell), civic blocks | Konak'ta | Konak'taki | Konak'a | Konak'tan | Konak'ı | Konak'ın |
| 4 | Park | Kültürpark | KÜLTÜRPARK | 0,2 | trees, pond, fair pavilions, low | Kültürpark'ta | Kültürpark'taki | Kültürpark'a | Kültürpark'tan | Kültürpark'ı | Kültürpark'ın |
| 2 | Finans | Alsancak | ALSANCAK | 1,2 | mid-rise residential, max 4 floors on its near half | Alsancak'ta | Alsancak'taki | Alsancak'a | Alsancak'tan | Alsancak'ı | Alsancak'ın |

`data.DISTRICTS[id] = { id, key, name, caps, col, row, loc, locAdj, dat, abl, acc, gen }` with exactly these forms. Copy never builds suffixes by hand. Neighbours come from `col,row` (4-neighbourhood). The FTUE district is Konak (1).

DESIGN copy that changes with the rename (all others: replace the name and use the table's suffix form):

| DESIGN | v2 |
|---|---|
| Canavar Merkez'e düştü. Yangın var, yol enkazla kapalı. | Canavar Konak'a düştü. Yangın var, yol enkazla kapalı. |
| Hedef: Merkez'deki yangını söndür / bubble "Merkez'e dokun." | Hedef: Konak'taki yangını söndür / "Konak'a dokun." / "Konak'a tekrar dokun." |
| Merkez teslim edildi | Konak teslim edildi |
| Contract #2 call: "Kafa Merkez'de, gövde Park'ta. Eski Çarşı'da da enkaz var." | "Kafa Konak'ta, gövde Alsancak'ta. Kemeraltı'nda da enkaz var." (+ "Süre 2 dk 10 sn; erken biterse prim öderiz.") |
| Nevin: "Park'taki yangın Eski Çarşı'ya sıçramak üzere." | "Alsancak'taki yangın Kültürpark'a sıçramak üzere." |
| Headline: "Magmadon Liman açıklarında. Kalkan dronları havalandı." | "Magmadon Liman açıklarında. KALKAN-07 sahada." |
| "Aftermath sözünü tuttu. Merkez'de trafik açıldı." | "Aftermath sözünü tuttu. {locOf(lastDistrict)} trafik açıldı." |
| "Eski Çarşı esnafı: 'Koku hâlâ dükkânda.'" | "Kemeraltı esnafı: 'Koku hâlâ dükkânda.'" |
| "Yangın Park'tan Eski Çarşı'ya sıçradı." | template "Yangın {abl} {dat} sıçradı." |
| "Eski Çarşı'da çay ocağı açıldı. İlk çaylar itfaiyeye." | "Kemeraltı'nda çay ocağı açıldı. İlk çaylar itfaiyeye." |
| "Park gölünde tanımsız balıklar görüldü." | "Kültürpark havuzunda tanımsız balıklar görüldü." |
| "Merkez · Bakım sözleşmesi · Kademe 1 …" | "Konak · Bakım sözleşmesi · Kademe 1 …" |
| TV bug "CANLI · AFT HABER", drones | "CANLI · Körfez Haber"; KALKAN-07 knocks the monster down (no drones) |

### 2.2 Phases (names are fixed: audio.js depends on them)

`'calm' | 'attack' | 'tender' | 'cleanup' | 'rival'`. A direct award ("call") is phase `'tender'` with `s.tender.kind === 'call'`. A pending receipt is phase `'calm'` with `s.result !== null` (radar paused until collected).

```
calm --(timer 0 or skip)--> attack --(t >= end)--> tender(call|bid)
tender(call) --acceptCall--> cleanup
tender(bid) --submitTender--> tender(reveal) --startWork--> cleanup | --takeTail--> rival
cleanup --(all job districts clean)--> calm + result (radar paused) --collectPayment--> calm (radar runs)
rival --(rival done AND (tail carved OR releaseTail))--> calm
```

### 2.3 Attack timeline (logic owns the clock)

`s.attack.t` is the only clock for the attack; the scene and UI read it. Constants in `data.ATTACK`:

| key | value | meaning |
|---|---|---|
| `pre` | first attack 2.4, later 0 | `t` starts at `-pre` (TV intro, lower third readable) |
| `hit` | `BAL.attackHit` = 2.6 | impact: logic applies damage, emits `'hit'` (audio impact sound) |
| `end` | first 3.8, later 3.6 | phase leaves `'attack'` |
| `TL.walk` | [-pre, 1.8] | Magmadon wades ashore at Liman, footsteps (audio every 0.45 s) |
| `TL.robot` | 0.9 | KALKAN-07 lands (audio jets) |
| `TL.bursts` | [1.4, 2.35] | robot stun bursts (audio lasers), monster staggers |
| `TL.roar` | 1.85 | roar (audio) |
| `TL.cut` | 2.0 | cut from TV shot to the gameplay camera framing the chain |
| `TL.fall` | [2.0, 2.6] | the monster topples onto the chain (whistle in audio at 2.3) |
| `TL.settle` | [2.6, end] | dust ring, fires ignite, letterbox opens |

First attack: about 6.2 s; later: 3.6 s. Skip (`skipAttack`, allowed after the first attack, and during the first attack only via the FTUE "tap to skip" rule) sets `t = max(t, hit)` (so `'hit'` still fires) and then `t = end` on the next tick.

---

## 3. State v2

### 3.1 Shape (all fields always present after `newState()`/`load()`)

```js
State = {
  v: 2,
  clock: 0,                 // number, game seconds since newState; drives jobs, offers, news, buyer timing
  money: 1500,              // number, internal units; display = ×1000 ₺ (format.fmtMoney)
  trust: 50,                // number 0..100 (Güven)
  rivalTrust: 45,           // number 0..100
  phase: 'calm',            // 'calm'|'attack'|'tender'|'cleanup'|'rival'
  timer: 0.5,               // number, calm radar seconds left
  timerMax: 40,             // number, calm length for the radar bar
  progress: {
    ftue: 'cold',           // 'cold'|'call'|'fire'|'rubble'|'carve'|'deliver'|'sell'|'buy'|'done'
    goal: 'G1',             // current goal id 'G1'..'G15' | 'end'
    goalsDone: [],          // string[] goal ids in completion order
    contractNo: 0,          // number of contracts offered so far (the current one, once offered)
    unlocked: { depot:false, company:false, factory:false, tender:false, upkeep:false, offline:false,
                offers:false, equipment:false, line2:false, foreman:false, autoRepeat:false,
                dna:false, tierCap4:false },           // booleans
    recipes: { concrete:false, armor:false, cell:false, relic:false },
    seen: { depot:false, company:false, factory:false },  // "Yeni" pill until first opened
    tips: { zones:false, spread:false, tenderBubble:0, redConfirm:false }  // one-shot hints (tenderBubble 0..3)
  },
  sectors: [ /* 6 entries, index === id */ {
    id: 0,                  // 0..5
    fire: 0, fire0: 0,      // number 0..100; fire0 = peak this contract (bar denominator)
    rubble: 0, rubbleMax: 0,// tons
    corpse: 0, corpseMax: 0,// tons
    seg: null,              // 'head'|'body'|'tail'|null (carcass segment lying here)
    stages: { fire:false, rubble:false, carve:false },  // stages present this job (dots absent vs present)
    damaged: false,         // true from hit/spread until 'clean'
    spreadT: 0,             // s the fire has been >= 70 and unattended
    warnT: 0, warnTo: null, // spread warning countdown (5 -> 0) and target id|null
    paused: false,          // fire spread in while debris/carve vehicles were assigned
    rival: false,           // worked by Süpürge Holding (rival phase)
    upkeep: 0,              // 0..4 (Bakım kademesi)
    crews: { fire:0, debris:0, carve:0 }  // DERIVED every tick from fleet: count of state==='working' && sector===id (audio.js)
  } ],
  fleet: [ /* start: fire 1, debris 2, carve 1 */ {
    id: 'v1',               // string, stable, never reused ('v' + s.nextId++)
    type: 'fire',           // 'fire'|'debris'|'carve'
    state: 'yard',          // 'yard'|'enroute'|'working'|'returning'
    sector: null,           // number|null: target (enroute) / site (working)
    from: 'yard',           // 'yard'|number: node where the current leg started
    eta: 0, eta0: 0,        // seconds left / leg length (scene: progress = 1 - eta/eta0)
    bay: 0,                 // yard bay 0..7; >= 8 parks inside the garage (not drawn)
    seq: 0                  // increments on every new leg (scene detects re-routes)
  } ],
  nextId: 5,
  rival: { fleet: [],       // same entry shape as fleet, ids 'r1'.., cosmetic
           t: 0, T: 25,     // rival progress seconds / total
           tail: null,      // number|null: district handed to the player
           lossStreak: 0,   // player losses in a row (pity, internal)
           rivalLosses: 0 },// rival losses in a row (tendency switch, DESIGN §7.2)
  inv: { scale:0, blood:0, bone:0, eye:0, armor:0, cell:0, concrete:0, relic:0 },
  dna: 0,
  yieldAcc: { scale:0, blood:0, bone:0 },
  market: { /* per item */ scale: { m: 1, hist: [/* 24 numbers */] } },  // drift source
  riza: { drop: { /* per item */ scale: 0 } },   // Rıza elasticity: +0.01 per unit sold, recovers to 0 in 60 s
  offers: [ { id:'o1', buyer:'Ordu', item:'armor', qty:3, unit:540, until: 0 /* clock */, boom:false } ],
  jobs: [ { id:'j1', rid:'concrete', line:0, start:0, end:12 } ],   // clock times
  autoJobs: { concrete:false, armor:false, cell:false, relic:false },
  upgrades: { speed:0, lines:0, foreman:false },
  attack: null | { n, L, t, hit:false, first:false, pre, end, monster:'magmadon', mutant:false,
                   chain:[1], segments:{ 1:'head' }, sectors:[1], corpseTotal, rubbleTotal,
                   script: 'c1'|'c2'|'c3'|null },
                   // stays set after the attack (scene rebuilds damage/corpse from it after a reload)
  tender: null | {
    kind: 'call'|'bid', no, value, baseDeadline,
    estimate: { lo, mid, hi },             // seconds
    rivalBias: { bid, speed, bold:false },  // declared tendency
    sel: { price:1, speed:1 }, rec: { price, speed } | null,
    call: { pay, deadline } | null,         // direct award terms
    reveal: null | { win, chance, you:{ bid, deadline, trust, score }, rival:{ bid, deadline, trust, score } }
  },
  contract: null | { no, kind:'call'|'bid', pay, deadline, elapsed, zone:'gold'|'white'|'late',
                     sectors:[ids], parts:{ /* item: n */ } },
  result: null | { no, grade:'early'|'ontime'|'late', elapsed, deadline, pay, bonus, cut, trustD,
                   parts:{}, districts:[ids] },
  flags: { mutantNext:false, buyerAt:null /* clock */, buyerOffer:0, v1Notice:false,
           dnaGuarantee:false, chapterEnd:false },
  news: { current: null | { text, until /* clock */ }, archive: [] /* newest first, max 30 */, fillerT: 40 },
  notices: [ /* queue, UI shows [0] */ { kind:'v1'|'offline'|'buyer'|'chapter', data:{} } ],
  stats: { contracts:0, lost:0, attacks:0, parts:0, earned:0, sold:0, offerSold:0, early:0, fastest:0 },
  lastSave: 0               // Date.now() ms, written by save() only
}
```

Invariants: `s.attack` is non-null whenever `phase === 'attack'`; `s.contract` is non-null only in `'cleanup'`; `sectors[i].crews` is rebuilt at the end of every `tick`; money never goes negative (actions refuse).

### 3.2 Storage keys

`aftermath.save.v2` (game, owner L), `aftermath.audio.v1` (audio prefs, untouched), `aftermath.gfx.v1` (`{quality:'auto'|'high'|'low'}`, owner I). `aftermath.save.v1` is read only to detect it (`hasV1Save`) and is never written or deleted.

`load()` returns `null` unless `v === 2`; it deep-merges onto `newState()` so new fields get defaults, then `normalize(s)`: a save taken mid-attack resumes at `t = hit` if not hit yet (`end` if hit); `tender.reveal` and `result` survive; vehicles `enroute`/`returning` keep their eta.

### 3.3 Balance constants (DESIGN §6.3, v1 where unspecified)

- Rates per vehicle: fire 5 /s, debris 2.2 t/s, carve 1.4 t/s; × `1 + 0.25 × upgrades.speed`.
- Vehicle price: `round10(base × 1.5^owned(type))`, base fire 450, debris 400, carve 600 (second fire truck = 680).
- Travel time (logic only): `1.5 + 1.0 × rowDistance + 0.6 × colChange`, yard = row 3, column-neutral (gate on the avenue). Same district: 0.3 s. Range 2.5-4.5 s from the yard.
- Yields per carved ton: scale 0.26, blood 0.2, bone 0.15 (× 1.25 mutant); head segment done: +1 eye (+2 mutant). FTUE contract #1 yields are scripted: Pul 3, Magma özü 2, Kemik 2, Göz 1.
- Fire spread: source fire ≥ 70 and unattended (no fire vehicle working or enroute there) for ≥ 10 s → 5 s warning on a neighbour target (prefer a non-burning neighbour with work, else any non-burning neighbour) → target fire 35, `damaged = true`, debris/carve vehicles there keep their assignment but `paused` (rate 0, chip striped "Durdu") until its fire is out. A fire vehicle starting work at the source, or source fire < 70, cancels the warning.
- Contract grade: ratio = elapsed / deadline. ≤ 0.75 early: +25 % bonus, trust +8. ≤ 1 on time: trust +4. Late: pay × max(0.4, 1 − over/deadline), trust −6. Money is credited on `collectPayment`.
- Scripted contracts: **c1** Konak only, seg head, fire 30, rubble 14 t, corpse 12 t, pay 900, deadline 120 s. **c2** chain Konak(head)+Alsancak(body), extra Kemeraltı (rubble only); fire Konak 50, Alsancak 75 (the scripted spread toward Kültürpark); rubble 70 t total, corpse 50 t; pay 1390, deadline 130 s. **c3** random straight 2-chain + 1 extra, fires 2 × 70, rubble 100 t, corpse 70 t. **#4+** v1 formulas (`size = (1 + 0.35 (L−1)) × (mutant ? 1.45 : 1)`, rubble 120 × size, corpse 80 × size, fire count per v1).
- Chains are straight only: length 1 (any), length 2 (horizontal pairs and vertical pairs), length 3 (a full column). Length 3 when `L ≥ 3` or mutant, else 2 (c1 is 1).
- Tender value (v1): `round10(1200 × (1 + 0.45 (L−1)) × (1 + 0.04 × Σupkeep) × (mutant ? 1.4 : 1))`. `baseDeadline = max(v1 formula, round(estimate.mid × 1.15))`. Price ×0.75/1/1.25, deadline ×0.7/1/1.4. Direct calls after c2 (tender not unlocked yet): pay = value, deadline = round(estimate.mid × 1.3).
- Calm length: 40 s after the FTUE, 35 s for contracts #2-#4, 45 s later, 60 s once `upkeep` and `offers` are unlocked.
- Rıza: unit = base × 0.6 × market.m × (1 − drop); drop +0.01 per unit sold, linear recovery to 0 over 60 s. FTUE: drop off, m = 1 (exact 472).
- Upkeep: 1.2 /s per tier (72 bin ₺/dk); cost `round10(350 × 1.85^tier)`; tier cap 3 (4 after G14); paused while `damaged`. `'income'` event every 10 s.
- Offline (after G7): rate × min(away, 4 h) × 0.5, shown as a notice, credited on "Kasaya al".
- Foreman (Vardiya şefi, after G11): one-time 2500; every 1 s sends idle vehicles by the greedy rule in `tender.js`.
- FTUE money check (test): 1500 + 900 + 225 + 472 − 680 = 2417.

### 3.4 audio.js dependencies and the integrator's edits

audio.js reads: `BAL.attackHit`, `MONSTERS[id].voice` (import from data), `s.phase`, `s.attack.{t, hit, monster, mutant}` (attack phase; `t` may be negative during the first-attack intro, which simply produces footsteps), `s.sectors[].{fire, rubble, corpse, crews.{fire,debris,carve}}`, `s.contract.{elapsed, deadline}`. Events: `'attack-start'`, `'hit'`, `'sfx' {name, arg}`, `'toast' {kind}`, `'float' {text}`. Logic keeps all of these satisfied.

Integrator edits (nothing else changes):
1. `import { BAL, MONSTERS } from './game/data.js';` (data exports `BAL.attackHit = 2.6`, `MONSTERS.magmadon.voice = 90`).
2. Add SFX in the same procedural style: `dispatch(type)` (engine rev; plus one siren chirp when `type === 'fire'`), `hiss()` (0.4 s high-passed noise), `tick()` (short click), `thud()` (low noise burst).
3. Delete the `'float'` text-sniffing handler: logic now emits explicit `'sfx'` events (table 4.4), so sounds stay the same and never double.

---

## 4. Game API (logic → everyone)

`import * as game from './game/index.js'` re-exports everything below.

### 4.1 Lifecycle and core

| function | contract |
|---|---|
| `newState()` | fresh state per 3.1 (phase calm, timer 0.5, ftue 'cold': the first ticks start the scripted attack c1; 'cold' is the only FTUE step where the radar runs) |
| `debugScenario(name)` | returns a consistent State for: `calm`, `call`, `ftue-fire`, `cleanup`, `spread`, `attack` (t 0.5, not first), `impact` (t = hit + 0.2), `tender`, `tender-reveal`, `result`, `rival`, `depot`, `depot-offers`, `factory`, `company`, `late` (everything unlocked, upkeep tiers set). Used by tests, ui-lab and `aftermath.scenario` |
| `debugUnlockAll(s)` | completes goals G1..G14 with their unlocks, ftue 'done', fleet 3/3/3, money 50 000 |
| `load(storage = localStorage)` | State or null (3.2) |
| `save(s, storage)` | writes v2 key, sets `lastSave`; returns boolean, never throws |
| `wipe(storage)` | removes v2 key only; returns `newState()` |
| `hasV1Save(storage)` | boolean; main pushes the `'v1'` notice for a fresh state when true |
| `tick(s, dt)` | advances the game; clamps dt to 0.1 and substeps at ≤ 0.05; emits bus events synchronously |
| `applyOffline(s, seconds)` | if unlocked.offline: queues an `'offline'` notice; in calm reduces `timer` (min 3 s); never advances a contract clock |
| `setSeed(n)` / `setRandom(fn)` | test determinism |

### 4.2 Actions

Single entry point: `act(s, id, arg) → { ok:true, ...extra } | { ok:false, code, reason }`. It never throws. Order: FTUE gate (`code:'ftue'`, empty reason: the UI does nothing), then rule checks (`code:'rule'`, reason = Turkish copy ≤ 8 words), then the effect. Every call emits `'action' {id, arg, ok, code}` (main saves on ok).

| id | arg | effect / main refusal reasons |
|---|---|---|
| `skipAttack` | – | 2.3 skip |
| `acceptCall` | – | tender(call) → cleanup |
| `selectTenderCell` | `{price, speed}` | sets `tender.sel` |
| `submitTender` | – | honest resolve → `tender.reveal`; red cell first time needs `confirmRed` |
| `confirmRed` | – | marks `tips.redConfirm`, then behaves as submitTender |
| `startWork` | – | after a won reveal → cleanup |
| `takeTail` / `releaseTail` | – | after a lost reveal → rival / end the tail job |
| `dispatch` | `{type, sector}` | nearest free vehicle (yard or returning) of type → enroute. Reasons: "Boşta araç yok." · "Bu bölgede yangın yok" · "Yangın sönmeden giremez" · "Bu bölgede enkaz yok" · "Önce yol açılmalı" · "Bu bölgede canavar yok" |
| `recall` | `{sector}` | one vehicle (enroute first, then latest working) → returning |
| `collectPayment` | – | credits result, clears it, starts the radar |
| `sellAll` | `{buyer:'riza'}` | sells all raw + products to Rıza |
| `sell` | `{item, qty}` | Rıza, per-unit price with elasticity |
| `acceptOffer` | `{offerId, qty}` | sells to an offer |
| `buyVehicle` | `{type}` | "Para yetmiyor: 120 bin ₺ eksik." |
| `buyUpgrade` | `{key:'speed'|'lines'|'foreman'}` | gated by unlocks |
| `startJob` | `{rid}` | "Tüm hatlar dolu" · "Malzeme yetmiyor: 2 pul eksik." |
| `toggleAuto` | `{rid}` | after G11 |
| `signUpkeep` | `{sector}` | tier +1 (also used for upgrades); "Önce bölge temizlenmeli" while damaged |
| `skipRadar` | – | after G4: timer = 0 |
| `decideBuyer` | `{sell:boolean}` | secret buyer; DNA scandal 35 % |
| `ackNotice` | – | pops `notices[0]`; for `'offline'` credits the money |

UI-only gate keys checked with `ftueAllows(s, key)` (no state change): `select:<id>`, `tab:<id>`, `closeSheet`, `settings` (always allowed), `skip` (tap-to-skip cold open).

### 4.3 FTUE and goals

- `FTUE_STEPS`: ordered table `{ id, objective, highlight:{type:'district'|'tab'|'button'|'none', ref}, bubble:{text, anchor}|null, npc:[{when, text}], allow:[keys], done(s) }` with the DESIGN §3 copy (Konak version, 2.1). Allow lists:

| step | allow | done when |
|---|---|---|
| cold | `skip`, `skipAttack` | attack ended |
| call | `acceptCall` | contract started |
| fire | `select:1`, `dispatch:fire:1`, `closeSheet` | Konak fire 0 |
| rubble | `select:1`, `dispatch:debris:1`, `closeSheet` | Konak rubble 0 |
| carve | `select:1`, `dispatch:carve:1`, `closeSheet` | contract done |
| deliver | `collectPayment` | result collected (unlocks depot) |
| sell | `tab:depot`, `tab:city`, `sellAll` | first sale (unlocks company) |
| buy | `tab:*`, `buyVehicle:fire` | 2 fire trucks → radar 40 s, ftue 'done' |

  The radar is paused from 'call' until 'done'. Action keys are `id` or `id:arg-parts` in a fixed order (`dispatch:<type>:<sector>`, `buyVehicle:<type>`, `sellAll:<buyer>`, `select:<id>`, `tab:<id>`); an allow entry matches any key that starts with it plus `:` (so `sellAll` allows `sellAll:riza`), and `*` is a wildcard for one part.
- `ftueView(s) → { step, objective, highlight, bubble, npc:{text}|null, allow, dim:boolean } | null` (null when done).
- `ftueAllows(s, key) → boolean`.
- `debugFtue(s, stepId)`: mutates a fresh state into a consistent state at the start of that step (tests and `aftermath.ftue()`).
- `GOALS`: DESIGN §4 table `{ id, text, progress(s)→{done,total,unit}|null, reward, check(s), fallback(s), unlock:[keys] }`. `checkGoals(s)` runs inside tick; completing emits `'goal'` and one `'unlock'` per key, plays `build`. G4's calm text is "Sıradaki saldırıya hazırlan" (DESIGN step 7).
- Objective priority: contract objective (top task by fire > rubble > carcass, e.g. "Alsancak'taki yangını söndür" + `{done, total, unit:'bölge'}`) > FTUE step > current goal.

### 4.4 Selectors (pure; the UI calls them at ≤ 10 Hz)

All text fields are final Turkish copy; numbers are pre-formatted with units.

```
hud(s) → { cash, cashText /* '2,41 Mn ₺' */, chip: { kind:'radar'|'alarm'|'cagri'|'ihale'|'teslim'|'gecikme'|'rival'|'edildi',
           label /* 'RADAR' 'ALARM' 'ÇAĞRI' 'İHALE' 'TESLİM' 'GECİKME' 'SÜPÜRGE ÇALIŞIYOR' 'TESLİM EDİLDİ' */,
           time /* '1:42' | '+0:12' | null */, bar /* 0..1 */, gold /* 0.75 | null */, warn:boolean } }
objective(s) → { text /* without the 'Hedef' label */, progress: { done, total, unit, text:'2/4 bölge' } | null,
                 reward: 'Ödül: Fabrika' | null, source:'contract'|'ftue'|'goal' }
headline(s) → { text, kind } | null             // s.news.current while clock < until
districtStatus(s, id) → {
  id, name, caps, stage:'fire'|'rubble'|'carve'|'clean'|'none',
  bar: { kind:'fire'|'rubble'|'carve', value /*0..1 remaining*/, text:'%62'|'14 ton' } | null,
  dots: [ {kind:'fire', state:'done'|'now'|'pending'|'absent'}, {kind:'rubble',…}, {kind:'carve',…} ],
  values: { fire:'%62', rubble:'14 ton', carve:'12 ton' },     // stage stepper cards
  workers, attention, spreading: { to, t } | null, threatened: { from, t } | null, paused, seg,
  buttons: { fire|debris|carve: { label:'İtfaiye gönder', enabled, reason, ready, total, primary } },
  recall: { count, label:'Geri çağır (1)' } | null,
  loot: 'Çıkacaklar: pul, kemik, magma özü. Kafada göz var.' | null,
  status: '1 itfaiye çalışıyor, 1 yolda' | null,
  upkeep: { tier, rateText, nextCostText, enabled, reason, paused } | null }   // calm, after G6
fleetStrip(s) → [ { type, name, ready, total, text:'2 hazır / 3', glow, accepts:[ids] } ]   // contract + rival
vehicleTags(s) → [ { id, sector, text:'Yolda · 3 sn' } ]                                    // enroute only
tenderGrid(s) → { title:'Temizlik ihalesi · Liman–Konak', summary:{fires, rubble:'100 ton', corpse:'70 ton'},
  estimate:{ lo, mid, hi, text:'Filonla tahmini süre: 1:50 (1:40–2:00)' },
  rows:[ { label:'Hızlı', time:'1:31', cells:[ { price, priceText:'1,04 Mn', chance, chanceText:'%97',
          tone:'green'|'amber'|'red', hatched, recommended, selected } ×3 ] } ×3 ],
  rival:{ name:'Süpürge Holding', trust, habit:'Genelde liste fiyatı, normal süre.' }, trust,
  outcome:{ payText, chanceText, line:'Kazanırsan 1,04 Mn ₺ ve canavarın parçaları.' }, needsConfirm, bubble }
fleetEstimate(s, damage?) → { lo, mid, hi }   // seconds; dry-run (4.5)
callCard(s) → { who:'nevin', name:'Nevin Aksoy', role:'Belediye Afet Koordinatörü', lines:[...], button:'İşi al' } | null
reveal(s) → rows for the envelopes (Fiyat, Süre, Güven, total) + stamp 'KAZANDIN'|'SÜPÜRGE HOLDİNG' + button | null
receipt(s) → { title:'Konak teslim edildi', stamp:'ERKEN TESLİM'|'ZAMANINDA'|'GECİKTİ', consequence,
               rows:[{label, value}], parts:[{item, n}], trustText:'+8 güven', total, button:'Ödemeyi al' } | null
suggestion(s) → { kind, title, text, button, action:{ id, arg } } | null        // calm task card
nextCard(s) → { etaText, monster:'Magmadon', line, loot:[items] }                // calm radar card
depot(s) → { items:[{ key, name, count, unitText, unit, rare, trend:'up'|'down'|'flat' }], riza:{ line, sub, allText, allValue },
             offers:[{ id, buyer, item, qty, unitText, deltaText, untilT }], countText }
factory(s) → { lines, jobs:[{ id, rid, progress, leftText }], recipes:[{ id, name, inText, timeText, rawText, outText, canStart, reason }] }
company(s) → { fleet:[{ type, name, owned, priceText, canBuy, reason, desc, primary }], upgrades:[...], stats:[{label, value}] }
tabs(s) → [ { id:'city'|'depot'|'factory'|'company', visible, isNew, dot } ]        // at most one dot
notice(s) → s.notices[0] rendered as { kind, title, body:[...], buttons:[{label, action}] } | null
newsArchive(s) → string[]
```

### 4.5 Tender math (tender.js)

- `scoreFor(trust, bid, speed) = trust × 0.4 + (1.3 − bid) × 60 + (1.4 − speed) × 40` (v1).
- `chance(s, bid, speed) = clamp(0.5 + (scoreFor(s.trust, bid, speed) − rivalScore) / 50, 0.03, 0.97)`, `rivalScore = scoreFor(s.rivalTrust, tendency.bid, tendency.speed) − (lossStreak ≥ 2 ? 25 : 0)`. Tendency 0.98 / 1.05; after `rivalLosses ≥ 2`: 0.9 / 0.95 and habit "Süpürge Holding bu sefer iddialı."
- `resolve(s)`: `win = rand() < chance(sel)`; then sample rival bid ∈ [0.78, 1.18], speed ∈ [0.8, 1.3] by rejection (≤ 200 tries, then the extreme that agrees) until `(playerScore ≥ rivalSampleScore) === win`. The shown chance is exactly the used probability.
- `estimate(s, damage = current sectors)`: deterministic dry-run of the greedy dispatcher (v1 `autoAssign` scoring adapted to the hard sequence: fire first, carve prefers the head) with the real travel formula, rates and speed upgrade, 0.5 s steps, no spread. `mid` = result, `lo = 0.9 mid`, `hi = 1.1 mid`. The same greedy powers Vardiya şefi.
- Hatched cell: `deadline < estimate.hi`. Recommended (first tender): highest pay with chance ≥ 0.6 and not hatched.

### 4.6 Bus event catalogue (logic emits on `js/bus.js`; payloads carry ids only)

| event | payload | notes |
|---|---|---|
| `attack-start` | `{ n, monster, mutant, chain, segments, sectors, first }` | audio siren + attack music; scene starts the damage build queue |
| `hit` | `{ chain, sectors }` | audio impact; scene swaps damage, dust ring, shake; UI haptic |
| `phase` | `{ from, to }` | |
| `sfx` | `{ name, arg }` | see sfx map below |
| `toast` | `{ text, kind:'good'|'bad'|'' }` | `bad` plays `error` in audio |
| `float` | `{ sector:number|null, text, kind:'part'|'stage'|'clean'|'spread'|'income' }` | UI float text; no sound |
| `headline` | `{ text, kind }` | objective bar swap 5 s, archive |
| `call` | `{ no }` | call card |
| `tender-open` | `{ no }` | |
| `tender-result` | `{ win, chance }` | details in `s.tender.reveal` |
| `contract-start` | `{ no, kind, pay, deadline, sectors }` | |
| `dispatch` | `{ vehicleId, type, sectorId, from, eta }` | scene route line, gate; UI sheet closes after 150 ms |
| `arrive` | `{ vehicleId, type, sectorId }` | |
| `return` | `{ vehicleId, sectorId }` | vehicle heads home (free) |
| `park` | `{ vehicleId }` | reached its bay |
| `recall` | `{ vehicleId, sectorId }` | |
| `stage-done` | `{ sectorId, stage:'fire'|'rubble'|'carve' }` | steam burst / cones pop / chunks gone |
| `part` | `{ sectorId, vehicleId, item }` | one unit; crate pop, icon fly |
| `rare` | `{ sectorId, item:'eye'|'dna' }` | slow-mo, glint, rare card |
| `clean` | `{ sectorId }` | lights wave, damaged→intact swap, cars out, TEMİZ stamp |
| `spread-warn` | `{ from, to, t:5 }` / `spread-cancel` `{ from, to }` / `spread` `{ from, to }` | |
| `deadline-zone` | `{ zone:'gold-end'|'warn90'|'late' }` | |
| `contract-done` | `{ no, grade, elapsed, deadline }` | receipt shows |
| `payment` | `{ amount }` | coin fly, roll-up |
| `sale` | `{ buyer:'riza'|string, item:string|'all', qty, total }` | buyer van |
| `offer` / `offer-expired` | `{ offerId }` | |
| `purchase` | `{ kind:'vehicle'|'upgrade', type, vehicleId? }` | drive-in |
| `factory-start` / `factory-done` | `{ jobId, rid, line }` | shed glow / crate slide |
| `unlock` | `{ key }` | tab drop-in, objective flash |
| `goal` | `{ id, next }` | |
| `ftue` | `{ step, prev }` | |
| `rival-start` | `{ tail }` / `rival-done` `{}` | |
| `upkeep` | `{ sectorId, tier }` | |
| `income` | `{ amount }` | every 10 s with upkeep |
| `notice` | `{ kind }` | |
| `action` | `{ id, arg, ok, code }` | from `act()` |

SFX emitted by logic (`'sfx'` names): `radar` (call card), `dispatch` (arg type), `hiss` then `done` (fire out), `thud` (each rubble step), `done` (road open, clean), `part`, `rare`, `mystery` (DNA, secret buyer), `fireSpread`, `tick` (each warning second; every 2 s after 90 % of a deadline), `late`, `record`/`win`/`late` (contract grade: early/ontime/late), `win`/`lose` (tender reveal), `cash` (arg big) on payment and sales, `buy`, `build` (unlock), `factory`. UI emits `click`, `tab`, `error` (disabled tap).

---

## 5. Scene API (scene → main/ui)

### 5.1 Facade

```js
import { createScene } from './scene/scene.js';
const scene = createScene(canvas, { quality:'high'|'low', band:{ top, bottom }, onEvent:(type, payload)=>{}, reducedMotion:false });
```

| member | contract |
|---|---|
| `ready: Promise<void>` | static city, flame atlas and shaders built (async, yields between districts; target < 2.5 s on a mid phone) |
| `prime(state): Promise<void>` | builds damage variants, rubble, fires and corpse for a loaded mid-job state, synchronously enough to finish under the loading veil |
| `update(state, dt, { render = true } = {})` | advances the visual clock by dt, syncs everything from state (5.2), runs actors, renders. No allocations |
| `render()` | render one frame without advancing time |
| `event(type, payload)` | bus events forwarded by main (one-shot visuals: steam, crate pop, van, ring, swaps) |
| `setBand({ top, bottom })` | insets in CSS px: `top` = distance from the canvas top to the band (HUD + objective), `bottom` = distance from the canvas bottom to the band (bottom panel / sheet height). Camera uses a view offset so framed targets sit in the band. The lab mock is `{ top: 96, bottom: 260 }` |
| `setQuality(q)`, `quality()` | 'high' / 'low' (5.5) |
| `frame(target, { zoom:'city'|'district', duration = 0.7, instant = false })` | target `'city'`, `'district:<id>'`, `'district:<id>+yard'`, `'chain'`, `'yard'`. Eased (cubic in-out), never instant unless asked |
| `zoomTo(stop)`, `panBy(dxCss, dyCss)` | gestures from main; pan only in 'district' zoom, clamped to map bounds |
| `shake(amount)` | 0..1 trauma |
| `pick(clientX, clientY)` | `{ type:'vehicle', id }` (screen distance ≤ 28 CSS px wins) → `{ type:'district', id }` (whole cell incl. half the surrounding roads) → `{ type:'yard' }` (below the ring road) → `null` |
| `project(anchor, out?)` | `{ x, y, visible }` in CSS px; anchors `district:<id>` (above the block at roof height), `vehicle:<id>`, `yard`, `shed`, `gate`, `corpse:head`, `chain`. `visible` false if behind the camera or outside the canvas |
| `setHighlight(ids | id | null, kind)` | kinds: `'select'` (translucent fill + 4 corner brackets, yellow), `'pulse'` (orange 1 Hz, FTUE/attention target), `'accept'` (soft glow on districts that accept the chosen vehicle type). Each kind is an independent layer. `'spread'` (red 2 Hz) is drawn by the scene from `sectors[].warnTo` |
| `playAttack(desc)` | preview only (labs, title loops): `{ skip(), done:Promise, t }`, runs its own clock over the same pose function. In game the scene follows `state.attack.t` |
| `setTime(t)` | deterministic visual time (lab `__setTime`) |
| `stats()` | `{ drawCalls, triangles, geometries, textures, programs, fps, quality, vehicles, particles }` (triangles include the shadow pass) |
| `resize()`, `dispose()` | |

`onEvent` emits only view events: `'attack:cut'`, `'attack:impact'`, `'attack:end'` (useful for UI timing, optional), `'quality-hint' {fps}`.

### 5.2 State fields the scene reads (scene-world builds fake states with exactly this subset)

`phase`; `attack.{n, t, hit, first, pre, end, monster, mutant, chain, segments, sectors}`; `sectors[].{fire, fire0, rubble, rubbleMax, corpse, corpseMax, seg, stages, damaged, warnT, warnTo, paused, upkeep}`; `fleet[].{id, type, state, sector, from, eta, eta0, bay, seq}`; `rival.{fleet, tail}`; `inv` (crate stacks); `jobs[]` + `clock` (shed glow progress); `result` (non-null → city framing); `progress.unlocked.upkeep`.

Visual mapping rules: flame size ∝ `fire / fire0`, smoke white below 25 %; rubble piles shrink in 3 steps at 66/33/0 % of `rubble / rubbleMax`; carcass loses chunks in 4 steps per district at 25/50/75/100 % carved; cones/barriers stay while `rubble > 0`; vehicle position = path(from → target) at `progress = 1 − eta/eta0` with ease at both ends; `working` vehicles sit on a work spot and animate; `yard` vehicles park in `bay`.

### 5.3 World ↔ actors hook (scene-world calls, scene-actors implements)

```js
// js/scene/actors/index.js
export function createActors(world) {
  return {
    update(state, dt, t) {},          // after world sync, before render
    event(type, payload) {},          // forwarded bus events
    attackPose(attack, t) {},         // pure: monster/robot/camera pose for state.attack at t
    previewAttack(desc) {},           // for scene.playAttack: { skip(), done, t }
    pickVehicle(x, y) { return null },// CSS px → vehicleId | null
    anchor(name, out) { return null },// 'vehicle:<id>' | 'corpse:head' → THREE.Vector3 | null
    setQuality(q) {},
    stats() { return { vehicles: 0, particles: 0 }; },
    dispose() {},
  };
}
```

`world` (built by scene.js) provides:

```
world.THREE, world.scene, world.renderer
world.layout          // section 6 constants (DISTRICTS cells, ROAD nodes/edges, YARD, entries)
world.path(from, to, out)    // from/to: node id or {x,z}; writes a Float32Array polyline (xz pairs) along roads,
                              // avoiding edges covered by the current corpse footprint; returns length (m).
                              // world.pathInfo.count = points written (a NaN pair terminates the list when there is room).
                              // Node ids: 'I.<W|A|E>.<P|S1|S2|R>', 'V.<W|A|E>.<row>', 'H.<col>.<P|S1|S2|R>', 'G', 'Y',
                              // 'BAY.0'..'BAY.7' (6 m in front of each bay), 'LOAD', 'RIVAL', 'BUYER', 'DUMP.W', 'DUMP.E'.
                              // A {x,z} endpoint attaches to the nearest (unblocked) road edge at its projection.
world.districtCenter(id) / world.districtBounds(id)
world.groundY(x, z)
world.workSpots(id, kind)     // kind 'fire'|'rubble'|'carve' → [{ x, z, yaw, aim:{x,y,z} }] (≥ 3 spots, stable order, ≥ 18 m apart,
                              // on road lanes, preferring spots the gameplay camera can see; cached until damage changes)
world.fireTargets(id)         // flame positions (water aim points)
world.corpsePlacement(attack) // section 6.4; the single source of truth for where the corpse lies
world.placement()             // the current placement (or null); world.chainIds(), world.roofHeight(id)
world.yard.bays               // [{ x, z, yaw }] x 8 (layout.YARD.bays)
world.fx.{ dust(x,y,z,n,o), steam(...), sparks(...), embers(from,to,n), debris(...), flash(...), ring(...),
           water() → { set(from, to, on), dispose() } }   // pooled; respect quality
world.materials.{ vehicle, glow, beacon, tarp, rival }    // shared, to keep material/program count low
world.cam.{ override(fn | null), shake(a), frame(...), band, camera, setVisFov(deg) }   // override(fn(camera, t, rig)) owns the camera during the attack;
                              // setVisFov sets the FOV of the visible band (the view offset is kept); released back to 26° on override(null)
world.timeScale       // read-only visual slow-mo factor (rare part)
world.quality         // 'high'|'low'
```

### 5.4 Who animates what

| thing | owner | driven by |
|---|---|---|
| city, districts, damage variants, crater/scatter, rubble piles, cones, lights wave, upkeep dressing | W | sectors + attack, events `hit`, `stage-done`, `clean`, `spread` |
| flames, smoke, steam, embers, dust ring | W | sectors, events |
| yard: bays, gate swing, crate stacks, shed glow + door flash + crate slide | W | inv, jobs, events `dispatch`, `park`, `factory-done` |
| traffic, parked cars, pedestrians, gulls, cars-out on clean | W | phase, damaged flags |
| highlights | W | setHighlight + warnTo |
| fleet vehicles, rival vehicles (purple), beacons (fire red/blue 4 Hz, others amber), route line, chips anchors | A | fleet, rival.fleet, `dispatch` |
| work loops: water arcs, excavator + tipper shuttle to the map edge, crane + tarps + sparks + crates on the bed, brake pitch, outriggers | A | vehicle state, events `part`, `stage-done` |
| Magmadon corpse + carve chunks + rare glint | A | attack, sectors corpse, `rare` |
| attack cinematic (alive Magmadon, KALKAN-07, camera shots) | A | `state.attack.t` |
| buyer van, purchase drive-in | A | `sale`, `purchase` |

### 5.5 Quality and budgets

| | high | low |
|---|---|---|
| DPR | min(devicePixelRatio, 1.5) | 1.0 |
| shadows | one directional, 2048, tight frustum | off (blob shadows) |
| post | grade + bloom + vignette | grade only |
| particles / traffic | 100 % | 50 % |

Budgets (high, worst case cleanup with 12 vehicles): draw calls ≤ 150, triangles ≤ 400 k including the shadow pass, juice particle cap 300, total download ≤ 3 MB (three ≈ 750 KB, fonts ≈ 285 KB). Look rules from critic-B stay binding: one gameplay camera (52° elevation, 26° FOV, fixed azimuth ≈ 8°), no stars with sun, no milky lifted shadows, saturation reserved for actors, smoke never covers the carcass head or the selected district, vehicles 2× scale with distinct liveries and emissive beacons.

Time of day crossfades over 1.5 s on phase change: calm = golden hour; attack = dusk, red grade; cleanup / tender / rival = blue hour with fires and lit windows as key lights (DESIGN direction B "cinematic dusk aftermath").

### 5.6 scene-lab.html (W; A adds cases through `actor-cases.js`)

- Import map identical to index.html. Links `css/fonts.css` (may 404 until ui lands). Canvas sign textures (yard sign, "07" stencil, Rıza's van) wait for `document.fonts.ready` and fall back to `"Arial Narrow", sans-serif`; the integrator re-checks them once fonts exist.
- URL params: `phase=calm|attack|impact|cleanup|tender|rival`, `t=<attack t or visual seconds>`, `chain=1,2`, `first=1`, `mutant=1`, `stage=fire|rubble|carve|clean` (applied to the chain), `fleet=fire:2,debris:2,carve:1`, `sel=<id>`, `zoom=district`, `q=high|low`, `hud=0` (hides the mock band), `seed=<n>`.
- Buttons: phase switch, dispatch type → selected district, run/pause fake sim, single events (`stage-done`, `part`, `rare`, `clean`, `spread-warn`, `spread`, `sale`, `purchase`, `factory-done`), quality toggle, stats overlay, plus the `actor-cases.js` list.
- Hooks: `window.__setTime(t)` (deterministic frame), `window.lab = { state, step(dt), scene, emit(type, payload) }`. Lab screenshots use a mock HUD band (top 96 px, bottom panel 260 px) so framing matches the game.

---

## 6. Layout, road graph and corpse placement (js/scene/layout.js)

Units: metres. x right, z toward the camera (near), y up. The sea is at −z.

### 6.1 Cells

- Cell size 110 × 100 (x × z). Columns: col 0 x ∈ [−118, −8], col 1 x ∈ [8, 118] (centres x = −63, 63). Rows: row 0 z ∈ [−162, −62], row 1 z ∈ [−50, 50], row 2 z ∈ [62, 162] (centres z = −112, 0, 112).
- Roads (centre line, width): avenue A x = 0 (16 m); west road W x = −124, east road E x = 124 (12 m); promenade road P z = −168, street S1 z = −56, street S2 z = 56, ring road R z = 168 (12 m). Promenade walk with palms z ∈ [−186, −174]; quay edge z = −186; sea beyond. Hills and far city outside x ∈ [−130, 130] are scenery.
- Yard: x ∈ [−70, 70], z ∈ [176, 232]. Gate node G (0, 176). Bays 0..7 at x = −42 + 12k, z = 210, nose toward −z. Garage building z ∈ [218, 232], x ∈ [−46, 46]. Crate area x ∈ [−68, −50], z ∈ [184, 214]. Factory shed x ∈ [48, 70], z ∈ [182, 214]. Buyer loading spot (−44, 192).

### 6.2 Road graph

- Lattice nodes `I.<col>.<row>`: x ∈ {W:−124, A:0, E:124} × z ∈ {P:−168, S1:−56, S2:56, R:168} (12 nodes; `I.A.R` = G's road junction).
- Edge-midpoint nodes: vertical `V.<x>.<r>` at (x, zc(r)) for x ∈ {W, A, E}, r ∈ {0, 1, 2}; horizontal `H.<c>.<z>` at (xc(c), z) for c ∈ {0, 1}, z ∈ {P, S1, S2, R}.
- Edges follow the lattice lines through the midpoints. Extra: `G` ↔ `I.A.R`; yard interior `Y` (0, 188) ↔ `G`; `Y` ↔ each bay; `Y` ↔ buyer spot. Off-map entries: `RIVAL` (−170, 56) ↔ `I.W.S2`; `BUYER` (170, 168) ↔ `I.E.R`; tipper dump exits `DUMP.W` (−170, −56), `DUMP.E` (170, −56).
- District entries: each district's 4 side midpoints. `world.path` goes bay → `Y` → `G` → graph shortest path → the entry nearest the chosen work spot → straight spur to the spot. Edges whose segment intersects the corpse capsules (+4 m) are removed; if that disconnects the graph, blocking is ignored.
- Logic never sees coordinates; it only uses the travel formula. The scene stretches motion along the polyline to match `eta0`.

### 6.3 Damage at attack time (no hitches)

- Each district has one merged **intact** mesh group, built at load. Implementation note (W): buildings are not rebuilt; the damaged look of every building is written into the district mesh's `aDmg`/`aBite` vertex attributes (staged arrays, swapped in at the hit together with a double-sided facade material) and the facade shader cuts stumps and corner bites. Exposed floor slabs, rebar, crater slabs and chunk scatter are built time-sliced into per-district props meshes.
- On `'attack-start'` the scene queues **damaged** builds for every district in `attack.sectors`, time-sliced at ≤ 4 ms per `update` call (one building group per slice). Inputs are deterministic: `(districtId, corpsePlacement(attack), seed = attack.n)`, so a reload rebuilds the same picture (`prime`). Tiers by distance d from the corpse capsules: d < 4 m hidden (crushed), d < 12 m tier c (stump in a rubble mound), d < 30 m tier b (corner bite, slabs, rebar), else tier a (soot + blown windows) for buildings that own fire spots, rest intact. Non-chain districts use one seeded impact point inside the cell with the same radii. Crater rim slabs, scatter chunks, crushed cars and bent lamps are part of the damaged build.
- At `'hit'` (or `attack.hit` seen in state): toggle intact off / damaged on per district, spawn rubble piles and fires, dust ring per landing point, shake. If the queue is not finished (skip), finish it synchronously right then.
- `'spread-warn'` queues a soot-only damaged build for the target (5 s ahead); `'spread'` swaps it.
- `'clean'`: lights wave (0.8 s) + ground dust puff, swap damaged → intact, dispose the damaged group. Crater/scatter in that district go with it.

### 6.4 Corpse placement (`corpsePlacement(attack)`)

Returns `{ x, z, yaw, length, width, dir:{x,z}, nose:{x,z}, capsules:[{ax,az,bx,bz,r}], parts:[{ districtId, seg, u0, u1 }] }`. `dir` points from the tail to the nose and `yaw = atan2(dir.x, dir.z)` (rotation.y of a model whose head faces local +z); `p(u) = nose − dir · u · length`. `u` runs along the body from the nose (0) to the tail tip (1). The model's carve chunks (≥ 12, A owns them) each carry a `u` centre; a district owns the chunks whose centre lies in its `[u0, u1)` and loses them in 4 steps from its outer end inward.

| chain | position | yaw | length | parts |
|---|---|---|---|---|
| 1 district (c1: Konak, head) | the cell's landing point `land[id]` (a layout constant; Konak's is offset south-east of the cell centre) | `land[id].yaw` (≈ 30° diagonal) | 80 m (juvenile scale) | `[{id, 'head', 0, 1}]` |
| 2 horizontal | midpoint of the two cell centres (lies across the avenue; paths reroute via W/E) | along +x or −x, head end toward the head cell | 2 × 126 × 0.8 ≈ 202 m | head `[0, 0.5)`, body `[0.5, 1]` |
| 2 vertical | midpoint of the two centres | along ±z | 2 × 112 × 0.8 ≈ 179 m | head `[0, 0.5)`, body `[0.5, 1]` |
| 3 (column) | centre of the middle cell | along ±z | 3 × 112 × 0.8 ≈ 269 m | split where the axis crosses the street centre lines: head `[0, ≈0.29)`, body `[≈0.29, ≈0.71)`, tail `[≈0.71, 1]` |

General rule for `u0/u1`: a boundary is where the axis crosses the street centre line between two consecutive chain cells, so each district owns exactly the part of the body lying inside it.

Width = 0.32 × length (mutant × 1.1). Capsules: 3 along the axis (r = width / 2) plus the head. The corpse lies on its side (roll ≈ 1.3, proto-B), sunk 2.6 m into the crater, belly and upper flank toward the camera, open jaw facing the camera, magma fissures glowing; the carving site (flank plates) faces the sky.

Protected props: the Saat Kulesi (tower at about (18, −42), small square in Konak's NW corner by the avenue and S1) and the yard are never covered. `corpsePlacement` shifts the axis sideways by up to 10 m, then shortens the body (not below 0.7 × n × pitch), until the tower is ≥ 6 m outside every capsule. The tower is exempt from damage tiers (soot only).

---

## 7. UI module plan (js/ui)

### 7.1 Entry

```js
const ui = createUI(document.getElementById('ui'), {
  scene: { project, setHighlight, frame, setBand, shake } | null,   // fake in ui-lab
  prefs: { get:() => ({ sfx, music, quality }), set:(key, value) => {} },  // main wires audio.setPref + gfx key
  getState: () => s,
});
ui.render(s, nowMs);    // every frame; internally: panels ≤ 10 Hz, chips ≤ 30 Hz, roll-ups per rAF
ui.selectDistrict(id | null); ui.openTab(id); ui.band() → { top, bottom };
```

The UI subscribes to `js/bus.js` itself. Player input goes `game.act(s, id, arg)`; on `{ok:false, code:'rule'}` it shows the reason as a toast and shakes the source; on `code:'ftue'` it does nothing. It calls `deps.scene.setBand` whenever the HUD or the bottom sheet changes height.

### 7.2 Layers and stable selectors (tests depend on these)

Inside `#ui` (z-order low → high): `#world` (chips, tags, plates, edge pointers) · `#ftue-dim` · `#hud` + `#objective` · `#panel` (bottom panel by phase) · `#tabs` · `#sheet` (district / upkeep / tender / receipt / depot / factory / company / settings) · `#broadcast` · `#notice` · `#bubble` · `#toasts` · `#loading`.

Classes: `.btn`, `.btn.primary` (at most one visible), disabled = `.btn[aria-disabled="true"]` with a non-empty `.reason` child (never the `disabled` attribute, so taps still shake and play `error`). The FTUE target element gets `data-ftue-target`; the 3D target is reported by `ftueView(s).highlight`. `#objective .text` is the objective line.

### 7.3 Components (one file each)

| file | content (DESIGN / UI-SPEC section) |
|---|---|
| `hud.js` | cash plate (roll-up 600-800 ms, green/red flash), phase chip with timer + bar (3-zone bar for TESLİM), settings button. Max 3 numbers with the objective progress (§5.6) |
| `objective.js` | yellow spine, "Hedef" label, text, progress; headline swap 5 s (fade 200 ms); tap → reward popover; long news → archive |
| `tabs.js` + `unlock.js` | progressive tabs (SVG icon + label), "Yeni" pill, single red dot, drop-in animation (−24 px → 0, 220 ms) |
| `panel-city.js` | calm: `nextCard` radar scope + `suggestion` task card + "Sıradaki işe geç" (after G4); contract: fleet strip + contract line "Ödeme 1,39 Mn ₺ + parçalar"; rival: "Kuyruk sende" card |
| `fleet-strip.js` | 3 cards "2 hazır / 3", glow when useful; tap → accept mode (`setHighlight(ids,'accept')`), then a district tap dispatches |
| `district-sheet.js` | street-plate title, stage stepper (3 cards + connectors), dispatch buttons (60 px, icon tile, label + sub, fleet pips) with locked reasons, loot line, status line, "Geri çağır (n)"; stays 150 ms after a dispatch then closes; selecting frames `district:<id>` at 'district' zoom, closing frames `city` |
| `upkeep-sheet.js` | calm tap after G6: tier, rate, next cost, "Bakım durdu" when damaged |
| `call.js` + `npc.js` | call card sliding up (portrait initials "NA"), lines, one button; NPC card bottom-left, max 2 lines, auto-hide 4 s or tap (Nevin formal, Rıza casual) |
| `tender.js` | full-height sheet: document line, summary tiles, estimate axis (hatched band + deadline ticks), 3×3 grid (tone fill 20-24 %, number always, hatching, "Önerilen", selection ring), rival line, outcome meter, CTA; first-tender bubbles (3, tap to advance); red-cell confirm; reveal: two envelopes, 3 bars (300 ms each), total bars, stamp KAZANDIN / SÜPÜRGE HOLDİNG (scale 1.6 → 1, 180 ms, small DOM shake) |
| `receipt.js` | hakediş belgesi: steel header + consequence line, paper slip (perforation, −1.2°), meta grid, rows with dotted leaders, parts chips, signature + stamp (ERKEN TESLİM / ZAMANINDA violet, GECİKTİ red), gain cards, "Ödemeyi al"; coins arc to the cash plate |
| `depot.js` | stock rows (icon tile, rare gold ring, count, sparkline, unit price), hold-to-sell (quantity accelerates, Rıza price ticks down), Rıza header + permanent grey line, offers with countdown rings (after G8), "Hepsini sat" footer |
| `factory.js` | lines, running jobs with progress, recipe cards "5 pul → 1 zırh plakası · 20 sn" / "Ham satarsan 210 bin ₺, işlersen 330 bin ₺", auto toggle (after G11) |
| `company.js` | Filo (buy cards), Geliştirmeler (Ekipman, Fabrika hattı, Vardiya şefi), İstatistik |
| `settings.js` + `news.js` | Efektler, Müzik, Kalite (Yüksek / Düşük, "Akıcılık için düşürüldü." when auto), Haber arşivi, Oyunu sıfırla → "Şirketi kapat? Tüm ilerleme silinir, geri alınamaz." [Vazgeç] [Sil] |
| `notices.js` | v1 notice, offline income, secret buyer (DESIGN §9.4 copy), chapter end, rare card "Nadir parça · Göz" (1.5 s, then flies to Depo) |
| `world.js` | district chips (name plate, one bar for the blocking task, 3 dots, worker badge, states attention / selected / done / paused / spreading ring), street plates in calm, vehicle tags "Yolda · 3 sn", `.edge` pointers when zoomed; `translate3d` only, hidden behind HUD/sheet |
| `floats.js` | float texts (max 3, 900 ms, rise 24 px), part icon fly to the Depo tab slot (700 ms bezier, throttle 120 ms; before the tab exists it flies to its future slot), coin fly, income pill "+72 bin ₺ bakım geliri" (rendered outside `#hud`/`#objective`, so it never counts as a HUD number) |
| `broadcast.js` | attack overlay: letterbox (120 / 284 px), "CANLI · Körfez Haber" bug + clock, grade veil, lower third with hazard stripe, kicker "KAİJU ALARMI", D64 "MAGMADON", one sentence, facts (Sınıf / Ağırlık / Tahmini düşüş), "Geç" pill (not on the first attack). Timing from `s.attack.t` and `ATTACK.TL` |
| `title.js` | cold-open title after the first attack: "AFTERMATH" stencil + "Herkes savaşı izler. Temizlik bize kalır." (1.2 s) |
| `ftue-view.js` | 40 % dim on non-allowed UI (taps swallowed), pointer bubble (≤ 12 words) anchored to a DOM target or `scene.project('district:<id>')`, `setHighlight(id,'pulse')` |
| `toasts.js`, `motion.js`, `haptics.js`, `loading.js` | toasts; easing, roll-ups, `prefers-reduced-motion` (no slams/pulses); `navigator.vibrate` per DESIGN §8 (hit `[90,40,180]`, dispatch 10 ms, …); boot veil "Saha hazırlanıyor" |

### 7.4 ui-lab.html

Loads `css/*`, the sprite, `js/ui/lab/lab.js`. Fixtures = `game.debugScenario(name)` (real states) plus UI flags (sheet open, tab, reveal step). Background = a proto-B screenshot from `assets/lab/`; `fake-scene.js` implements `project()` with fixed anchor points per district for that background and logs `setHighlight`/`frame`. URL `?screen=<name>`: `calm, call, ftue-fire, cleanup-sheet, spread, attack, title, tender, tender-reveal, receipt, rival, depot, depot-offers, factory, company, settings, notice-offline, notice-buyer`. A "Canlı" mode runs `game.tick` on rAF so the whole FTUE is playable without 3D.

### 7.5 UI decisions (U, phase 2; additive)

- **Layers**: two layers were added to 7.2. `#headline` sits between `#objective` and `#panel` and holds the news swap, laid exactly over the objective bar (fade 200 ms). It is a sibling of `#objective`, so headline text is never counted as a HUD number (rule 9.2 #5 still counts `#hud` + `#objective`). `#fly` sits above `#sheet` and holds coins, part icons, the rare-part card and the income pill. The HUD tip "Altın bölgede bitirirsen %25 prim." and the reward popover render in `#bubble`, not in `#hud`. Headline swaps pause during dimmed FTUE steps (the objective must stay readable).
- **Objective numbers**: when the objective text already contains a digit ("4. sözleşmeyi tamamla", "Bir alıcıya 5 parça sat"), the bar hides the progress count and the tap popover shows it, so the HUD never shows more than 3 numbers.
- **Sprite**: `js/ui/sprite.js` (generated from `assets/ui/icons/sprite.svg`, comments stripped) is injected once by `createUI` when the page has no `#t-settings` symbol. `index.html` may still inline the sprite; then nothing is injected. 8 original line glyphs were added (`t-phone t-music t-mute t-news t-trash t-repeat t-gauge t-door`).
- **createUI deps** (all optional): `scene`, `prefs { get() -> { sfx, music, quality, downgraded }, set(key, value) }` (`downgraded: true` shows "Akıcılık için düşürüldü."), `getState`, `reset()` (settings "Sil"; default: `game.wipe(localStorage)` + `location.reload()`).
- **ui API additions**: `ui.loading.{ set(p 0..1), hide(), show() }` (the veil is visible from `createUI`; main calls `hide()` after `scene.prime`), `ui.setScene(scene)` (main may create the UI before the scene), `ui.toast(text, kind)`, `ui.refresh()` (prefs changed outside, e.g. auto downgrade), `ui.setReducedMotion(on)`, `ui.view` (UI-only flags: `tab, sel, settings, news, accept, title`), `ui.ctx` (lab/tests only).
- **Stable hooks for tests**: every actionable element has `data-key` = its action key (`select:1`, `dispatch:fire:1`, `recall`, `acceptCall`, `collectPayment`, `tab:depot`, `sellAll:riza`, `sell:scale`, `acceptOffer:o3`, `buyVehicle:fire`, `buyUpgrade:speed`, `startJob:armor`, `signUpkeep:1`, `selectTenderCell:<price>:<speed>`, `submitTender`, `startWork`, `takeTail`, `releaseTail`, `skipRadar`, `skipAttack`, `settings`, `closeSheet`, `fleet:<type>`, `skip` on the title card). The FTUE target gets `data-ftue-target` and the single `.pulse`; elements with `data-dim` dim to 40 % and ignore taps when the step does not allow them. District chips are tappable (`select:<id>`) as well as the 3D block.
- **Hold-to-sell preview**: the ticking Rıza unit price comes from a silent dry run of the real `sell` action on `structuredClone(s)` (`silently` imported from `js/game/sim.js`), so the UI never re-implements the elasticity rule; release commits one `act('sell', {item, qty})`.
- **Static UI labels** kept in `js/ui` (presentation, not gameplay rules): broadcast lines and facts, the hakediş document labels ("Körfezkent Belediyesi", "Fen İşleri Müdürlüğü", "Hakediş belgesi", "Aftermath Temizlik A.Ş.", "Enkaz ve leş kaldırma", "Kontrol mühendisi"), tender document line, settings, tab names, HUD notes ("Teklifini seç", "Belediye arıyor", "Sinyal yok").
- **Canvas taps during the attack**: the UI ignores them; main calls `act('skipAttack')` (8.3). The broadcast shows its own "Geç" pill only when `!attack.first`.
- **Title card**: shown once per session when the phase leaves `'attack'` with `attack.first`; `ctx.view.title` holds the call card, notices and the NPC card until it ends (2.3 s or a tap).
- **ui-lab screens** (`?screen=`): `calm, late, notice-v1, attack-first, attack, impact, title, ftue-call, call, ftue-fire, ftue-fire-sheet, ftue-carve, cleanup, cleanup-sheet, fleet-accept, spread, tender, tender-confirm, tender-reveal, receipt, receipt-ftue, rival, ftue-sell, ftue-sell-depot, ftue-buy, depot, depot-offers, factory, company, upkeep, settings, news, settings-reset, notice-offline, notice-buyer, notice-chapter`; `?screen=new` starts a fresh game in Canlı mode. `?safe=0` drops the faked 47 / 34 px insets, `?rm=1` forces reduced motion, `?bar=1` shows the screen picker.
- **UI tests**: `node tests/ui/shoot.cjs [filter]` screenshots every lab screen (390 × 844, DPR 3) and checks the DOM rules (no emoji, no "!", ≤ 1 visible primary, every disabled button has a reason, ≤ 3 HUD numbers, both fonts loaded with Turkish glyphs, no console errors; overflow/truncation are printed as warnings). It replaces the planned `tests/ui/rules.cjs`. `node tests/ui/ftue.cjs` plays the whole FTUE in the lab by tapping only `[data-ftue-target]` and asserts money 2417.

---

## 8. main.js (integrator)

### 8.1 Boot

1. `s = game.load() ?? game.newState()`; fresh state and `game.hasV1Save()` → push notice `'v1'` (shown after the cold open, before the call).
2. Read `aftermath.gfx.v1`; `initAudio(() => s)`.
3. `ui = createUI(#ui, deps)`; loading veil visible.
4. `scene = createScene(#scene, { quality, band: ui.band(), onEvent })`; `await scene.ready`; `await scene.prime(s)`; hide veil.
5. Away time `(Date.now() − s.lastSave) / 1000` → `game.applyOffline(s, away)` if > 60 s.
6. Forward every catalogue event to `scene.event` (one `on()` per name). Start the loop. Register `sw.js` on https.

### 8.2 Loop (rAF)

```
dt = min(0.1, (now - last) / 1000) * slowmo     // slowmo 0.35 for 0.4 s after 'rare'
game.tick(s, dt)          // events fire synchronously → audio, ui, scene.event
scene.update(s, dt)       // renders
ui.render(s, now)
updateAudio(s, dt)
autosave(); qualityMonitor(dt)
```

### 8.3 Input routing

- Canvas `pointerdown/move/up`: a tap (< 10 px, < 300 ms) → `scene.pick` → district: `ui.selectDistrict(id)` (UI checks `ftueAllows('select:<id>')`; in accept mode it dispatches) · vehicle: select its sector · yard: `ui.openTab('depot')` if unlocked · null: close the sheet. Two fingers → `scene.zoomTo('district'|'city')`; one-finger drag while zoomed → `scene.panBy`.
- During the attack a tap calls `act('skipAttack')` (FTUE allows it on the cold open per DESIGN step 0).
- Camera director (small table in main): FTUE `call → fire`: `frame('district:1+yard', {duration:0.8})`; `contract-done`: `frame('city', {duration:1.2})`; attack: actors override; otherwise the UI frames on select/close.

### 8.4 Save, visibility, offline, quality

- Save every 5 s, and 400 ms (debounced) after `action` ok, `contract-done`, `payment`, `purchase`, `sale`, `ftue`, `unlock`, `goal`; on `visibilitychange` hidden and `pagehide`.
- Visible again after > 60 s: `game.applyOffline(s, away)`; reset `last`.
- Offline: the network-first service worker serves the cache; nothing in the game fetches.
- Quality: setting 'auto' starts 'high'; if the frame-time EMA stays under 28 fps for 5 s (ignoring the first 10 s and the attack), `scene.setQuality('low')`, remember `{quality:'auto', downgraded:true}` for the session; settings can force either.

### 8.5 Test hooks

```js
window.aftermath = {
  ready,                         // Promise: scene ready + primed
  step(sec = 1),                 // fixed 0.05 substeps: tick + scene.update(render:false); one render + ui.render at the end
  state: () => s, game, scene, ui,
  act: (id, arg) => game.act(s, id, arg),
  ftue(stepId),                  // game.debugFtue + scene.prime
  unlockAll(),                   // game.debugUnlockAll
  scenario(name),                // game.debugScenario + scene.prime + UI screen (for screenshots)
  seed(n), quality(q), stats: () => scene.stats(),
};
```

---

## 9. Test plan

### 9.1 Node unit tests (L): `node tests/logic/run.mjs` (same as `node --test tests/logic/*.test.mjs`)

| file | check |
|---|---|
| `odds.test.mjs` | 10 000 seeded resolutions per cell (9 cells × 3 trust/rival setups): observed win rate within ±0.02 of the shown chance |
| `estimate.test.mjs` | 500 random contracts (#3-#8 profiles): greedy auto-dispatch completion time (0.05 s ticks, spread on) inside `[lo, hi]` in ≥ 80 % |
| `ftue.test.mjs` | from `newState()`, perform only actions in `ftueView().allow` + `tick` until `ftue === 'done'`; asserts step order, scripted yields, receipt (ERKEN TESLİM, 225 bonus), Rıza button 472, final money 2417, radar 40 s |
| `goals.test.mjs` | scripted play reaches G1 → G15 in order; fallbacks of G10/G11 work; each unlock fires once |
| `rules.test.mjs` | hard sequence refusals with exact reasons; spread warning → spread → pause → resume; travel formula; vehicle freed on stage end and re-dispatchable while returning |
| `save.test.mjs` | roundtrip deep-equal after `tick`s; v1 key untouched; audio key untouched; corrupt JSON → null; mid-attack normalize |
| `copy.test.mjs` | tokenises string literals in `js/game/**` and `js/ui/**` (comments ignored): no `!`, no `\p{Extended_Pictographic}`, none of the banned words (DESIGN §9.1 list), no "…" endings |
| `format.test.mjs` | 900 → "900 bin ₺"; 1390 → "1,39 milyon ₺" / "1,39 Mn ₺"; 2600 → "2,6 Mn ₺"; doc 1737.5 → "1.737.500 ₺"; 102 s → "1:42" / "1 dk 42 sn"; trUpper("istif") → "İSTİF" |
| `balance.test.mjs` | FTUE money 2417; greedy bot (4 seeds) and human-paced bot (2 seeds) reach G1..G15 and contract #8, no goal takes > 6 min; prints the contract table |
| `audio.test.mjs` | data exports `BAL.attackHit`/`MONSTERS.voice`; every field audio.js reads exists in every phase; its 5 events fire; every logic sfx name exists in audio.js or the planned 4 (`dispatch hiss tick thud`); imports audio.js with a fake AudioContext and runs it over real states |

### 9.2 Playwright e2e (I), iPhone 13 profile, driven by `aftermath.step()`

`node tests/e2e/run.cjs` (starts `tools/serve.mjs` on PORT 5173). DESIGN §12 mapping:
1. FTUE by tapping only the highlighted element (`[data-ftue-target]` or the canvas point `scene.project('district:1')`), `step(0.5)` between taps; game-clock time of first dispatch ≤ 15 s and first sale ≤ 90 s (cold open skipped).
2. Every 0.5 s of game time through the FTUE and contract #2, `#objective .text` is non-empty unless `phase === 'attack'`.
3. No DOM text node matches `/\p{Extended_Pictographic}/u`.
4. No `!` in rendered DOM text (plus `copy.test`).
5. Numeric tokens `/\d+(?:[.,:\/]\d+)*/g` in `#hud` + `#objective` ≤ 3.
6. Every visible `.btn[aria-disabled="true"]` has a non-empty `.reason`.
7. At most one visible `.btn.primary` per sampled state.
8-9. Covered by node tests (re-run from the e2e runner).
Plus: reload mid-FTUE resumes the same step; no console errors; `scene.stats()` within budget in cleanup.

### 9.3 Screenshot review set (I; W and U shoot their own labs)

`node tests/shots.cjs` → `scratchpad/v2/integrator/`: calm, attack broadcast, impact, cleanup with the district sheet open, tender, tender reveal, receipt, Depo, Fabrika, Şirket, settings, rival tail. Each via `aftermath.scenario(name)` + `step` + `__setTime` where relevant, viewport 390 × 844 (standalone height) at DPR 3.

---

## 10. Ports

scene-world 5191 · scene-actors 5192 · ui 5193 · integrator 5173 · reviewers 5194, 5195, 5196 · fixers 5197. Logic needs none. Serve with `PORT=<port> node tools/serve.mjs`; kill the server when done.

---

## 11. Milestones (most important first; each ends with its checks green)

### logic
- **L1 Foundations.** data, rng, format, copy (FTUE + core strings), state (new/load/save/normalize). Checks: `format`, `save`, `copy` tests.
- **L2 Core loop.** attack c1, fleet entities + travel + derived crews, dispatch/recall, hard sequence, rates, scripted yields, contract finish → result → collect, ftue.js, `act()`. Checks: `ftue.test` passes to step 'deliver'; `rules.test` sequence part.
- **L3 Loop closes.** Rıza selling, vehicle purchase, goals G1-G5, calm/radar, c2 with scripted spread, factory (Kemik beton), selectors for HUD/objective/district/fleet/tabs/call/receipt/depot/company/suggestion, debug.js scenarios. Checks: full `ftue.test`, spread part of `rules.test`.
- **L4 Tender.** estimate dry-run, grid, honest resolve + reveal, rival tail phase, c3. Checks: `odds`, `estimate`.
- **L5 Late game.** upkeep, offline, offers/buyers, recipes, equipment, line 2, foreman, DNA / secret buyer / mutant, G6-G15, news filler, chapter end. Checks: `goals.test`.
- **L6 Balance.** `tools/balance.mjs` pacing table (one unlock every 2-4 min for 30 min); tune constants only.

### scene-world
- **W1 Skeleton.** vendor/three, scene.js with the full 5.1 surface, layout.js (6), env/post/materials port, camera rig + band + frame + zoom/pan, picking, project, actors stub + lab stubs, scene-lab with fake states for every phase. Checks: lab loads each `?phase=` without console errors; `pick` returns the right district for 12 sample taps; `project` round-trips.
- **W2 City.** 6 district identities + Kordon promenade + sea + yard (bays, gate, crates, shed, sign) inside budget. Checks: calm screenshot readable at 390 px; stats within 5.5.
- **W3 Damage.** time-sliced damaged variants, swap at hit, reset at clean, crater/scatter, rubble piles in 3 steps, cones. Checks: no frame > 50 ms around the hit in the lab with step timing; reload (`prime`) reproduces the same damage.
- **W4 FX + highlights.** flipbook flames ∝ fire, lit smoke with head/selection opacity cap, steam, dust ring, embers, water stream API, lights wave, select/pulse/spread/accept layers, time-of-day presets.
- **W5 Life.** traffic on the graph, parked cars, pedestrians, gulls, cars-out on clean.
- **W6 Quality.** low preset, counters, `tests/scene/smoke.cjs` budgets in calm / cleanup / attack.
- **W7 Polish.** pass over critic-B items owned by the world (contrast, sea specular tied to the sun, palms out of the near foreground or crafted, facade variety).

### scene-actors
- **A1 Fleet.** vehicles with liveries and beacons, path follow from fleet state, bays, route line, rival purple, `pickVehicle`, vehicle anchors. Check: lab dispatch of 3 types to 3 districts reads at 390 px.
- **A2 Work loops.** water arcs to fire targets, excavator + tipper shuttle, crane + tarps + sparks + crate pops on `part`, arrive/return motions.
- **A3 Corpse.** placement from `corpsePlacement` for all chain shapes incl. c1, ≥ 12 carve chunks with `u` centres, 4 steps per district, rare glint, mutant palette. Check: lab screenshots of chain 1 / 2h / 2v / 3 at 0/50/100 % carved.
- **A4 Attack.** director synced to `ATTACK.TL`, TV shot → cut → fall → impact at `hit`, first vs repeat, skip-safe, camera override released at `end`.
- **A5 Yard visitors.** buyer van on `sale`, drive-in on `purchase`.
- **A6 Polish.** Magmadon head (brow ridge, slit nostrils, glowing eye slits, tusks, menacing), KALKAN-07 silhouette (shoulder yoke, narrow waist, pistoned legs, steel-blue/white livery, cyan visor, "07"), readability at 390 px.

### ui
- **U1 Skeleton.** assets + css (Saha), layout layers, HUD, objective, tabs, ui-lab with fixtures. Checks: `calm`, `cleanup-sheet` screens match UI-SPEC; DOM rules test (`tests/ui/rules.cjs`: emoji, `!`, primary count, reasons, HUD tokens).
- **U2 Core loop screens.** call + NPC cards, district sheet (stages, locked reasons, shake), fleet strip, world chips + vehicle tags, floats + part fly, receipt, FTUE dim + bubble, Depo (Rıza, hold-to-sell), Şirket Filo. Check: the FTUE is playable end to end in ui-lab "Canlı" mode.
- **U3 Cinematic and calm.** broadcast overlay, title card, unlock animation, coin fly + roll-ups, calm dock cards + suggestion, settings sheet, notices.
- **U4 Tender.** grid, estimate axis, bubbles, red confirm, reveal + stamp, rival tail card.
- **U5 Late screens.** Fabrika, Şirket (Geliştirmeler, İstatistik), offers, upkeep sheet, news archive, offline / buyer / chapter notices.
- **U6 Polish.** reduced motion, DOM write throttling, screenshots of every lab screen.

### integrator
- **I1 Wire-up.** index.html (import map, `#scene` canvas, `#ui`, sprite), main.js (8), audio.js edits (3.4), sw.js v2, manifest check; delete v1 files. Check: the FTUE plays in the real game on 5173 with no console errors.
- **I2 E2E.** tests/e2e per 9.2; save/reload/visibility/offline; quality auto-downgrade.
- **I3 Review set.** tests/shots.cjs (9.3); fix seams between modules; LICENSES.md (three MIT, Archivo / Big Shoulders OFL, Tabler MIT); README.

---

## 12. Logic decisions (L, phase 2)

Decisions taken where this file or DESIGN was ambiguous, and contract additions. Everything here is implemented and tested in `tests/logic/`.

### 12.1 Contract additions (additive; nothing above was removed)

- **Tests** live in `tests/logic/*.test.mjs` (task brief), runner `node tests/logic/run.mjs`; `tests/logic/bot.mjs` is the headless player used by the balance/goal tests and `tools/balance.mjs`.
- **State fields added** (all present after `newState()`): `progress.goalT` (clock of the last goal), `progress.goalBase {offerSold, gold}` (stats when the current goal started); `rival.init {id: [fire, rubble, corpse]}` (rival progress source); `riza.rec` (per-item recovery rate); `flags.dnaSold`, `flags.buyerDecided`; `stats.won`, `stats.made`, `stats.gold` (early finishes excluding #1); `npc: null | {who, name, text, until}`; `acc` (internal timers); `attack.skip`, `attack.ftueYield`, `attack.spreadScripted`; `contract.w90`, `contract.tickT`, `contract.idleT`, `contract.foremanToast`; `offers[].life`; `result.kind`. Rival fleet entries start with `from: 'rival'` (the off-map RIVAL node) and are removed after their return leg.
- **Actions added**: `markSeen {tab}` (clears the "Yeni" pill), `tip {key}` (`'zones'`, `'spread'`, `'redConfirm'`, or `'tenderBubble'` to advance the first-tender bubbles). Both, plus `ackNotice` and `settings`, pass every FTUE step. `submitTender` on a red cell (< 40 %) the first time returns `{ok:false, code:'confirm', reason:'Kazanma şansın %24. Yine de gönderilsin mi?'}`; the UI then calls `confirmRed`. `act` codes: `'ftue' | 'rule' | 'confirm' | 'unknown' | 'error'` (error carries `.error`, never throws).
- **Selectors added**: `npcCard(s)` (Nevin / Rıza card while `clock < npc.until`), `rivalCard(s)` ("Kuyruk sende" panel), `contractLine(s)`, `topTask(s, ids)`, `stageOf(sec)`. `hud(s).tip` = `{key:'zones', text:'Altın bölgede bitirirsen %25 prim.'}` until `tip zones`. `objective(s).pointer` = `{district, text:"Alsancak'a dokun."}` after 8 s idle in contracts #2+ (DESIGN §3 light guidance). `districtStatus(s,id).buttons[type].sub` is the sheet sub-label ("1 araç hazır" or the reason); `.highlight` marks the FTUE district. `suggestion(s).action` may be the UI pseudo-action `{id:'openTab', arg:{tab}}`. `ftueView(s).highlight.inner` names the button inside the highlighted district sheet or tab (`dispatch:fire:1`, `sellAll:riza`, `buyVehicle:fire`).
- **Event added**: `npc {who, text}` (Nevin or Rıza speaks).
- **audio.js**: until the integrator deletes the `'float'` text-sniffing handler (§3.4 edit 3), "+1 Pul" and "Yangın sıçradı" floats double the `part` / `fireSpread` sounds that logic now emits explicitly.

### 12.2 Rules decided here

1. **Contract numbering.** `progress.contractNo` counts contracts offered (one per attack). Attack level `L = max(1, n − 1)`: c3 is L 2 (2-chain), #4 is L 3 (full column), matching "length 3 when L ≥ 3". Extras: c3 1, else 2 when L ≥ 2.
2. **c3 fires** sit on the two chain districts (70 each). c2 rubble split Konak 28 / Alsancak 28 / Kemeraltı 14; carcass shares 2-chain 45/55, 3-chain 32/43/25 (v1).
3. **Spread threshold** is 10 s for every contract (also the scripted c2 one; DESIGN mentions 8 s once). c2's first spread from Alsancak always targets Kültürpark (scripted), later spreads use the ARCH rule (non-burning neighbour with work, else any non-burning neighbour, never a Süpürge district). A spread target joins `contract.sectors`; `fire0` is the peak of the current fire episode (35 for a spread).
4. **Hard sequence reason order** follows DESIGN §3 step 2: carving checks "Önce yol açılmalı" before "Yangın sönmeden giremez". A vehicle arriving where its work is gone drives home; one arriving where fire spread in starts working paused.
5. **Re-dispatch mid-leg**: the new leg's `eta` interpolates between the travel times from both ends of the current leg by progress; `from` is the nearer end (the scene sees `seq` change).
6. **FTUE yields** (c1): the 7 raw units pop at 1/8 … 7/8 of the carve, Göz when the head is done. FTUE Rıza price has no drift and no per-unit drop, so the button reads exactly 472 bin ₺. During FTUE contract steps (fire/rubble/carve) the objective uses the FTUE copy ("Enkazı kaldır, yolu aç"), otherwise contract > FTUE > goal.
7. **Goal unlock timing.** G1 (unlocks Depo) completes when the #1 receipt is collected; G2 (Şirket) on the first sale; G3 on the second fire truck, which also ends the FTUE (radar 40 s). G9 and G10 count only progress made after they became current, and after G3 two goals never complete less than 12 s apart (`BAL.goalGap`), so unlock animations never stack. **G12** completes when 7 jobs are over (`contractNo ≥ 7`, back in calm with the receipt collected), so a lost tender does not block it (DESIGN: "contract #7"). G10/G11 fallbacks are stats.contracts ≥ 6 / ≥ 8 as in DESIGN. G15 unlock key `chapter` sets `flags.chapterEnd` and queues the `'chapter'` notice.
8. **Base deadline**: `max(round(mid × 1.15), min(v1 formula, round(mid × 2.5)))`. The v1 floor still sets small-fleet deadlines; the 2.5× cap keeps the gold zone a choice once the fleet has grown (a greedy player is early on Hızlı, a human-paced one is on time on Hızlı and early on Normal).
9. **Tender**: cells pay `round10(value × bid)`; the recommended cell (first tender only, `stats.won + stats.lost === 0`) is the highest pay with chance ≥ 0.6 and not hatched. Rival sampling falls back to a wider box `[0.5,1.4] × [0.5,1.6]` in the rare corners where the base box cannot agree with the outcome (chance clamped at 3 % / 97 %); the reveal always agrees with the result (tested over 270 000 draws). Win: `lossStreak 0`, `rivalLosses++`; loss: `lossStreak++`, `rivalLosses 0`, `rivalTrust +2`.
10. **Rival phase**: the tail is the last chain district. Süpürge clears its fire and rubble at once (`stage-done` events), the carcass is the player's (no pay, no deadline). Rival districts drain linearly over 25 s; then raw prices × 0.82 and open offers × 0.9 with the "Süpürge Holding pulları piyasaya sürdü" headline. `releaseTail` from the lost reveal skips the tail; during the rival phase it hands the remaining carcass to Süpürge.
11. **Radar** runs only in calm, with no pending receipt, outside FTUE steps call..buy, and while no `'buyer'` or `'chapter'` notice waits. `applyOffline` shortens a running radar to ≥ 3 s even before G7 (money only after G7).
12. **DNA**: the first head carved by the player from contract #7 on carries the guaranteed tube; after G13 each head has 25 %. A buyer visit is scheduled at 30 % of the next calm whenever `dna > 0`; offer `round50(2400 + 260 × max(7, contractNo))` (4,2 milyon ₺ at #7). Selling sets `mutantNext` (next attack: 3-chain, × 1.45 size, × 1.25 yields, 2 eyes, × 1.4 value) and enables the Kültürpark fish filler.
13. **Economy details**: Rıza drop is capped at 50 %; drift every 2 s within [0.6, 1.4] (FTUE: none). Offers (after G8): kept at 2-3, one every 25 s, 15 % are booms (× 1.6-1.8, 60 s, headline), others × 1.0-1.45 of base for 60-120 s; items are raw parts, Göz and unlocked products, preferring what is in stock. `line2` grants the 2nd factory line free; Fabrika hattı buys a 3rd (3,3 milyon ₺). Ekipman: `round10(900 × 1.8^n)`, max 5. Upkeep income counts in `stats.earned`.
14. **Calm suggestion order**: idle factory line that can start > unsold parts (offer card if an offer matches stock; Rıza "Sat" before offers exist, else open Depo) > affordable vehicle of the scarcest type > first upkeep. (DESIGN lists parts first, but then the factory card could never show.)
15. **Pacing** (`node tools/balance.mjs`): the greedy bot finishes G1..G15 in about 12 min of game time, the human-paced bot (1.5 s per dispatch, reading pauses) in about 15 min; no goal takes more than 6 min for either. DESIGN's 2-4 min per unlock for 30 min assumes real reading time; retune calm lengths and vehicle price growth after a phone playtest.

---

## 13. Scene-actors decisions (A, phase 2)

Implemented in `js/scene/actors/**`; reviewed with `tests/scene/actors-shoot.cjs` (iPhone 13 shots, two motion frame sequences, budget table in `scratchpad/v2/scene-actors/report.json`).

- **pick**: `pickVehicle` only considers vehicles in the field (`enroute`, `working`, `returning`). Parked vehicles leave the tap to `{ type:'yard' }`, so a tap on the yard always opens the yard (5.1 `pick` otherwise unchanged).
- **Carving direction**: each district's part of the carcass is cut away from its tail-side end toward the head (6.4 says "from its outer end inward"; this is the same for body/tail parts, and for the head part it keeps the head until last, so `corpse:head` stays valid and the Göz comes out at the end). Steps: 0 intact, 1/2/3 = a quarter/half/three quarters gone (plates ahead of the cut are lifted, flesh, ribs and the magma gland show), 4 = gone. One baked mesh, one draw call; the cut, the lifted plates and the flesh back faces are shader-driven (`aCarve` = u along the body + plate id, uniforms per part).
- **Corpse size**: scaled to `placement.length`; the footprint follows `placement.width` (floor 0.7 of the natural width, so bodies may reach a few metres past the capsules onto the stump ring); height is scaled independently (bulkier silhouette). Mirrored when the belly would face away from the camera.
- **Attack director** (`attack.js`): TV shot always on the Kordon promenade (the monster wades ashore at Kordon, KALKAN-07 lands in the shallows), times in `TL` (land 0.9, wind-up 1.0, contact hold 1.58-1.66, roar 1.85, cut 2.0, hit 2.6 = `BAL.attackHit`). At the cut the monster is placed on the chain axis and topples into exactly the corpse pose; the corpse takes over at `hit`. The director owns the camera through `world.cam.override` for the whole attack phase (TV shot at visible FOV 34°, then the gameplay 'chain' framing with a slow dolly) and releases it at `attack.end` or when the phase leaves 'attack'.
- **`playAttack(desc)`** accepts `desc.onEvent(type, payload)`: the preview emits `attack-start`, `attack:cut`, `hit` (at 2.6) and `attack:end` so a title loop can feed audio. `skip()` jumps to the hit, then to the end.
- **Vehicles**: one skinned mesh per vehicle (moving parts on rigid bones), beacons and blob contact shadows are one instanced draw call each, route lines one ribbon mesh. Vehicles do not cast shadow-map shadows (blob shadows at both qualities). A debris unit is a wheeled excavator plus a tipper that leaves the garage behind it, parks on the road and shuttles to `DUMP.W`/`DUMP.E`.
- **Lab**: `actor-cases.js` adds attack (first/repeat), preview, all-three-crews, dispatch x3, carve +25 %, rare glint, new vehicle drive-in. Two minimal edits in `lab.js` (W's file, done by A with this note): the placeholder carcass is skipped when `actors.drawsCorpse`, and `window.lab.live(on)` toggles the live loop.

---

## 14. Integrator decisions (I, phase 3)

Implemented in `index.html`, `js/main.js`, `sw.js`, `manifest.webmanifest`, `tools/serve.mjs`, `tests/e2e/*.cjs`, `tests/shots.cjs`.

- **Boot**: `index.html` paints a static plate (`#boot`, same markup and classes as the UI veil) before any script; `main.js` builds the UI (the veil replaces the plate), imports `js/scene/scene.js` dynamically (three.js loads behind the veil), then `scene.ready` → `ui.setScene` → `scene.prime(s)` → offline time → loop. Loading bar 0.15 / 0.45 / 0.8 / 1. If the scene module fails to load or WebGL fails, the veil shows a Turkish error line (`ui.loading.line(text, 'err')`).
- **First launch tap**: a fresh game (FTUE `cold`, no attack yet) waits on the veil for one tap ("Başlamak için dokun", `ui.loading.prompt(text)` → Promise) so Web Audio opens before the cold open plays (browsers start sound only after a gesture; the owner wants the attack sequence heard). Resumed games skip it. `?autostart=1` skips it for tests.
- **v1 notice**: pushed with `game.pushNotice(s, 'v1')` on the first `phase` change away from `'attack'` (after the cold open, before the call), or at boot if the FTUE is already past `cold`; never again once `flags.v1Notice` is set.
- **Loop**: `game.tick(s, dt × slow)` → `scene.update(s, dt)` → `ui.render(s, now)` → `updateAudio(s, dt)`. The rare-part slow-mo (0.35 for 0.4 s) slows only the game tick; the scene slows its own visual clock on the same `'rare'` event, so visuals are not slowed twice. Errors inside a frame are logged (first 3) and the loop keeps running.
- **Camera seam**: the UI receives a thin wrapper of the scene whose `frame('city')` becomes `frame('district:1+yard')` while the guided contract runs (phase `cleanup`, FTUE `fire`/`rubble`/`carve`), so closing the district sheet keeps Konak and the yard in view and the first trucks stay readable; everything else passes through unchanged.
- **Input**: canvas pointer events only (`#ui` is `pointer-events: none` except its controls). Tap = < 10 px and < 300 ms. During the attack a tap calls `act('skipAttack')`. Vehicle pick selects the vehicle's district; yard pick opens Depo when unlocked. One-finger drag → `scene.panBy` (the rig ignores it at city zoom); two-finger pinch ±15 % → `scene.zoomTo('district' | 'city')`.
- **Quality**: `aftermath.gfx.v1 = { quality: 'auto' | 'high' | 'low', downgraded }`. Auto starts high; the scene's `'quality-hint'` (EMA < 28 fps for 5 s, first 10 s and the attack ignored) switches to low and stores `downgraded: true`, so the next launch starts low (the settings sheet shows "Akıcılık için düşürüldü."). Choosing Yüksek or Düşük in settings stores that choice and disables the auto switch. `?q=high|low` forces a preset for tests.
- **Save**: every 5 s of play, 400 ms after an ok `action` and after `contract-done`, `payment`, `purchase`, `sale`, `ftue`, `unlock`, `goal`; on `visibilitychange` hidden and `pagehide`. Settings "Sil" sets a flag so the `pagehide` save cannot write the old game back after the wipe.
- **Service worker**: network-first, cache `aftermath-v2`; old `aftermath-*` caches are deleted on activate; only same-origin `GET` with `ok` basic responses are cached; offline fallback ignores the query string. Registered on https only.
- **Test hooks** (8.5 plus): `?manual=1` stops the rAF loop (the DOM still refreshes at 10 Hz so UI timers and transitions run) so time moves only through `aftermath.step(sec)`; `?seed=<n>` seeds the rng before a fresh state. Extra members: `draw()` (render UI + 3D without moving time), `start()` (skip the first-launch tap), `load(state)`, `prefs()`, `save()`, `started`, `booted`. `scenario()` / `ftue()` / `load()` reset the UI view flags and re-prime the scene.
- **E2E**: `tests/e2e/lib.cjs` (server, iPhone 13 page at 390 × 844, DOM rule sampler for DESIGN §12 items 2-7 plus "faded control still catches taps"), `ftue.cjs` (FTUE by highlighted taps, reload mid-carve), `smoke.cjs` (real-loop boot, contracts #2 and #3 by taps, reload mid-contract, settings, quality, budgets, offline notice), `run.cjs` (logic + both). `tests/shots.cjs` writes the review set to `scratchpad/v2/integrated/` (`OUT=` to change) at DPR 2.
- **Edits outside I's files** (minimal, for integration): `js/audio.js` per 3.4; `tests/logic/audio.test.mjs` (no `'float'` listener expected; importing audio.js must succeed); `js/ui/loading.js` (`line()`, `prompt()`); `css/game.css` (prompt styles; `#ui .npc:not(.on) { pointer-events: none }`, because `#ui button` kept the faded NPC card catching taps over the tender reveal button); `js/ui/floats.js` (floats born within 450 ms over the same spot stack 24 px upward instead of overprinting).
