# Toy Factory: architecture (v0)

Plain static HTML/CSS/JS ES modules, no build step, no network fetches at run time.
Everything is vendored and referenced with relative paths, so the game works from a
sub-path and inside a sandboxed iframe (no service worker; any localStorage access must
be wrapped in try/catch: the game modules never touch storage, main.js does).

Work split: core-ui owns `js/game/*`, `js/i18n/*`, `js/ui/*`, `css/app.css`,
`js/audio.js`, `tools/serve.mjs`, `tests/logic/*`, `tests/ui/*`, `assets/fonts/*`,
`ui-lab.html`. The scene agent owns `js/scene/*` (and `scene-lab.html`). The integrator
writes `index.html` and `js/main.js` last.

## File layout

```
index.html                 import map ("three", "three/addons/"), canvas + #ui root (integrator)
ui-lab.html                UI development page: real game + DOM UI, fake scene, coloured placeholder
css/app.css                all UI styles (+ @font-face for Fredoka)
js/main.js                 integration (integrator)
js/audio.js                procedural Web Audio sounds
js/game/config.js          FACTORIES + RULES (pure data, the economy lives here)
js/game/state.js           fresh state, load/validate/migrate, serialise
js/game/sim.js             economy maths + the production line step
js/game/goals.js           goal progress / completion
js/game/format.js          number / time formatting per language (words come from i18n)
js/game/i18n.js            dictionaries, detectLang(), t(), LANG_NAMES
js/game/index.js           createGame(), EVENTS
js/i18n/en.js, tr.js       flat key -> string objects with {name} placeholders
js/ui/index.js             createUI()
js/ui/hud.js               coins (rolling counter) + income + settings button + FPS meter
js/ui/marks.js             (addition) DOM overlays at station anchors: level badge, upgrade arrow, Open sign
js/ui/card.js              station card (bottom sheet, one big button, hold to repeat)
js/ui/goals.js             goal strip (3 tiles, collect)
js/ui/tutorial.js          3-step pointing hand
js/ui/settings.js          settings sheet
js/ui/complete.js          factory complete screen
js/ui/offline.js           "while you were away" card
js/ui/floats.js            +coins floats, coin flights, star bursts, toasts
js/ui/dom.js               DOM helpers + inline SVG icons (own drawings)
js/scene/*.js              three.js view (scene agent)
js/scene/layout.js         shared layout numbers (both sides import it)
tests/logic/run.mjs        runs tests/logic/*.test.mjs (node, no deps): `node tests/logic/run.mjs`
tests/logic/bot.mjs        attentive-player bot; `node tests/logic/bot.mjs [--lazy] [--factory=2]` prints a timeline
tests/ui/lab-play.cjs      Playwright interaction test of the UI in ui-lab.html
tests/ui/lab-shots.cjs     Playwright screenshots of the UI lab states: `node tests/ui/lab-shots.cjs <outDir>`
tests/e2e/play.cjs, tests/shots.cjs   end-to-end (integrator)
tools/serve.mjs            static server for the repo root (PORT env, default 5300; .woff2/.mjs MIME ok)
assets/fonts/              Fredoka 500/600/700 latin + latin-ext woff2, OFL.txt, README.md
```

## Game API (js/game/index.js)

`createGame({ save, now, lang })`

- `save`: a string from `game.save()` (or an already parsed object, or null for a new game).
  Broken, foreign or tampered saves are ignored or clamped (stations open in order,
  trays 0..3, progress 0..1, money >= 0).
- `now`: function returning milliseconds (default `Date.now`). Tests pass a fake clock.
  A number is also accepted (fixed time).
- `lang`: language for a NEW game (`'en' | 'tr'`); default `detectLang()` (phone language,
  English otherwise). A loaded save keeps its own language setting.

Returns `game`:

- `game.state`: plain JSON-serialisable object:
  ```
  { v: 1, money, lifetimeMoney, factoryIndex,
    factory: { id, stations: [{ id, open, level, progress, tray, boostT }], sold, complete },
    goals: [{ id, done, progress, claimed }],
    settings: { lang, sound, quality, fps },
    tutorial,        // 0 | 1 | 2 | 'done'
    lastSeen,        // ms timestamp of the last tick/save
    offline }        // null or { seconds, amount } waiting to be collected
  ```
  Additions to the contract: `factory.complete` (every goal collected), `goals[].claimed`,
  `offline` (pending offline earnings).
  Station state: `progress` 0..1 of the current cycle; `progress === 0` = idle (waiting for
  input); `progress === 1` = finished but blocked because the next tray is full (pile-up);
  `tray` = items waiting in this station's input tray (0..3; always 0 for the first station,
  which has unlimited raw material, so the scene can show a static material pile);
  `boostT` = seconds of tap boost left.
- `game.tick(dt)`: advance by dt seconds (sub-stepped at 0.05 s, dt clamped to 1 s per call).
  If the wall clock (`now()`) jumped more than 60 s since the last tick (page hidden, rAF
  paused), that gap becomes offline earnings automatically.
- `game.act(action) -> { ok, reason }`:
  - `{ type: 'upgrade', station }` reasons: `unknown`, `locked`, `money`
  - `{ type: 'open', station }` reasons: `unknown`, `open`, `order` (previous station first), `money`
  - `{ type: 'boost', station }` reasons: `unknown`, `locked`, `max`
  - `{ type: 'claimGoal', id }` reasons: `unknown`, `notDone`, `claimed`
  - `{ type: 'nextFactory' }` reasons: `notComplete`, `last`
  - `{ type: 'claimOffline' }` reasons: `none`
  - `{ type: 'setting', key, value }` keys `lang` ('en'|'tr'), `sound` (bool), `quality` ('high'|'low'), `fps` (bool); reason `invalid`
  - `{ type: 'tutorial', step }` step 0 | 1 | 2 | 'done'; reason `invalid`
  `station` may be the id string (`'saw'`) or the index (0..3).
- `game.on(event, fn) -> unsubscribe`. `EVENTS` (exported) lists them all:
  - `'cycle' { station }` a station finished a cycle (station = id)
  - `'pass' { from, to }` an item moved into the next station's tray (ids)
  - `'sold' { value }` the last open station finished a toy; value = coins earned
  - `'upgrade' { station, level, milestone }` milestone = true at levels 10/25/50/100
  - `'open' { station }`
  - `'boost' { station }`
  - `'goal' { id }` a goal became done (collectable; may be a goal not visible yet)
  - `'claim' { id, reward }` (addition) a goal reward was collected
  - `'factoryComplete' { id }` every goal of the factory was collected
  - `'factoryStart' { id }` a new factory began (after nextFactory) -> call `scene.setFactory(game.config())`
  - `'money' { value, delta }` money changed (value = new total; once per tick for sales)
  - `'offline' { seconds, amount }` (addition) offline earnings are waiting
  - `'setting' { key, value }` (addition)
  - `'tutorial' { step }` (addition)
- `game.save() -> string` (JSON; also refreshes `lastSeen`). Save every few seconds and on
  `visibilitychange` -> hidden / `pagehide`.
- `game.config()` (addition) -> the current factory config (pass to `scene.setFactory`).
- `game.checkAway()` (addition) -> turn the time since `lastSeen` into offline earnings now
  (optional: tick() does it by itself).
- `game.select.*` read helpers for the UI:
  - `incomePerSec()` steady income without boosts (bottleneck rate x toy value)
  - `toyValue()` coins per finished toy right now
  - `stationView(id)` -> `{ id, index, nameKey, open, level, value, nextValue, time, nextTime,
    cost, openCost, canAfford, missing, canOpen, locked, milestone: { prev, next, ratio, reached },
    nextIsMilestone, bottleneck, boostT, progress, tray }`
  - `goalViews()` -> the (up to) 3 visible goals `{ id, type, textKey, params: { n, stationKey },
    cur, target, progress, done, claimed, reward, station }`
  - `canAfford(cost)` / `canAfford({ type: 'upgrade'|'open', station })`
  - `offline()` -> `null | { seconds, amount }`
  - `factory()` -> `{ id, index, nameKey, toyKey, isLast, complete, reward, sold }`
  - `bottleneck()` (addition) -> id of the slowest open station
  - `hints()` (addition) -> `{ [stationId]: 'best' | 'good' }` affordable upgrades worth buying
    (drives the green arrows; 'best' bounces)

## Economy and design decisions (v0)

- Value a station adds per toy: `baseValue * level * 1.04^(level-1)`. A toy sells for the
  sum over open stations.
- Upgrade cost from level L to L+1: `baseCost * 1.15^(L-1)` (rounded).
- Speed: `baseTime / 2^milestonesReached`; milestones at 10, 25, 50, 100 (each x2 speed).
  Levels in between only raise value (simple rule for kids: "upgrade = more coins per toy,
  star = double speed"). `RULES.speedPerLevel` exists but is 0.
- Tap boost: x2 speed, +1.5 s per tap, capped at 5 s. Tapping a station both boosts it and
  opens its card.
- The line: each station takes one item from its tray, works one cycle, hands the item to the
  next tray (max 3) or blocks (progress = 1) if it is full. The last open station sells.
  Throughput = slowest open station; its input tray piles up. The card of the bottleneck
  says "Slowest station. Upgrade it to speed up the line."
- Later stations have shorter base times (saw 1.0 s, assembly 1.5 s, paint 1.2 s, wrap 0.9 s)
  and much bigger values, so opening a station never slows the line and always raises income
  clearly (checked: x1.33 or more in the bot runs).
- Stations open in order; stations 1 and 2 start open. Factory 1 open costs: paint 700,
  wrap 60K; the "Open Gift Wrap" goal pays exactly the first wrap upgrade.
- Goals: 15 per factory, 3 visible at a time (first three not yet collected). A goal becomes
  done when its condition holds (sticky) and is collected with a tap for coins. When every
  goal is collected the factory is complete; "Next factory" resets money to the next
  factory's start money + the completion bonus. Factory 2 = factory 1 x10 (values, costs,
  rewards, income goals).
- Offline: `incomePerSec * min(away, 2 h)`, only if away >= 60 s; shown on return,
  collected with a tap; unclaimed amounts survive saves, still capped at 2 h.
- Tutorial (factory 1 only, never blocks input): 0 "Tap the Saw" -> card "Tap Upgrade";
  1 shown only once Paint is affordable: "You can open a new station" -> "Tap Open";
  2 "Goals give coins. Tap to collect." (or "Finish goals to earn coins", auto-dismissed
  after 6 s). The game logic advances the steps (upgrade -> 1, open -> 2, claim -> done).

Pacing measured by `tests/logic/bot.mjs` (attentive player: collects goals, opens stations,
saves a little for clearly better upgrades, boosts the bottleneck every ~7 s), 4 seeds:
first upgrade 0.4 s, Paint opens ~1:00, Gift Wrap ~2:45, factory 1 complete ~9:50-10:10,
longest gap between reward moments <= ~18 s, factory 2 ~10 min. A careless player (always
the cheapest upgrade, no boosts, no saving) still finishes factory 1 (~27 min): no softlock.

## Station ids (config order = layout index)

| index | factory 1 `wood` | factory 2 `teddy` |
|-------|------------------|-------------------|
| 0     | `saw`            | `cutter`          |
| 1     | `assembly`       | `stuffing`        |
| 2     | `paint`          | `stitching`       |
| 3     | `wrap`           | `ribbon`          |

`config.palette` per factory has colours the scene may use (floor, wall, belt, accents, toy colours).

## Layout shared with the scene (js/scene/layout.js)

- `SCREEN.stations[i]`, `SCREEN.truck`, `SCREEN.coins`: normalised portrait positions
  (fractions of the viewport, y down) for 390x844. Design targets only; the UI always uses
  `scene.anchor()`, and falls back to SCREEN if the scene returns nothing. The UI lab fake
  scene returns exactly these (station anchors 46 px above the SCREEN point).
- `UI_INSETS` / `INSETS = { top, bottom, left, right }`: CSS px covered by the HUD (top) and
  the goal strip (bottom), NOT counting safe areas (the scene adds them).
  At run time the UI measures its real HUD bottom and goal-strip top and calls
  `scene.setInsets({ top, bottom, left: 4, right: 4 })` (safe areas subtracted) on start and resize.
- Station anchors are a little above the machine: the UI draws its DOM overlays there
  (level badge "Lv 7", green "upgrade" arrow, and for locked plots the big "Open + price"
  sign or a small "Soon" sign). The scene draws the plot itself but no price text and no
  coin numbers (the UI shows floating "+coins" at `anchor('truck')`).

## UI (js/ui)

`createUI({ root, game, scene, audio, canvas })` -> `{ update(dt), openCard(id), closeCard(),
openSettings(), tapStation(id), relabel(), destroy() }`

- Builds all DOM inside `root` (full-screen, above the canvas, `pointer-events: none`
  except on controls). Layers: marks, panels (goal strip, card), floats, top (HUD, toast),
  overlays (modals, tutorial).
- Subscribes to game events itself (floats, coin flights, toasts, sounds, card refresh),
  reads `game.state` every frame with change detection (no layout reads in the frame loop
  except anchors -> transforms).
- If `canvas` is given it listens for `pointerdown` on it: `scene.pick()` -> station: boost it
  and open its card; truck: honk; empty: close the card.
- Calls `scene.setQuality()` when the quality setting changes, reads `scene.stats()` twice a
  second for the FPS meter, `scene.anchor()` every frame for the overlays.
- Unlocks audio on the first pointerdown anywhere.
- main.js forwards game events to the scene: `for (const ev of EVENTS) game.on(ev, p => scene.fx(ev, p))`.

Expected `index.html` body (as in ui-lab.html, with the real canvas):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<link rel="stylesheet" href="css/app.css">
<canvas id="scene"></canvas>
<div id="ui"></div>
<script type="module" src="js/main.js"></script>
```

Main loop sketch (integrator):

```js
import { createGame, EVENTS } from './game/index.js';
import { createUI } from './ui/index.js';
import { createAudio } from './audio.js';
const load = () => { try { return localStorage.getItem('toyfactory.save'); } catch { return null; } };
const store = (s) => { try { localStorage.setItem('toyfactory.save', s); } catch { /* sandboxed */ } };
const game = createGame({ save: load() });
const scene = createScene(canvas, { quality: game.state.settings.quality, factory: game.config(),
  onAutoQuality: (q) => game.act({ type: 'setting', key: 'quality', value: q }) });
const audio = createAudio();
const ui = createUI({ root: document.getElementById('ui'), game, scene, audio, canvas });
for (const ev of EVENTS) game.on(ev, (p) => scene.fx(ev, p));
game.on('factoryStart', () => scene.setFactory(game.config()));
loop(dt => { game.tick(dt); scene.update(game.state, dt); ui.update(dt); });
setInterval(() => store(game.save()), 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) store(game.save()); });
window.toy = { game, step(dt) { /* tick game, scene, ui in 1/60 s steps */ } };
```

## Audio (js/audio.js)

`createAudio()` -> `{ unlock(), play(name), setEnabled(bool), enabled(), sounds }`.
Sounds (all synthesised): tap, boost, nope, upgrade, milestone, coin (sale tick, rate
limited), claim, open, goal, complete, honk. The AudioContext is created on the first
gesture; `play` is a no-op until then or when sound is off.

## Languages

English is the default; Turkish is chosen when the phone language starts with `tr`.
Every UI string is in `js/i18n/<lang>.js` (flat keys, `{name}` placeholders), including
number suffixes (`num.suffixes`: `K,M,B,T` / `B,Mn,Mr,Tn`), decimal/group separators and
time units. Turkish needs case forms for station names in sentences: `station.<id>.acc`
("Testereyi", "Boya Kabinini"); English uses "the Saw" there. To add a language: copy
en.js, translate, import it in js/game/i18n.js (`DICTS`), add `lang.<code>` to every file;
the settings sheet lists all DICTS. tests/logic/i18n.test.mjs checks same keys, same
placeholders, no emoji, no "!" in Turkish, and that every key used in code exists.

## Tests

- `node tests/logic/run.mjs` - logic, pacing, softlock, save/load, offline cap, i18n (38 tests, ~1 s).
- `timeout 600 node tests/ui/lab-play.cjs` - UI interaction checks in the UI lab (PORT, default 5301).
- `timeout 600 node tests/ui/lab-shots.cjs <outDir>` - UI lab screenshots at 390x844 and 390x664, 1x.
- UI lab presets: `ui-lab.html?state=fresh|card|poor|locked|goals|tut1|milestone|sales|complete|teddy|offline|settings&lang=en|tr&paused=1`;
  `window.toy = { game, ui, scene, step(dt), buy(station, n), applyPreset(name) }`.

## Scene (js/scene)

Owner: scene agent. A pure view: it reads the game state every frame and plays effects on
`fx()`. No text is drawn in 3D (badges, prices and coin numbers are DOM, see above).

Files: `scene.js` (createScene, events, pick, anchors), `layout.js` (shared numbers),
`camera.js` (orthographic 3/4 iso camera, yaw 45 deg, pitch 34 deg, fit-to-insets),
`factory.js` (themes, floor/walls/windows/props, belt with scrolling texture, chute, dock,
truck), `stations.js` (8 machine builders, locked plots, turntables, progress screens,
milestone trims, glows), `workers.js` (chibi workers, instanced), `items.js` (toy stages and
the item flow), `fx.js` (instanced particles), `quality.js` (presets, FPS, auto drop),
`kit.js` (addition: primitive cache, part builder that merges coloured primitives into one
geometry, toon material with a per-instance tint mask, canvas textures).

Layout: the belt is a staircase in world space that reads as a zigzag down the portrait
screen: station 1 top-left, 2 right, 3 left, 4 right, truck dock bottom-left. Each station
sits on a belt corner (a turntable = the work spot); the machine stands behind the corner,
the worker beside it, waiting items queue on the incoming belt in front of the machine.

`createScene(canvas, opts)`; opts: `quality` ('high'|'low'), `autoQuality` (default true),
`onAutoQuality(q)` (called once when the scene drops itself to Low: main.js should persist
it with `game.act({ type: 'setting', key: 'quality', value: q })`), `zoom` (default 1),
`preserveDrawingBuffer` (tests), `factory` (initial config).

- `setFactory(config)`: rebuilds the factory. Theme by id: `teddy` (or a name containing
  teddy/bear) -> Teddy Bears, anything else -> Wooden Toys. `palette.toy` (wood) colours the
  painted cars, `palette.ribbon` (teddy) the ribbons. Station ids come from `config.stations`.
- `update(state, dt, render = true)`: reads `state.factory.stations[i]` (`open`, `level`,
  `progress`, `tray`, `boostT`) and renders. dt is clamped to 0.1 s; all animation runs on dt
  (deterministic with a fixed step). `render === false` skips the draw (lab fast-forward).
- `fx(event, payload)`: `pass` {from,to} and `sold` launch an item along the belt (to the next
  tray / into the truck); without them items still appear in the trays but do not travel.
  `cycle` (small puff + squash), `upgrade` {station, milestone} (pop, star burst; bigger with
  confetti on milestones), `open` (plot builds into the machine with a bounce, dust, stars,
  confetti), `boost` (sparkle burst; while `boostT > 0` a cyan glow + swirling sparkles),
  `goal`/`claim` (confetti), `factoryComplete` (big confetti + stars), `factoryStart`
  (machines pop in + confetti), `setting` {key:'quality'} (calls setQuality). Others ignored.
- `pick(clientX, clientY)` -> `{ type: 'station', id }` (locked plots too) | `{ type: 'truck' }`
  | null. Generous boxes around machine + turntable + worker. Picking the truck bounces it.
- `anchor(id | index | 'truck' | 'coins')` -> `{ x, y, visible }` in CSS px (viewport).
  Open station: just above the machine's highest part; locked plot: 0.95 units above the plot
  (the "Open" sign points there); truck: above the truck bed; coins: `SCREEN.coins` point.
- `setQuality('high'|'low')`: High = pixel ratio min(dpr, 2), antialias (fixed at creation),
  props and sunlight patches, full particles. Low = min(dpr, 1.25), no decor, ~45% particles.
  Auto drop: average frame time > 26 ms for 3 s on High -> Low (+ `onAutoQuality`).
- `stats()` -> `{ fps, frameMs, calls, tris, quality, autoLowered, particles }`.
- `resize()`: also automatic (window resize, ResizeObserver, periodic size check).
- Extensions: `setInsets({ top, bottom, left, right })` (CSS px without safe areas; the scene
  adds `env(safe-area-inset-*)`), `setAutoQuality(bool)`, `dispose()`, `debug` (internals for
  the lab/tests).

Framing keeps the machines, corners, workers and the truck inside the viewport minus
insets + safe areas, and keeps the level badges of the top two machines below the HUD. It
works in portrait, landscape and tablets (fit by the tighter axis, centred).

Budgets (Playwright/SwiftShader, 402x874): 28-40 draw calls, 36k-60k triangles (worst case:
all open, all boosted, 100+ particles), ~0.1 ms of JS per frame. No shadow maps (blob
shadows), no post-processing, toon material with one hemisphere + one directional light,
merged static geometry, instanced workers/items/particles/turntables, no per-frame allocations.

Scene lab: `scene-lab.html` drives the scene with a fake line simulation.
URL: `factory=wood|teddy`, `open=1100` (per station), `levels=1,1,1,1`, `tray=0,0,0,0`,
`boost=0000` (1 = endless boost), `flow=0|1`, `quality=high|low`, `t=<seconds>` (fast-forward
at load), `manual=1` (no rAF; step only via hooks), `auto=0` (no auto quality), `hud=0`,
`labels=0` (mock DOM overlays off), `safe=<top>,<bottom>` (emulated safe areas),
`fx=upgrade:saw,sold` (fire events at load). Hooks: `lab.setTime(t)` (reset + run t seconds),
`lab.step(dt, render)`, `lab.fx(ev, payload)`, `lab.state`, `lab.scene`; also
`window.__setTime`, `window.step`, `window.toy = { step, game: { state }, scene }`.
Test: `timeout 900 node tests/scene/lab-shots.cjs <outDir> [only=name,...]` (own static server
on PORT, default 5302): screenshots of the main states at 402x874 (app) and 390x664 (web),
stats per shot, pick/anchor sanity, fails on console errors or budget overrun.

