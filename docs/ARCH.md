# Toy Factory: architecture (v0)

Plain static HTML/CSS/JS ES modules, no build step, no network fetches at run time.
Everything is vendored and referenced with relative paths, so the game works from a
sub-path and inside a sandboxed iframe (no service worker; localStorage access is
always wrapped in try/catch).

Work split: core-ui owns `js/game/*`, `js/i18n/*`, `js/ui/*`, `css/app.css`,
`js/audio.js`, `tools/serve.mjs`, `tests/logic/*`, `tests/ui/*`, `assets/fonts/*`,
`ui-lab.html`. The scene agent owns `js/scene/*`. The integrator writes
`index.html` and `js/main.js` last.

## File layout

```
index.html                 import map ("three" and "three/addons/"), canvas + #ui root (integrator)
ui-lab.html                UI development page: real game + DOM UI, fake scene, coloured placeholder
css/app.css                all UI styles
js/main.js                 integration (integrator)
js/audio.js                procedural Web Audio sounds
js/game/config.js          FACTORIES + RULES (pure data)
js/game/state.js           fresh state, load/migrate, serialise
js/game/sim.js             economy maths + the production line step
js/game/goals.js           goal progress / completion
js/game/format.js          number / time formatting per language
js/game/i18n.js            dictionaries, detectLang(), t()
js/game/index.js           createGame()
js/i18n/en.js, tr.js       flat key -> string objects with {name} placeholders
js/ui/*.js                 DOM UI (see "UI" below)
js/scene/*.js              three.js view (scene agent)
js/scene/layout.js         shared layout numbers (both sides import it)
tests/logic/*.test.mjs     node tests, run with `node tests/logic/run.mjs`
tests/logic/bot.mjs        attentive-player bot; `node tests/logic/bot.mjs` prints a timeline
tests/ui/lab-shots.cjs     screenshots of the UI lab states (Playwright)
tests/e2e/play.cjs, tests/shots.cjs   end-to-end (integrator)
tools/serve.mjs            static server for the repo root (PORT env, default 5300)
assets/fonts/              Fredoka (OFL) woff2 + licence
```

## Game API (js/game/index.js)

`createGame({ save, now, lang })`

- `save`: a string from `game.save()` (or an already parsed object, or null for a new game).
  Broken or foreign saves are ignored and a fresh game starts.
- `now`: function returning milliseconds (default `Date.now`). Tests pass a fake clock.
  A number is also accepted (fixed time).
- `lang`: initial language for a NEW game (`'en' | 'tr'`); default: `detectLang()`
  from the phone language. A loaded save keeps its own language setting.

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
  Additions to the contract: `factory.complete` (all goals collected), `goals[].claimed`,
  `offline` (pending offline earnings).
  Station state meaning: `progress` 0..1 of the current cycle; `progress === 0` means idle
  (waiting for input), `progress === 1` means finished but blocked because the next tray is
  full; `tray` = items waiting in this station's input tray (0..3; always 0 for the first
  station, which has unlimited raw material); `boostT` = seconds of tap boost left.
- `game.tick(dt)`: advance the simulation by dt seconds (internally sub-stepped, dt is
  clamped to 1 s per call; longer gaps are treated as time away -> offline earnings).
- `game.act(action) -> { ok, reason }`. Actions:
  - `{ type: 'upgrade', station }` reasons: `unknown`, `locked`, `money`
  - `{ type: 'open', station }` reasons: `unknown`, `open`, `order` (previous station must be open first), `money`
  - `{ type: 'boost', station }` reasons: `unknown`, `locked`, `max`
  - `{ type: 'claimGoal', id }` reasons: `unknown`, `notDone`, `claimed`
  - `{ type: 'nextFactory' }` reasons: `notComplete`, `last`
  - `{ type: 'claimOffline' }` reasons: `none`
  - `{ type: 'setting', key, value }` keys: `lang` ('en'|'tr'), `sound` (bool), `quality` ('high'|'low'), `fps` (bool)
  - `{ type: 'tutorial', step }` step: 0 | 1 | 2 | 'done'
  `station` may be a station id string (`'saw'`) or an index (0..3).
- `game.on(event, fn) -> unsubscribe`. Events and payloads:
  - `'cycle' { station }` a station finished a cycle (station = id)
  - `'pass' { from, to }` an item moved into the next station's tray (ids)
  - `'sold' { value }` the last open station finished a toy; value = coins earned
  - `'upgrade' { station, level, milestone }` milestone = true when the new level is 10/25/50/100
  - `'open' { station }`
  - `'boost' { station }`
  - `'goal' { id }` a goal became done (collectable)
  - `'claim' { id, reward }` a goal reward was collected (addition)
  - `'factoryComplete' { id }` every goal of the factory was collected
  - `'factoryStart' { id }` a new factory began (after nextFactory)
  - `'money' { value, delta }` money changed (value = new total)
  - `'offline' { seconds, amount }` offline earnings are waiting (addition)
  - `'setting' { key, value }` (addition)
  - `'tutorial' { step }` (addition)
- `game.save() -> string` (JSON, also refreshes `lastSeen`).
- `game.config()` -> the current factory config (addition).
- `game.select.*` read helpers for the UI:
  - `incomePerSec()` steady income without boosts (bottleneck rate x toy value)
  - `stationView(id)` -> `{ id, index, nameKey, open, level, value, nextValue, time, nextTime,
    cost, openCost, canAfford, missing, canOpen, locked, milestone: { prev, next, ratio, reached },
    nextIsMilestone, bottleneck, boostT, progress, tray }`
  - `goalViews()` -> the (up to) 3 visible goals: `{ id, type, textKey, params, cur, target,
    progress, done, claimed, reward, station }`
  - `canAfford(cost)` / `canAfford({ type, station })`
  - `offline()` -> `null | { seconds, amount }`
  - `factory()` -> `{ id, index, nameKey, toyKey, isLast, complete, reward, sold }`
  - `toyValue()` coins per finished toy right now

## Economy (v0 tuning)

- Upgrade cost from level L to L+1: `baseCost * 1.15^(L-1)` (rounded).
- Value a station adds per toy: `baseValue * level`. A toy sells for the sum over open stations.
- Cycle time: `baseTime / ((1 + 0.04 * (level - 1)) * 2^milestonesReached)`; a tap boost
  doubles speed (each tap +1.5 s, capped at 5 s).
- Throughput = slowest open station (the bottleneck). The bottleneck's input tray fills up
  (max 3 waiting) and the station before it stops with a finished item (progress = 1).
- Stations open in order; stations 1 and 2 start open.
- Goals: 3 visible at a time (first three not yet collected). A goal becomes done when its
  condition holds (sticky) and is collected with a tap for a coin reward. When every goal is
  collected the factory is complete; "Next factory" resets money to the next factory's
  start money + the completion bonus. Factory 2 values and costs are 10x.
- Offline: `incomePerSec * min(away, 2 h)`, only if away >= 60 s; shown on return and
  collected with a tap.
- Pacing (checked by tests/logic, bot playing actively): first upgrade at once, Paint opens
  about 1 min, Gift Wrap about 3 min, factory 1 complete in 8-12 min, never more than 20 s
  without a reward moment (upgrade, open, goal, milestone).

## Station ids (config order = layout index)

| index | factory 1 `wood` | factory 2 `teddy` |
|-------|------------------|-------------------|
| 0     | `saw`            | `cutter`          |
| 1     | `assembly`       | `stuffing`        |
| 2     | `paint`          | `stitching`       |
| 3     | `wrap`           | `ribbon`          |

Scene: `anchor(stationId)` should accept the id string (and ideally the index too);
`pick()` returns `{ type: 'station', id: '<id string>' }`.

## Layout shared with the scene (js/scene/layout.js)

- `SCREEN.stations[i]`, `SCREEN.truck`, `SCREEN.coins`: normalised portrait positions
  (fractions of the canvas CSS size, y down) for 390x844. They are design targets; the UI
  always uses `scene.anchor()` for real positions. The UI lab fake scene returns exactly these.
- `UI_INSETS = { top, bottom }`: CSS px covered by the HUD (top) and the goal strip (bottom),
  plus the safe-area insets. Keep the stations and truck in the area between.
- Anchors for stations should be a little above the machine: the UI draws its DOM overlays
  there (level badge, "upgrade ready" arrow, and for locked plots the big "Open" price sign).
  So the scene draws the locked plot itself (empty plot, cones, dashed outline) but NOT the
  price text. The scene does not draw coin numbers either (the UI shows floating "+coins").
- `anchor('coins')` may return the design position; the UI uses its own counter element.

## UI (js/ui)

`createUI({ root, game, scene, audio, canvas })` -> `{ update(dt), openCard(id), closeCard(), destroy() }`

- Builds all DOM inside `root` (a full-screen element above the canvas, `pointer-events: none`
  on the root, enabled on the controls).
- Subscribes to game events itself (floats, coin flights, toasts, sounds, card refresh).
- If `canvas` is given it listens for taps on it: `scene.pick()` -> station: boost it and open
  its card; empty space: close the card; truck: a little honk.
- Calls `scene.setQuality()` when the quality setting changes; reads `scene.stats()` for the
  FPS meter; uses `scene.anchor()` every frame for overlay positions.
- main.js forwards game events to the scene: `game.on(ev, p => scene.fx(ev, p))`.

Expected `index.html` body (same as ui-lab.html, with the real canvas):

```html
<canvas id="scene"></canvas>
<div id="ui"></div>
<script type="module" src="js/main.js"></script>
```

Main loop sketch (integrator):

```js
const game = createGame({ save: storage.load() });
const scene = createScene(canvas, { quality: game.state.settings.quality });
scene.setFactory(game.config());
const audio = createAudio();
const ui = createUI({ root, game, scene, audio, canvas });
for (const ev of EVENTS) game.on(ev, p => scene.fx(ev, p));
game.on('factoryStart', () => scene.setFactory(game.config()));
loop(dt => { game.tick(dt); scene.update(game.state, dt); ui.update(dt); });
setInterval(() => storage.save(game.save()), 5000); // + on visibilitychange hidden
window.toy = { game, step(dt) { /* tick game, scene, ui in 1/60 s steps */ } };
```
