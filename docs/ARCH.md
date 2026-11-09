# Toy Factory: architecture (v0)

Plain static HTML/CSS/JS ES modules, no build step, no network fetches at run time.
Everything is vendored and referenced with relative paths, so the game works from a
sub-path and inside a sandboxed iframe (no service worker; any localStorage access must
be wrapped in try/catch: the game modules never touch storage, main.js does).

Work split: core-ui owns `js/game/*`, `js/i18n/*`, `js/ui/*`, `css/app.css`,
`js/audio.js`, `tools/serve.mjs`, `tests/logic/*`, `tests/ui/*`, `assets/fonts/*`,
`ui-lab.html`. The scene agent owns `js/scene/*` (and `scene-lab.html`). The integrator
wrote `index.html`, `js/main.js`, `tests/e2e/play.cjs`, `tests/shots.cjs`,
`tests/helpers.cjs`, `README.md`, `LICENSES.md`.

## Run

```
PORT=5300 node tools/serve.mjs      # then open http://localhost:5300/
```

Any static server works (the game only needs correct MIME types for `.js` and `.woff2`).
It also runs from a sub-path and inside a sandboxed iframe (`tools/serve.mjs` sends
`Access-Control-Allow-Origin: *`, which module scripts and fonts need when the iframe has an
opaque origin; without storage access the game simply does not save).

## File layout

```
index.html                 import map ("three", "three/addons/"), canvas + #ui root, loading screen
ui-lab.html                UI development page: real game + DOM UI, fake scene, coloured placeholder
css/app.css                all UI styles (+ @font-face for Fredoka)
js/main.js                 integration: game + scene + UI + audio, loop, saving, window.toy
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
js/ui/hud.js               factory badge (3-star goal bar) + coin pill (rolling counter) + income chip + gear + FPS meter
js/ui/marks.js             (addition) DOM stickers at station anchors: level badge, upgrade arrow, Open sign, Soon sticker
js/ui/card.js              station card (bottom panel with ribbon, milestone stars, one big button, hold to repeat)
js/ui/goals.js             next-goal pill (collect / open panel) + Goals panel
js/ui/menu.js              bottom menu bar: Upgrades, Goals, Factories (+ notification badges)
js/ui/upgrades.js          Upgrades panel: every station with level, gain and a buy button (hold to repeat)
js/ui/factories.js         Factories panel: map of factories (done / current / locked / coming soon)
js/ui/panel.js             shared ribbon banner, red close button, modal panel shell
js/ui/tutorial.js          3-step pointing hand
js/ui/settings.js          settings panel
js/ui/complete.js          factory complete screen (ribbon, stars, edge confetti)
js/ui/offline.js           "while you were away" panel
js/ui/floats.js            outlined +coins floats, coin flights, star bursts, ribbon toast
js/ui/dom.js               DOM helpers, hold-to-repeat, inline SVG icons with ink outlines (own drawings)
js/scene/*.js              three.js view (scene agent; kit.js = shared helpers, an addition)
js/scene/layout.js         shared layout numbers (both sides import it)
tests/logic/run.mjs        runs tests/logic/*.test.mjs (node, no deps): `node tests/logic/run.mjs`
tests/logic/bot.mjs        attentive-player bot; `node tests/logic/bot.mjs [--lazy] [--factory=2]` prints a timeline
tests/ui/lab-play.cjs      Playwright interaction test of the UI in ui-lab.html
tests/ui/lab-shots.cjs     Playwright screenshots of the UI lab states: `node tests/ui/lab-shots.cjs <outDir>`
tests/e2e/play.cjs         end-to-end play test of index.html (iPhone 13, real taps + fast-forward)
tests/shots.cjs            screenshots of the real game in play order: `node tests/shots.cjs <outDir>`
tests/helpers.cjs          shared Playwright helpers (in-page fast-forward player)
README.md, LICENSES.md     overview / third-party licences
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
openSettings(), openMenu('upgrades'|'goals'|'factories'), tapStation(id), relabel(), destroy() }`

- Builds all DOM inside `root` (full-screen, above the canvas, `pointer-events: none`
  except on controls). Layers: marks, panels (next-goal pill + menu bar, card), floats
  (above everything), top (HUD, toast), overlays (modals, menu panels, tutorial).
- Look (restyle round): casual idle-tycoon style. Ink #2A1E3B outlines (3-4 px), cream
  #FFF4DC panels with ribbon banners and a round red close button, numbers in white Fredoka
  700 with an ink stroke (`.ot`: `-webkit-text-stroke` + `paint-order: stroke fill`), glossy
  3D buttons (`.b3` + `.b3-green|blue|yellow|orange|red|purple`, dark bottom edge that
  compresses on press, `is-ready` = gentle pulse, `is-disabled` = grey). All icons are our
  own inline SVG (`ICONS` in dom.js).
- HUD: factory badge (top left; medal + 3-segment star bar = goals collected; tap: Factories
  panel), coin pill + income chip (top middle), gear (top right).
- Bottom: next-goal pill (first collectable goal, else the first open one; tap collects or
  opens the Goals panel; red dot when something can be collected) above a menu bar with
  Upgrades (list of all stations, buy / hold to repeat / open), Goals (factory progress +
  the 3 visible goals with Collect / Go) and Factories (map: done, current, locked, coming
  soon; "Next factory" when the current one is complete). The pill + bar use about 17 % of
  a 390 x 844 screen (21 % with a 34 px home bar). They slide away while the station card is
  open. Menu panels sit at the bottom; the HUD stays above their dimmed backdrop.
- `scene.setInsets()` gets the HUD bottom and the resting top of the bottom pill + bar (re-checked
  once a second and on resize; only sent when it changes).
- Subscribes to game events itself (floats, coin flights, toasts, sounds, card refresh),
  reads `game.state` every frame with change detection (no layout reads in the frame loop
  except anchors -> transforms).
- If `canvas` is given it listens for `pointerdown` on it: `scene.pick()` -> station: boost it
  and open its card; truck: honk; empty: close the card.
- Calls `scene.setQuality()` when the quality setting changes, reads `scene.stats()` twice a
  second for the FPS meter, `scene.anchor()` every frame for the overlays.
- Unlocks audio on the first pointerdown anywhere.
- main.js forwards game events to the scene: `for (const ev of EVENTS) game.on(ev, p => scene.fx(ev, p))`.
- On a tap on the truck the UI honks and shows a toast "Each toy car sells for N coins"
  (`truck.info`, integrator addition).
- When the tutorial points at a button in the card, its bubble sits above the card so it
  never covers the card's numbers (integrator addition).

## Integration (index.html, js/main.js)

`index.html`: viewport with `viewport-fit=cover`, preloads the two main Fredoka weights,
`css/app.css`, the import map (`"three"` -> `./vendor/three/build/three.module.min.js`,
`"three/addons/"` -> `./vendor/three/addons/`), `<canvas id="scene">`, `<div id="ui">`, a
text-free loading screen (`#loader`, three hopping toy blocks, removed after the first
frame) and `#fatal` (only used when WebGL cannot start). All paths are relative.

`js/main.js`:

- Save: `localStorage['toyfactory.save.v1']`, every access in try/catch. Saved every 4 s,
  at once on `open`, `factoryComplete`, `factoryStart` and `setting`, and on
  `visibilitychange` (hidden) and `pagehide` (no `beforeunload`: it can block the
  back/forward cache).
- `createGame({ save, lang })`: `lang` only from `?lang=en|tr` (new games); otherwise the
  phone language. A broken save starts a new game.
- `createScene(canvas, { quality, factory: game.config(), autoQuality, onAutoQuality })`.
  Auto quality is on only while the saved quality is High (and not with `?autoq=0`);
  when the scene drops itself to Low, main.js stores it with
  `game.act({ type: 'setting', key: 'quality', value: 'low' })`. If the player picks a
  quality by hand, auto quality is switched off for the rest of the session.
  If WebGL cannot start, a small DOM stand-in scene keeps the UI working and `#fatal`
  shows `error.webgl` (it does not block taps).
- `createUI({ root: #ui, game, scene, audio: createAudio(), canvas })`. The UI handles taps
  on the canvas (pick -> boost + card; truck -> honk + info; empty -> close card), the
  settings (live language switch via `relabel`, quality -> `scene.setQuality`, sound, FPS
  meter from `scene.stats()`), the offline card on start, the tutorial and all feedback.
- Every game event in `EVENTS` is forwarded to `scene.fx(ev, payload)`;
  `factoryStart` also calls `scene.setFactory(game.config())`.
- Frame loop (requestAnimationFrame): `game.tick(dt)`, `scene.update(game.state, dt)`,
  `ui.update(dt)`. A pause of 0.25-60 s (hitch, short app switch) is caught up by extra
  game ticks (1 s each); longer gaps become offline earnings inside `game.tick` (wall clock).
- URL options (development and tests): `?manual=1` (no loop; time only moves through
  `toy.step`), `?autoq=0` (no automatic Low), `?lang=en|tr` (new game language),
  `?reset=1` (delete the save).
- Test hook: `window.toy = { game, scene, ui, audio, step(dt, h = 1/30, render = true),
  save(), saveKey, manual, ready }`. `step` advances game, scene (without drawing) and UI
  in sub-steps of `h` seconds, then draws one frame. `ready` turns true after the first frame.

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

Playwright and Chromium must be installed (`require('playwright')`); every script starts
its own `tools/serve.mjs` on `PORT` and stops it at the end. Headless WebGL is slow
(SwiftShader), so the scripts move game time with `window.toy.step()` instead of waiting.

- `node tests/logic/run.mjs` - logic, pacing, softlock, save/load, offline cap, i18n (38 tests, ~1 s).
- `node tests/logic/bot.mjs [--lazy] [--factory=2]` - pacing timeline of the attentive (or careless) bot.
- `timeout 600 node tests/e2e/play.cjs` - the real game (PORT, default 5303), iPhone 13:
  fresh start, tutorial with real taps (tap the Saw, Upgrade, Open sign + Open button,
  Collect), truck info, Gift Wrap opened with real taps, all goals by fast-forward
  (in-page player from `tests/helpers.cjs`), Factory complete, Next factory (Teddy Bears),
  reload keeps progress, offline card after 90 min away, Türkçe and back, quality/sound/FPS
  settings survive a reload, draw-call/triangle budgets, no console errors (~1 min).
- `timeout 600 node tests/shots.cjs <outDir>` - 9 screenshots of the real game in play
  order at 390x844, DPR 2 (01-start-tutorial ... 09-offline-card) + `stats.json` with draw
  calls and triangles per shot and at Low (~1 min).
- `timeout 600 node tests/ui/lab-play.cjs` - UI interaction checks in the UI lab (PORT, default 5301): card,
  upgrade, hold to repeat, goal pill collect, Open sign, Upgrades list, Goals panel, Factories panel,
  settings, offline, complete -> next factory, 44 px touch targets, bottom UI <= 22 %, safe areas.
- `timeout 600 node tests/ui/lab-shots.cjs <outDir>` - UI lab screenshots at 390x844 and 390x664, 1x.
- `timeout 900 node tests/scene/lab-smoke.cjs` / `lab-shots.cjs <outDir>` - scene lab (PORT, default 5302).
- UI lab presets: `ui-lab.html?state=fresh|card|poor|locked|goals|collect|tut1|milestone|sales|upgrades|goalspanel|factories|teddyfac|complete|teddy|late|offline|settings&lang=en|tr&paused=1`;
  `window.toy = { game, ui, scene, step(dt), buy(station, n), applyPreset(name) }`.

## Scene (js/scene)

Owner: scene agent. A pure view: it reads the game state every frame and plays effects on
`fx()`. No text is drawn in 3D (badges, prices and coin numbers are DOM, see above).

Files: `scene.js` (createScene, events, pick, anchors), `layout.js` (shared numbers),
`camera.js` (orthographic 3/4 iso camera, yaw 45 deg, pitch 34 deg, fit-to-insets),
`factory.js` (themes, floor/walls/windows/posters/bunting/props, belt with scrolling
texture, chute, dock, truck with its driver, forklift), `stations.js` (8 machine builders,
locked plots, turntables, progress screens, milestone trims, glows), `workers.js` (chibi
operators and carriers, instanced), `items.js` (toy stages and the item flow), `fx.js`
(instanced particles), `quality.js` (presets, FPS, auto drop), `kit.js` (addition: primitive
cache, part builder that merges coloured primitives into one geometry with a baked outline
hull, the toon shader, palette, canvas textures).

Look (restyle round, the genre's chunky casual style, all our own shapes): one custom toon
`ShaderMaterial` for everything 3D (`kit.js` `toyMaterial`, shared `TOON` uniforms):
3-step cel shading from one warm key direction (lit = warm white, mid, shade = cool purple),
no scene lights. Ink outlines (#2A1E3B) are an inverted hull baked into the same geometry
(`ol` vertex attribute > 0: the vertex shader pushes it out in view space, constant ~2.2 CSS
px, scaled down with tiny instance scales), so outlines cost triangles but no draw calls;
`Builder.add(..., { ol: 0 })` skips tiny details, `{ fill: false }` draws only an outline.
Palette from the style spec (`PAL` in kit.js). Wood factory: honey plank floor, sky-blue walls
with a blue wainscot, yellow top beam, windows with flower boxes, bunting, posters; teddy:
pink checker tiles, lilac walls, berry beam. Machines: dark striped plinth, chunky rounded
body, control panel, round emblem, big animated parts. Workers: big heads (about as big as
the body), eyes with sparkles, brows, cheeks, open smile, hard hat / cap; feet and arms are
separate instanced meshes so walks and work moves bounce.

Life: one operator per open station; 3 carriers (`workers.js`) carry finished toys from the
last open station to the right side of the truck (visual only). On `sold` the scene first
offers the toy to the carrier waiting at that station's pickup spot (`workers.takeSold` ->
`items.takeWork`); he stacks up to 3, walks a fixed route (hopping over belts), throws them
into the bed (`items.hopFrom` -> truck load), walks back and queues again. If no carrier is
waiting, the toy rides the belt to the dock as before. When the last station is Gift Wrap /
Ribbon Box (short walk) one carrier takes a break at the water cooler. A forklift (decor,
hidden on Low) shuttles a pallet from a stack to the front of the truck; the truck driver sits
in the open cab. `debug.workers.stats()` -> `{ taken, delivered, states, held }`.

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
- `fx(event, payload)`: `pass` {from,to} launches an item along the belt to the next tray;
  `sold` hands the toy to a waiting carrier or launches it along the belt into the truck, and
  bursts outlined coins from the truck; without them items still appear in the trays but do
  not travel. `cycle` (small puff + squash), `upgrade` {station, milestone} (the machine
  squashes, jumps and wobbles, outlined star burst, floor ring, dust puffs; bigger with
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
Integrator addition: after the fit, `resize()` projects the anchors of the top two
stations and grows the top inset until a 42 px DOM badge above each anchor clears the HUD
(on short screens such as a phone browser with toolbars the badge used to cover the income
pill); the 0.5 s size check re-runs this when a machine grows or opens.

Budgets (Playwright/SwiftShader, outlines included): 34-50 draw calls, 55k-92k triangles at
High (fresh start ~59k, all open ~76-84k, busy line with coins ~83k, factory complete
confetti ~92k), 31-43 calls / 54k-70k at Low; ~0.1-0.2 ms of JS per frame. No shadow maps
(blob shadows), no post-processing, no scene lights (lighting is in the toon shader), merged
static geometry, instanced workers/items/particles/turntables, no per-frame allocations.

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

