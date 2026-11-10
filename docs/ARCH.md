# Heroes' Diner (Kahramanlar Lokantası): architecture

An original idle restaurant tycoon for phones (Eatventure-style genre mechanics only): one
restaurant on screen, fantasy adventurers walk in, sit, order, cooks cook and serve, guests eat,
pay and leave; the player upgrades stations, opens new dishes, buys tables, hires cooks,
completes goals and moves on to the next place.

Plain static HTML/CSS/JS ES modules, no build step, no network fetches at run time except our
own files with relative paths, so it works from a sub-path and inside a sandboxed iframe
(storage is always guarded: `js/game/storage.js`). Art: KayKit CC0 packs by Kay Lousberg
(`assets/LICENSE-KayKit.txt`). Font: Fredoka (OFL, vendored).

Work split: the core builder owns `js/game/*` (except `layout.js`), `js/i18n/*`, `js/ui/*`,
`css/*`, `js/audio.js`, `ui-lab.html`, `tests/logic/*`, `tests/ui/*`. The scene builder owns
`js/scene/*`, `js/game/layout.js`, `assets/*`, `tools/assets/*`, `scene-lab.html`,
`tests/scene/*`. The integration owns `index.html`, `js/main.js`, `tools/serve.mjs`,
`tools/build-preview.mjs`, `tests/helpers.cjs`, `tests/e2e/*`, `tests/shots.cjs`,
`tests/preview.cjs` (see "Integration").

## Run

```
PORT=5403 node tools/serve.mjs      # then open http://localhost:5403/  (the game)
                                    # dev pages: /ui-lab.html (UI on a flat stand-in scene),
                                    # /scene-lab.html (3D scene on a fake restaurant),
                                    # /tests/scene/game-lab.html (real logic on the real scene, no UI)
node tools/build-preview.mjs out/preview   # self-contained copy with the models as base64 JS
```

## File layout (core side)

```
js/game/config.js     RULES, LOCATIONS (inn, harbor), DISHES, CUSTOMER_CHARS: pure data, the economy
js/game/layout.js     shared world layout + walk graph (scene builder; schema below)
js/game/state.js      fresh state, load/validate/restore service, serialise
js/game/sim.js        economy maths: price, costs, cook time, milestones, income estimate
js/game/world.js      the service simulation: spawn, seat, order, dispatch cooks, serve, pay, leave
js/game/goals.js      goal progress / completion
js/game/index.js      createGame(), EVENTS, select helpers
js/game/storage.js    guarded localStorage (key 'heroesdiner.save.v1')
js/game/format.js     number / time formatting per language
js/game/i18n.js       dictionaries, detectLang(), t(), LANG_NAMES
js/i18n/en.js, tr.js  flat key -> string, {name} placeholders, identical keys
js/audio.js           procedural Web Audio sounds (no files)
js/ui/*.js            DOM UI (see "UI")
css/app.css           all UI styles + Fredoka @font-face
ui-lab.html           UI lab: real game + UI on a flat diagonal drawing of layout.js (like the camera)
tests/logic/*         node tests (no deps): node tests/logic/run.mjs
tests/ui/*            Playwright: lab-play.cjs (interactions), lab-shots.cjs (screenshots)
```

## Shared contract

### Layout (`js/game/layout.js`)

World units at KayKit native scale (a counter tile 2 x 2, a small round table 1.5 wide,
characters ~2.4 tall). x and z on the floor, y up. Floor points `[x, z]`, points with height
`[x, y, z]`, `facing` = rotation about y (0 = toward +z, PI/2 = toward +x). The camera looks at
the room diagonally from its open front corner (+x, +z): the x = z diagonal is the vertical
axis of the screen (kitchen corner at the top, door corner at the bottom); facing PI/4 looks
straight at the camera.
`LAYOUTS[id]` / `getLayout(id)`:
`{ id, bounds, door { pos, node: 'door', outside: 'out' }, queue, tables [{ id: 't1'..'t6', pos,
front: 't<n>f', seats [{ id: 't<n>a|b' (= graph node), pos, facing, plate [x,y,z], chair }] }],
stations [{ id, pos, facing, cookSpot, node: 'st_<id>', dishSpot, helperSpot, helperNode: 'sh_<id>',
helperDishSpot }] (helper* = a second cook working at the station, 1 unit further along the wall),
cookHomes ['h1'..'h4'],
kitchen { shape: 'L', minZ, maxZ, depth, reach, lane, counter, pass: [], open }, obstacles [{ kind,
x0, x1, z0, z1 }], iso: true, swapped (Harbor Tavern), graph { nodes, edges }, speeds { customer,
cook }, path(from, to), pathLength(from, to), pointAt(from, to, s, out) }`. Station order = config
order = unlock order.

Plan (`buildIso()` in `layout.js`, both places, 14 x 14 room, bounds -7..7):
- Kitchen = an L in the far corner. The station counters stand 2.2 from the back walls (Juice
  Bar and Stew Pot on the back-left wall x = -7, Grill and Oven on the back-right wall z = -7,
  so the unlock order alternates sides); the cooks work in a lane 0.75 from the wall, behind
  their counter, facing the room. The two lanes meet in the cooks' corner (homes h1..h4) and
  come out past the end of each counter row (nodes EL / ER -> XL / XR) into the dining room.
- Tables: both seats on the far side of the table (seat a on the -x side facing +x, seat b on
  the -z side facing +z), so every seated guest faces the camera at 3/4; the cook hands the
  dish over at the table's front corner (`t<n>f`). Six tables in a 3-2-1 pyramid pointing at the
  door: t4 t3 t5 by the kitchen, t1 t2 in the middle (owned at the start), t6 by the door. Shared
  hub nodes between neighbouring tables (H12, H34, H35) keep the graph small.
- Door = the open front corner (6.25, 6.25), outside node at (9.4, 9.4), queue spots outside.
- Harbor Tavern = the same plan mirrored across x = z (`swap: true`, `swapXZ()`): the kitchen
  sides, the sink and the windows swap on screen and every walk keeps its length (same pacing).
- Speeds: customer 2.8, cook 3.9 units/s (walks average a little longer than in the old
  12 x 20 plan; pacing re-checked with the bot and the e2e run).

Timing rule: the logic times every walk as `pathLength(from, to) / speed` and stores
`{ from, to, t, dur }`; the scene places the walker at `t / dur` along `path(from, to)`.
The real speed (`pathLength / dur`) includes the Cook speed upgrade (cooks up to x2.35), so the
scene derives animation playback from it. If the layout distances change a lot, re-run
`node tests/logic/run.mjs` (pacing uses real walk times).

### Game state (logic owns it, the scene and the UI only read it)

```
state.v 1, state.location 'inn'|'harbor', state.locationIndex 0|1
state.money, lifetimeMoney, earned (this place), served, complete, cookSpeed (1..10), playTime
state.stations   [{ id, open, level, boostT }]
state.tables     [{ id: 't1'..'t6', owned }]          bought in order, t1 + t2 owned at the start
state.customers  [{ id: 'g12', look: { char: 'Knight'|'Mage'|'Rogue_Hooded', tint: 0..3 },
                    state, seat: 't3a', table: 't3', dish, station, from, to, t, dur }]
   'enter'   out -> door (walk)            'toSeat'  door -> seat node (walk)
   'waiting' seated and ordered (dish/station set), until served (t counts up, dur 0)
   'eating'  2.6 s     'paying' 1.1 s ('pay' at its start)     'leaving' seat -> out (walk)
   Removed when the leaving walk ends. <= 12 seated, a few more leaving (<= ~16 on screen).
   A fresh place opens with one guest already 'waiting' at t1a.
state.cooks      [{ id: 'c1'..'c4', state, station, slot 0|1, order: { id, customer, station, dish } | null,
                    from, to, t, dur, home }]
   'idle' (home) -> 'toStation' (walk to st_<id>, or sh_<id> for slot 1) -> 'cooking' (dur = cook time, t runs x2 while
   the station's boostT > 0) -> 'toTable' (walk to the table front, carrying order.dish) ->
   'serving' (0.45 s; the guest starts eating) -> next order ('toStation') or 'return' (walk home).
   Up to two cooks per station at a time (RULES.stationSlots): slot 0 at the main spot st_<id>,
   slot 1 at the helper spot sh_<id>; `station` is set from assignment until the dish is cooked
   (null afterwards), `slot` only counts while 'toStation' / 'cooking'. The scene shows the
   helper's dish on helperDishSpot.
state.orders     [{ id, customer, station, dish }]  waiting for a cook (FIFO; each takes the
                 nearest free cook if its station has a free spot)
state.goals [{ id, done, claimed }], settings { lang, sound, quality, fps },
tutorial 0|1|2|'done', lastSeen, offline null|{ seconds, amount }, rng, seq, spawnT
```

### Events (`game.on(ev, fn) -> unsubscribe`, all listed in `EVENTS`)

Contract: `arrive {customer}`, `order {customer, dish, station}`, `cookStart {cook, station,
customer, dish}`, `serve {customer, dish, cook}`, `pay {customer, value, dish, station}`,
`leave {customer}` (stands up and walks out), `upgrade {station, level, milestone}`,
`open {station}`, `buyTable {table}`, `hire {cook}`, `goal {id}`, `locationComplete {id}`,
`locationStart {id}`. Additions: `cookDone {cook, station, customer, dish}` (dish leaves the
station), `boost {station}`, `cookSpeed {level}`, `claim {id, reward}`, `money {value, delta}`
(once per tick), `offline {seconds, amount}`, `setting {key, value}`, `tutorial {step}`.

### Scene API (`js/scene/scene.js`, used by the UI and main.js)

`createScene(canvas, { quality }) -> Promise<{ setLocation(id), update(state, dt), fx(event,
payload), pick(x, y) -> { type: 'station'|'table'|'customer'|'cook', id } | null,
anchor(kind, id) -> { x, y, visible } (CSS px; kinds station, table, customer, cook, coins),
setQuality(q), stats() -> { fps, calls, tris }, resize() }>`; optional `setInsets({ top, bottom,
left, right })` (the UI calls it with the HUD bottom and the bottom bar top). Anchors used by the
UI: `station` = above an open station (level badge) and just above a closed plot (Open sign);
`customer` = above the head (order bubble, "+coins" float). Asset loading: `js/scene/assets.js`
`loadModel(name)` (or `window.__EMBED[name]` base64).

## Game API (`js/game/index.js`)

`createGame({ save, now = Date.now, lang, seed })`: `save` = string/object from `game.save()`
(broken, foreign or tampered saves are clamped or ignored; inconsistent guests/cooks just restart
the service, money and progress are kept); `now` = clock (tests pass a fake one); `lang` for a
new game (default: phone language, English otherwise).

- `game.state` (above), `game.config()` (current location config), `game.layout()`.
- `game.tick(dt)`: sub-steps of 0.05 s, dt clamped to 1 s. A wall-clock jump > 60 s since the
  last tick (hidden tab) becomes offline earnings.
- `game.act(action) -> { ok, reason }`:
  `upgrade {station}` (unknown, locked, max, money) · `open {station}` (unknown, open, order,
  money) · `boost {station}` (unknown, locked, max) · `buyTable` (max, money) · `hire` (max,
  money) · `cookSpeed` (max, money) · `claimGoal {id}` (unknown, notDone, claimed) ·
  `nextLocation` (notComplete, last) · `claimOffline` (none) · `setting {key, value}` keys lang,
  sound, quality, fps (invalid) · `tutorial {step}` (invalid). `station` = id or index.
- `game.save() -> string` (refreshes lastSeen). `game.checkAway()`.
- `game.select`: `incomePerSec()` (steady estimate), `stationView(id)` { id, index, nameKey, dish,
  dishKey, kind, open, level, price, nextPrice, gain, time, nextTime, cost, openCost, canAfford,
  missing, canOpen, locked, milestone { prev, next, ratio, reached }, nextIsMilestone, boostT, max },
  `tableView()`, `cookView()`, `cookSpeedView()`, `goalViews()` (3 visible: { id, type, textKey,
  params { n, stationKey }, cur, target, progress, done, claimed, reward, station }), `canAfford(x)`,
  `hints()` ({ [stationId|'table'|'cook'|'cookSpeed']: 'best'|'good' }), `orderView(customerId)`
  ({ dish, phase 'waiting'|'cooking'|'coming', progress }), `location()` ({ id, index, nameKey,
  isLast, complete, served, goalsDone, goalsTotal, stars 0..3 }), `locations()`, `offline()`.
- `js/game/storage.js`: `createStorage(key = 'heroesdiner.save.v1')` -> `{ load(), save(str),
  clear() }`, every access in try/catch (sandboxed iframes simply do not save).

## Economy and pacing (v0)

- Price per dish: `basePrice * (1 + 0.35 (L-1)) * 1.02^(L-1)`; upgrade cost `baseCost * 1.15^(L-1)`.
- Cook time halves at levels 10, 25, 50, 100 (milestone = speed x2 + a station visual upgrade).
  Tap boost: x2 cooking speed at that station, +1.5 s per tap, max 5 s.
- Orders: the newest open station weighs 3, the others 1, and every guest already waiting for a
  station divides its weight by (1 + 0.7 per waiting guest) (`RULES.queuePenalty`), so orders
  spread over the kitchen instead of piling up at the newest station (varied order bubbles, no
  idle cooks next to a queue). Two cooks can work at one station. Customers arrive after
  `max(0.7, 2.4 / free seats)` s; no failure states.
- Village Inn: juice (price 7, cook 2 s, open free), grill (30, 3 s, open 100), stew (300, 4 s,
  open 1.4K), oven (3K, 5 s, open 20K); tables 3-6 cost 80 / 300 / 1.5K / 6K; cooks 2-4 cost
  30 / 500 / 6K; cook speed (+15 % per level, 10 levels) 200 x 2.4^(L-1). 18 goals (stars =
  thirds), ordered so the 3 visible goals never name the same station twice; the last stretch:
  serve 100, open the Oven, 4 cooks, Stew Pot level 28, Oven level 10. Harbor Tavern =
  everything x10 with its own dishes (cocoa, veggie burger, soup, roast).
- Income estimate (HUD, offline, hints) = soft minimum of the cook-, station- (x2 spots) and
  seat-limited order rates x average price; the order mix is solved with a few fixed-point
  steps (waiting guests per station from Little's law, then the queue penalty); within ~10 % of
  the simulation (tests/logic/estimate.test.mjs).
- Offline: estimate x min(away, 2 h), only if away >= 60 s, collected on return.
- Measured by `node tests/logic/bot.mjs` (attentive player, seeds 3/7/11/19, diagonal 14 x 14
  plan): first upgrade 0 s, first coins 9 s, 2nd cook ~0:30, Grill 0:50-0:51, Stew 2:54-3:10,
  Oven 5:49-6:30, Village Inn complete 10:56-11:36, longest gap between reward moments
  22-27 s (e2e run: Grill 0:36, Stew 3:09, Oven 5:58, complete 11:39). Guests wait ~10 s for
  food (p90 ~11 s, max ~30 s), waiting guests all showing the same dish (3 or more waiting)
  ~6 % of the time after minute 2 (was 26 %), a cook idle while an order waits ~1 % (was 21 %)
  (these three measured on the earlier 12 x 20 plan; the walks are similar).
  Careless bot (cheapest buys, late goals, no boosts): complete in ~19 min (no softlock).
  Harbor Tavern: ~11-12 min.
- Tutorial: 0 "Tap the Juice Bar" (the UI moves to 1 when its card opens), 1 "Upgrade" (an
  upgrade moves to 2), 2 "Open the Grill" (shown once affordable; opening ends it).

## UI (`js/ui`)

`createUI({ root, game, scene, audio, canvas }) -> { update(dt), openCard(id), closeCard(),
openSettings(), openMenu('upgrades'|'goals'|'places'), tapStation(id), relabel(), setScene(s),
debug, destroy() }`. Builds all DOM in `root`; layers: marks, bubbles, panels (bottom bar, card),
top (HUD), overlays (sheets, modals, tutorial), floats. Reads `game.state` every frame with change
detection; the only per-frame layout writes are transforms at scene anchors.

- Style: restrained casual-game look matching KayKit's soft, bright models. Tokens in `:root`:
  text `--ink #4A3426`, cream panels `--panel #FFF9F0` / `--panel-2 #F7EDDE`, hairline
  `--line #EADBC4`, ONE accent for primary buttons and progress `--accent #FF8F2E`, gold for
  currency `--gold #FFC23A`, disabled `--off`; radii 10 / 14 / 22 px; soft shadows; borders 2 px
  at most; Fredoka 600/700. Icons: own flat SVGs in `dom.js` (dishes, coin, stars, menu icons,
  chef hat, table, boot, places, hand). No ribbons, rays or heavy outlines.
- HUD: location badge (name + 3 goal stars, opens Places), coin pill (rolling counter) with the
  income per second under it, gear; optional FPS meter (`scene.stats()`).
- Station marks at `anchor('station', id)`: small level pill (level + thin bar to the next speed
  milestone + an orange arrow when an upgrade is worth buying, bouncing for the best one); next
  station: a price chip that becomes a compact orange "+ coin price" button when affordable
  (tap: station card; the word Open is on the card); later plots: a tiny lock.
- Next table (`.tmark` at `anchor('table', next)`): the same orange "+ coin price" chip, only
  while it is affordable and no card / sheet is open; tap = buy.
- Order bubbles at `anchor('customer', id)` for waiting guests: 32 px dish icon, progress ring
  while a cook prepares it (the bubble shrinks a little once a cook has the order), a little
  bounce while it is carried; "+coins" float (gold on a small brown pill, a bit bigger for the
  newest dish) + a coin flight to the HUD on `pay` (hidden while a panel/modal is open).
- Station card (bottom sheet): dish tile, name, level, "Price per dish 7 -> 10", cooking time,
  milestone bar, one big Upgrade button (hold to repeat, speeds up) or Open (new dish).
  Tapping a station also boosts it. The bottom bar slides away while the card is open.
- Bottom (about 16 % of a 390 x 844 screen): next-goal pill (tap: Collect or open Goals) + menu
  bar Upgrades / Goals / Places with small count badges.
- Upgrades sheet: Kitchen (4 stations: upgrade / open / locked note) + Restaurant (Hire a cook
  n/4, Buy a table n/6, Cook speed); buttons repeat while held. Goals sheet: progress bar with
  stars, 3 goals with Collect / Go (Go points at the station or opens Upgrades). Places sheet:
  Village Inn, Harbor Tavern, 2 x coming soon; "Go" when the current place is complete.
- Modals: Restaurant complete (stars, guests served, Next place / Keep playing), Welcome back
  (offline earnings, Collect), Settings (language, sound, graphics, FPS, credits).
- Tutorial: pointing hand + ring + short bubble (text-wrap: balance); for an open station the
  ring pulses on the station's cook and counter (the open-station anchor sits above the cook's
  head), the hand points up at it from the counter front and the bubble waits below it, over
  the dining room; bubbles for card buttons sit above the card.
- Toasts (opened, new cook, new table, milestone, goal done) sit just above the bottom UI, under
  the HUD while a tutorial bubble is shown, and as a slim banner at the very top while a menu
  sheet is open (they follow when a card or sheet opens or closes), so they never cover the
  stations, a tutorial bubble or a sheet row.
- Canvas taps: `scene.pick()` -> station (boost + card), table (info; an unowned table is bought
  at once when it is the next one and affordable, otherwise Upgrades opens), customer (his
  order), cook (info), nothing (closes the card).

## Integration (`index.html`, `js/main.js`)

`index.html`: viewport (`viewport-fit=cover`), theme colour, Fredoka 600/700 preload,
`css/app.css`, the import map (`three` -> `vendor/three/build/three.module.min.js`,
`three/addons/` -> `vendor/three/addons/`, which holds only GLTFLoader, SkeletonUtils and
BufferGeometryUtils from three@0.187.0), `<canvas id="scene" class="scene">`, `<div id="ui">`,
a loading screen (`#loader`: the inn icon, the game title in the player's language, a thin
orange progress bar) and `#fatal` (shown only when WebGL cannot start).

`js/main.js` (a module with top-level await), in order:

1. URL options: `?manual=1` (no frame loop, a virtual clock: time moves only through
   `window.diner.step()`, so slow test machines never look like the player was away),
   `?autoq=0` (never drop to Low by itself), `?lang=en|tr` (language of a NEW game),
   `?reset=1` (delete the save).
2. `createStorage()` (guarded `localStorage`, key `heroesdiner.save.v1`) and
   `createGame({ save, now, lang })`; a broken save falls back to a new game. The game's own
   load runs `checkAway()`, so offline earnings (>= 60 s away, capped at 2 h) are ready for
   the UI's Welcome back card on the first frame.
3. Loader title + `document.title` / `<html lang>` from i18n (`app.title`).
4. `await import('./scene/scene.js')` then `await createScene(canvas, { quality, location,
   autoQuality, onAutoQuality, onProgress })`. The bar shows 12 % (code), 22 % (three.js),
   then one step per loaded model. `autoQuality` is on only while the saved quality is High
   (and not `?autoq=0`); `onAutoQuality('low')` stores the setting with
   `game.act({ type: 'setting', key: 'quality', value: 'low' })`, so the next start is Low.
   A quality the player picks by hand turns the automatic drop off for the session. If the
   scene cannot start (no WebGL), a small fallback scene (screen positions from
   `js/scene/layout.js SCREEN`, measured on the diagonal camera) keeps the UI usable and
   `#fatal` says "This device could not start the 3D view".
5. `createUI({ root: #ui, game, scene, audio: createAudio(), canvas })`. The UI handles canvas
   taps itself (`scene.pick`): station -> boost + card, guest -> "<dish>, please" toast, cook ->
   info, faded table -> bought at once when it is the next table and affordable (otherwise the
   Upgrades sheet opens), empty floor -> closes the card.
6. Every game event is forwarded to `scene.fx(ev, payload)` (the UI and sounds subscribe to
   the game themselves); `scene.fx('locationStart')` switches the restaurant (and
   `scene.update` would also switch when `state.location` changes).
7. Saving: every 4 s of play, on `open`, `buyTable`, `hire`, `claim`, `setting`,
   `locationComplete`, `locationStart`, on `visibilitychange` (hidden) and `pagehide`.
   Storage errors are swallowed (a sandboxed iframe simply does not save).
8. Frame loop (`requestAnimationFrame`): `game.tick(dt)`, `scene.update(state, dt)`,
   `ui.update(dt)`. A gap of 0.25-60 s (hitch, short tab switch) is caught up with 1 s game
   ticks so the restaurant keeps working; a longer gap becomes offline earnings inside
   `game.tick` (wall-clock check). The loader fades out after the first drawn frame.
9. Test hook: `window.diner = { game, scene, ui, audio, storage, step(dt, h = 1/30,
   render = true), save(), manual, ready }`. `step` advances game, scene and UI in sub-steps of
   `h` without drawing, then draws once; `ready` turns true after the first frame.

Changes to the contract made while integrating:

- `js/scene/assets.js` loads models with `fetch` + `arrayBuffer` + `GLTFLoader.parse`
  (not `GLTFLoader.load`, whose progress-stream wrapper made Chromium report finished
  downloads as aborted). `window.__EMBED[name]` (base64) still wins when present.
- Tapping a faded (unbought) table buys it when it is the next one and affordable.
- Toasts follow the bottom UI each frame and move under the HUD while a menu sheet is open
  (a goal finished just before opening Goals no longer covers a row).
- `tools/serve.mjs` takes `SERVE_ROOT` to serve another folder (the preview).

### Preview build (`tools/build-preview.mjs`)

`node tools/build-preview.mjs [outDir]` (default `out/preview`, git-ignored) writes a copy for
a preview host that only serves html, js, css, json, png, jpg, svg, woff2, txt and md files:
index.html, css, the fonts css/app.css uses, the JS import graph of `js/main.js` (static and
dynamic imports, resolved through the import map; labs and tests are not copied), the
licences (`vendor/three/LICENSE` -> `LICENSE.txt`), README.md and LICENSES.md. Every
`assets/models/*.glb` becomes `js/embed/<name>.js`
(`(window.__EMBED || (window.__EMBED = {}))[name] = '<base64>'`), loaded by `<script type="module">` tags
placed before main.js (module scripts run in document order). The script refuses any other
file type. Size: about 4.6 MB (67 files). `tests/preview.cjs` checks it on
`python3 -m http.server` from a sub-path with every .glb request blocked.

### Download size and scene cost (measured)

Everything index.html loads (MiB): models 2.56 (props 1.42, four heroes 0.22-0.27 each,
animations 0.17), three.js + 3 addons 0.88, game/UI/scene code 0.26, fonts 0.05, html/css 0.03:
about 3.8 MiB (3.9 MB) in total, about 1.5 MiB with gzip.

Real game on SwiftShader (iPhone 13 viewport, High, pixel ratio 2), diagonal camera:
start 26 draw calls / 50k triangles; busy Village Inn (all stations, 5-6 tables, 11-13
guests + 4 cooks) 41-45 calls / 107-115k triangles, busiest frame sampled over a whole Village
Inn run 49 calls / 127k; busy Harbor Tavern 41-48 calls / 104-121k; Low (pixel ratio 1.25)
harbor 43 / 93k. Budget: 120 calls / 150k triangles.

## Audio (`js/audio.js`)

`createAudio() -> { unlock(), play(name), setEnabled(bool), enabled(), sounds }`, synthesised:
tap, boost, nope, upgrade, milestone, coin, claim, open, goal, complete, serve, swish. The
context starts on the first gesture; rate limits keep stacked events quiet.

## Languages

English default; Turkish when the phone language starts with `tr`. Every string is in
`js/i18n/<lang>.js` (same keys, same placeholders), including number suffixes, separators and
time units (`num.*`, `time.*`). Station names in sentences use `station.<id>.acc` ("the Grill" /
"Izgarayı"). No emoji, no "!" in Turkish, numbers always with a unit or the coin icon.

## Tests

Real game (integration), each starts its own server on PORT (default 5403):

- `timeout 600 node tests/e2e/play.cjs` (~50 s): iPhone 13; real frame loop and loading
  screen; tutorial with real taps (Juice Bar in the 3D view, Upgrade, Open sign -> Open the
  Grill); floor tap closes the card; guest tap shows the order; hire a cook in Upgrades; tap a
  faded table to buy it; attentive fast-forward player (`tests/helpers.cjs`, same decisions as
  `tests/logic/bot.mjs`) until every goal is collected, with pacing checks (Village Inn 7-15
  min, Stew 2-5 min, Oven 4-8 min, reward gaps <= 30 s) and the busiest frame within budget;
  Restaurant complete -> Harbor Tavern (scene, HUD, Cocoa Stand card); reload keeps
  progress; 3 h away -> Welcome back capped at 2 h; Türkçe and back (titles, HUD, no "!"),
  Low / High (pixel ratio), sound, FPS meter, settings survive a reload; automatic Low is
  stored; sandboxed iframe (no storage) runs; no console errors or failed requests. Before each
  `page.reload()` it reads one pixel back (`drainGpu`): SwiftShader queues the frames drawn
  during a fast-forward and the reload's 30 s navigation timeout would otherwise count them.
- `timeout 600 node tests/shots.cjs <outDir> [bestDir]`: 01-start-tutorial, 02-station-card,
  03-busy-inn, 04-upgrades-panel, 05-goals, 06-location-complete, 07-harbor-tavern,
  08-settings-tr at DPR 2 plus `@1x` copies, `stats.json`; bestDir gets 4 owner-facing shots.
- `node tools/build-preview.mjs out/preview && timeout 300 node tests/preview.cjs out/preview`.

Parts:


- `node tests/logic/run.mjs` (~2 s): i18n parity/placeholders/emoji/"!"/leftovers/key use,
  pacing (4 seeds), softlock (careless bot, Harbor Tavern, never buying), save roundtrip and
  determinism, broken/tampered saves, guarded storage, offline (rate, 2 h cap, < 60 s, hidden tab),
  action validation, income estimate vs simulation, world contract (state order, walk durations,
  at most two cooks per station on separate spots and a helper really helps, one guest per
  seat, waits, events, newest dish, boost).
- `node tests/logic/bot.mjs [--lazy] [--location=2] [--seed=N]`: pacing timeline.
- `timeout 600 node tests/ui/lab-play.cjs` (PORT 5402): HUD, tutorial (all 3 steps with real
  taps), card (upgrade, hold, not enough coins, close), bubbles + pay floats, goal pill, Open
  sign, Upgrades (all rows, hold), Goals (collect, Go), Places, Restaurant complete -> Harbor
  Tavern, offline card, settings (language live switch, sound, quality, FPS), touch targets,
  bottom UI <= 20 %, safe areas, Turkish screen, no console errors.
- `timeout 600 node tests/ui/lab-shots.cjs <outDir> [en|tr|both] [presets]`: lab screenshots at
  390 x 844 (and 390 x 664), 1x.
- UI lab presets: `ui-lab.html?state=fresh|card|poor|milestone|tut1|open|opencard|busy|collect|
  upgrades|goals|places|complete|placesdone|harbor|offline|settings&lang=en|tr&paused=1`;
  `window.diner = { game, ui, scene, step(dt), buy(station, n), applyPreset(name), ready }`.

## Scene (`js/scene`) - scene builder

A pure view: every frame it reads `game.state` (read-only) and draws it; `fx(event, payload)`
plays effects. No text in 3D (badges, prices, "+coins" are DOM, positioned with `anchor()`).
The room, the furniture and the people are KayKit (CC0, Kay Lousberg): Restaurant Bits for the
room, the Adventurers pack for the people. Drawn from code: tiny particles (coins, sparkles,
confetti, steam), soft shadow / light decals, the view behind the windows, the backdrop
gradient and the outside (plot, path, fence, lanterns, flower beds, trees, bushes, tufts, the
harbour pier and sea): chunky low-poly shapes with vertex colours in the KayKit palette, merged
into one mesh (Restaurant Bits has no outdoor props).

### Files

```
js/scene/scene.js     createScene(): renderer, lights, camera fit, sync with the state, events, pick, anchors, stats
js/scene/assets.js    loadModel(name) / loadModels(names): assets/models/<name>.glb or window.__EMBED[name] (base64)
js/scene/kit.js       prop templates from props.glb, shared Lambert material, recoloured atlas copies, static batcher
js/scene/room.js      static room per location (floors, back walls, cut front walls, kitchen L, decor, contact shadows, window light, outside plot); THEMES, backdropTexture
js/scene/stations.js  stations: merged mesh per visual tier, locked placeholder, pop / bounce, boost glow
js/scene/tables.js    tables + chairs (one mesh each), faded until bought, pop on buy
js/scene/heroes.js    hero templates, tinted textures, pooled instances (one AnimationMixer each), crossfades
js/scene/crowd.js     customers + cooks <-> state entities: walk along the graph, sit, eat, pay, leave; cook, carry, serve
js/scene/dishes.js    instanced dishes / empty plates / blob shadows (filled every frame); DISH map
js/scene/fx.js        pooled particles: coins, sparkles, puffs, confetti, floor rings, steam
js/scene/camera.js    orthographic camera (CAM in scene.js: elevation 35 deg, yaw 45 deg) + fit to the viewport minus UI insets
js/scene/quality.js   High / Low presets, frame-time monitor, automatic drop to Low
js/scene/layout.js    screen-space fallbacks for the UI (UI_INSETS, SCREEN); re-exports getLayout
js/game/layout.js     world layout + walk graph of both locations (schema in "Shared contract")
tools/assets/build.mjs  asset pipeline (below); tools/assets/preview.html contact sheet of the models
scene-lab.html        scene lab: the real scene on a fake restaurant (tests/scene/fakesim.js)
tests/scene/smoke.cjs Playwright smoke test + review screenshots
```

### Assets (`tools/assets/build.mjs`, re-runnable)

`cd tools/assets && npm install && node build.mjs <dir with the two KayKit packs>` writes
`assets/models/*.glb` + `manifest.json` (sizes, model and clip names) and
`assets/LICENSE-KayKit.txt`. Total 2.56 MB:

| file | size | content |
|------|------|---------|
| props.glb | 1.45 MB | ~115 restaurant pieces, one named root node each, ONE material + 256 px atlas, KHR_mesh_quantization (positions 14 bit, normals 8 bit, uv 12 bit). The character-pack mugs are re-mapped onto the restaurant atlas as `mug_juice`, `mug_cocoa` (orange / brown drink, never beer foam) and `mug` (empty). No knives. |
| knight / mage / rogue_hooded / barbarian.glb | 230-280 KB each | ONE skinned mesh per hero: body parts + harmless accessories (helmet, hat (Mage hat scaled 0.7 for readability from above), capes) merged with the rigid parts converted to single-bone skinning; every weapon, shield, book, mug removed; no animations; 256 px texture |
| anims.glb | 171 KB | the shared skeleton (all heroes have identical rigs) + 12 clips: Idle, Unarmed_Idle, Walking_A/B, Running_A, Sit_Chair_Down/Idle/StandUp, Interact, Cheer, PickUp, Use_Item. Channels that never leave the rest pose and the IK helper bones are dropped, keys resampled. |

Textures are sampled without mipmaps (`assets.js`): the atlases are 8 x 4 gradient swatches and
mip levels would bleed neighbouring colours.

### Look

- Camera (`CAM` in `scene.js`): orthographic, 35 deg down, turned 45 deg: it looks at the room
  diagonally from its open front corner, so both back walls show and the floor is a diamond
  (a cosy diorama instead of a floor plan). Fit points (`room.js focus`): the outer table
  seats on the left and right, the top of the far corner and the path below the door, inside
  the viewport minus the UI insets + safe areas (`setInsets()`). In portrait the frame is
  limited by the width, so the room's left and right corners bleed off the screen edges (only
  crates, a menu stand, the sink and the fridge live there; nothing you tap is cut). On a
  390 px wide phone that is ~30 px per unit at both 390 x 844 and 390 x 664 (standing
  characters ~60 px, seated ~50 px); every station, table and the door sit between the HUD and
  the goal pill at both sizes. No pan.
- Light: hemisphere (warm sky / brown ground, 1.65) + one warm directional light (2.7) from the
  camera's right (8, 12, 3.5), so the two back walls get different shading; Lambert materials,
  Neutral tone mapping (exposure 1.06), sRGB output. No shadow maps: soft blob shadows under
  characters and table groups (one instanced mesh) and baked soft contact-shadow strips along
  the counter rows and the walls, plus faint additive window-light patches. Background: a small
  CanvasTexture gradient (`backdropTexture`, sky blue to warm cream with a faint vignette).
- Themes (`room.js THEMES`): a theme repaints a few atlas swatches on copies of the atlas:
  `base` (the shared prop material: counter tops [6,3], fridge body [2,1], stove / oven body
  [1,1]), `furniture` (dining tables + chairs only), `wall`, `dining`, `kitchen` floors,
  `cupboard` (the wall cupboards), a `view` gradient on panes behind the windows, and the
  outside colours (`backdrop`, `grass`, `soil`, `path`, `leaves`, `flowers`, `water`, ...).
  Village Inn: cream plaster over a walnut wainscot, honey / caramel checker in the dining
  room, light tiles in the kitchen, walnut tables / chairs, light natural-wood counter tops,
  wooden cupboards, a cream fridge, a brick-red oven, sky and green hills in the windows, and
  outside a raised garden plot (grass top, soil sides) with a stepping-stone path, a picket
  fence, flower beds along the cut front walls, two lantern posts at the door, round trees
  behind the far corner (they peek over the walls), bushes and grass tufts.
  Harbor Tavern (the mirrored plan): white over sea-blue walls, blue / white checker dining
  floor, scrubbed deck planks in the kitchen, navy counter tops, blue cupboards, white enamel
  stoves / oven, a white fridge, brown tables with wooden chairs, the sea in the windows, and
  the plot is a wooden pier on posts in the sea (foam line, sea plane) with white fences.
- Room (14 x 14): two tall back walls (wall scale 0.86, 3.44 high) with wooden cupboards over
  the cooks' lanes and windows over the dining room; low cut front walls (0.52 high) with their
  thickness and pillars showing, the floor slab edge along the cut; the open front corner is
  the door. Kitchen L (see "Layout"): sink + fridge past the back-right counter row, a dresser
  with plates / jars past the back-left row, jars on the shelves of the cooks' corner; crates
  and a menu stand by the side corners. The static room is a few merged meshes (props by
  material, shadows, window light, window view, outside).

### Stations (`stations.js`)

Kind by id (index fallback): juice / cocoa = drinks, grill / veggie = grill, stew / soup = pot,
oven / roast = oven. Tier = milestones reached (levels 10/25/50/100 -> 1..4); each tier is one
merged mesh built on demand and cached: drinks = counter with mugs + jars (+ more jars, a crate
of carrots / potatoes), grill = single stove with a pan and a patty -> multi stove with two pans
-> decorated multi stove (+ bun, tomato), pot = countertop stove + stew pot -> two pots + bowls,
oven = oven (+ plates, a roast, a crate on top). The cooks work behind the counters, so the
drinks / pot counters have no backsplash, tall props stand at the ends and the front, and the
oven is squat (`OVEN_Y` 0.66) so its cook shows above it. A closed station is a plain counter
(the UI's Open sign stands on it). Tier change / open = pop (squash and stretch), plain upgrade
= bounce, boost = warm glow on the floor in front.

### Characters (`heroes.js`, `crowd.js`)

Guests: `look.char` Knight / Mage / Rogue_Hooded (Rogue maps to the hooded model), `look.tint`
0..3: tint 0 original, 1..3 rotate the signature colour on a texture copy (knight red cape ->
blue / green / purple, with matte bronze and gold armour on tints 2 and 3 (low saturation,
highlights pulled down so the helmet details survive at 1x); mage purple -> blue / crimson /
green; rogue green -> red / blue / yellow); skin untouched. Cooks: bald bearded Barbarians
(no cape, no bear hood) whose blue tunic is recoloured to cream cook's whites
(`TINTS.barbarian.whites`). Every hero instance has its own material (opacity fades at
the door) and mixer; instances are pooled and reused.

| entity state | what the scene shows |
|---|---|
| guest enter / toSeat / leaving | Walking_A along `path(from, to)` at `t / dur` (playback from `pathLength / dur`), facing the walk direction, fade in over 0.4 s at the door / out over the last 0.45 s |
| guest waiting / eating | Sit_Chair_Down (0.75 s) on arrival, then Sit_Chair_Idle, facing the table; eating: the dish on `seat.plate`, a small bite pulse, shrinking a little |
| guest paying | Sit_Chair_StandUp then Cheer; empty plate / bowl / mug on the table (it pops away 1.4 s into leaving); coins pop on `pay` |
| guest without a seat (queue) | Idle at its node, facing the camera (`FACE.yaw` = 45 deg) |
| cook idle | Idle at home, facing the camera |
| cook toStation / return | Running_A (playback from the real speed, so the Cook speed upgrade shows) |
| cook cooking | Interact behind the station counter, facing it (and the camera); the dish grows on `dishSpot` (`helperDishSpot` for a helper, slot 1) during the last 45 % of the cook time; steam puffs over stove / pot / oven |
| cook toTable | Run_Carry (running legs, both arms forward) with the dish in front of the chest |
| cook serving | facing the table, the dish travels from the hands to `seat.plate` in 0.32 s, then Idle |

`Walk_Carry` / `Run_Carry` / `Carry_Idle` are built at load time: legs and body from the clip,
both arms turned to point forward (solved once on a template). Clip feet speeds (measured):
Walking_A ~0.75, Running_A ~1.5 units/s at timeScale 1; guests walk with quick steps
(timeScale ~2.1 at 2.8 u/s), cooks run (~1.5 at 3.9 u/s).

Dishes (`dishes.js DISH`): juice -> mug_juice, cocoa -> mug_cocoa, burger -> food_burger,
veggieburger -> food_vegetableburger, stew / soup -> food_stew, dinner -> food_dinner; empty:
mug / bowl_dirty / plate_dirty. Unknown dish ids fall back to the burger.

### API details (in addition to the contract)

- `createScene(canvas, opts)`: `quality` ('high' | 'low'), `location` (initial, default 'inn'),
  `autoQuality` (default true), `onAutoQuality(q)` (called once when the scene drops itself to
  Low: persist it with `game.act({ type: 'setting', key: 'quality', value: q })`),
  `preserveDrawingBuffer` (tests), `antialias` (default true; fixed at creation), `elevation` /
  `yaw` (degrees, lab only; default `CAM` 35 / 45), `onProgress(done, total)` (model loading).
  Resolves after all six models are loaded and the first location is built (no frame drawn
  yet).
- `update(state, dt, render = true)`: dt clamped to 0.1 s; switches the location by itself when
  `state.location` changes (so `setLocation` on `locationStart` is optional); `render = false`
  skips the draw (fast-forward), `draw()` draws once.
- `fx(event, payload)` (station effects sit in front of the station along its facing): pay
  (coins from the table), upgrade (bounce + sparkles; milestone: more + floor ring; the tier pop
  comes from the state), open (burst + ring), buyTable (pop + burst),
  hire (puff at the cook's home), boost (sparkles), serve (small sparkle), cookStart (steam),
  locationComplete (confetti rain), locationStart (switch + confetti), setting {key: 'quality'}.
  Others are ignored.
- `pick(clientX, clientY)`: stations first: screen box of the counter and the lane behind it
  (where its cook stands); seen from the diagonal the boxes of two neighbouring stations
  overlap near the corner, so the nearest box centre wins. Then the nearest guest / cook
  (screen boxes). Tables: the tap ray must cross the table group's footprint (the round table
  top / pedestal or a chair) somewhere between the floor and the table top; a faded (not yet
  bought) table wins over a guest or cook who is just walking past it (cooks walk right in
  front of t3), otherwise people win over tables. Returns null on empty floor.
- `anchor(kind, id, out?)`: station (open: above the station and its cook, 3.15 up and 0.2
  toward the wall, clear of the head; closed: on the counter, 1.25 up and 0.6 toward the
  room, where the Open sign stands), table (1.3 up), customer / cook (above the head: 2.75
  standing, 2.35 seated), coins (`SCREEN.coins`, top centre), door. `anchor(stationId)` (one argument) = station.
  Pass `out` to reuse an object (no allocation).
- `setQuality(q)`, `setAutoQuality(on)`, `setInsets({ top, bottom, left, right })` (CSS px
  without safe areas; the scene adds `env(safe-area-inset-*)`), `resize()` (also automatic:
  window resize + a 0.5 s size check), `dispose()`, `stats()` -> `{ fps, frameMs, calls, tris,
  quality, autoLowered, characters, dishes, particles }`, `debug` (internals for the lab/tests).

### Quality and budgets

High: pixel ratio min(dpr, 2), all decor, full particles. Low: min(dpr, 1.25), no small decor,
~45 % particles. Auto drop: average frame time > 26 ms for 3 s on High -> Low (+ `onAutoQuality`).
No post-processing, no shadow maps, no per-frame allocations in the steady state (pooled heroes,
instanced dishes / shadows / particles, cached routes, positional `play()` arguments).
Static room = a handful of merged meshes; each station and table is one mesh; each hero one
skinned mesh.

Measured (Playwright, SwiftShader, iPhone 13 viewport, scene lab), busy inn with all 4
stations, 6 tables, 8 guests + 4 cooks: High 35 draw calls / 92k triangles, Low 35 / 77k
(pixel ratio 1.25); with goal confetti + coins + sparkles 40 / 92k; Harbor busy 37 / 90k;
empty inn at the start 22 / 36k. The outside (plot, path, fence, trees, ...) is one draw call.
Real-game numbers: "Download size and scene cost" above.

### Scene lab and tests

`scene-lab.html?preset=start|flow|busy|harbor|eat|carry|lineup&loc=inn|harbor&quality=high|low&manual=1&bands=0&labels=0&auto=0`
(`t=<s>` warm-up, `el=` / `yaw=` camera angles; the `eat` / `carry` close-ups frame a small
diamond for the diagonal camera). A fake restaurant (`tests/scene/fakesim.js`,
same state shape and walk graph as the logic, seeded) drives the real scene; mock DOM tags show
the anchors (Lv badges, Open, Buy, order bubbles) and the top / bottom UI bands. Panel buttons:
open next station, upgrade x10, buy table, hire, boost, add a guest, complete, toggle quality.
Hooks: `window.lab = { scene, sim, state, step(dt, render), preset(name), fx(ev, p), actions }`
and `window.diner = { scene, step, game: { state } }`.

`timeout 600 node tests/scene/smoke.cjs [<screenshotDir>]` (PORT, default 5401): assets < 8 MB,
licence present, budgets (High / Low), station / table / guest anchors and picks, every event
without errors, close-ups (eating, carrying), Harbor switch, Low pixel ratio, automatic Low,
`window.__EMBED` fallback with every .glb request blocked, no console errors. With a directory
it saves 01-start, 02-busy, 03-confetti, 04-eating, 05-carrying, 06-harbor, 07-low (+ @1x copies
and stats.json).
