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
`tests/scene/*`. `index.html` / `js/main.js` are the integration (see "Integration").

## Run

```
PORT=5402 node tools/serve.mjs      # then open http://localhost:5402/ui-lab.html (UI lab)
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
ui-lab.html           UI lab: real game + UI on a flat placeholder drawing of layout.js
tests/logic/*         node tests (no deps): node tests/logic/run.mjs
tests/ui/*            Playwright: lab-play.cjs (interactions), lab-shots.cjs (screenshots)
```

## Shared contract

### Layout (`js/game/layout.js`)

World units at KayKit native scale (a counter tile 2 x 2, a small round table 1.5 wide,
characters ~2.4 tall). x right, z toward the camera (bottom of the screen), y up. Floor points
`[x, z]`, points with height `[x, y, z]`, `facing` = rotation about y (0 = toward +z).
`LAYOUTS[id]` / `getLayout(id)`:
`{ id, bounds, door { pos, node: 'door', outside: 'out' }, queue, tables [{ id: 't1'..'t6', pos,
front: 't<n>f', seats [{ id: 't<n>a|b' (= graph node), pos, facing, plate [x,y,z], chair }] }],
stations [{ id, pos, facing, cookSpot, node: 'st_<id>', dishSpot }], cookHomes ['h1'..'h4'],
kitchen, graph { nodes, edges }, speeds { customer, cook }, path(from, to), pathLength(from, to),
pointAt(from, to, s, out) }`. Station order = config order = unlock order.

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
state.cooks      [{ id: 'c1'..'c4', state, station, order: { id, customer, station, dish } | null,
                    from, to, t, dur, home }]
   'idle' (home) -> 'toStation' (walk to st_<id>) -> 'cooking' (dur = cook time, t runs x2 while
   the station's boostT > 0) -> 'toTable' (walk to the table front, carrying order.dish) ->
   'serving' (0.45 s; the guest starts eating) -> next order ('toStation') or 'return' (walk home).
   One cook per station at a time (from assignment until the dish is cooked).
state.orders     [{ id, customer, station, dish }]  waiting for a cook (FIFO; each takes the
                 nearest free cook whose station is free)
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
- Orders: the newest open station weighs 3, the others 1. Customers arrive after
  `max(0.7, 2.4 / free seats)` s; no failure states.
- Village Inn: juice (price 7, cook 2 s, open free), grill (30, 3 s, open 100), stew (300, 4 s,
  open 1.4K), oven (3K, 5 s, open 16K); tables 3-6 cost 80 / 300 / 1.5K / 6K; cooks 2-4 cost
  30 / 500 / 6K; cook speed (+15 % per level, 10 levels) 200 x 2.4^(L-1). 18 goals (stars =
  thirds). Harbor Tavern = everything x10 with its own dishes (cocoa, veggie burger, soup, roast).
- Income estimate (HUD, offline, hints) = soft minimum of the cook-, station- and seat-limited
  order rates x average price; within ~10 % of the simulation (tests/logic/estimate.test.mjs).
- Offline: estimate x min(away, 2 h), only if away >= 60 s, collected on return.
- Measured by `node tests/logic/bot.mjs` (attentive player, seeds 3/7/11/19): first upgrade 0 s,
  first coins 9 s, 2nd cook ~0:30, Grill 0:50, Stew 3:07-3:28, Oven 5:43-5:59, Village Inn
  complete 10:30-10:53, 90 % of gaps between reward moments <= 13 s, longest 21-27 s (while
  saving for the Oven); guests wait ~9-10 s for food (max ~36 s just after the Oven opens).
  Careless bot (cheapest buys, late goals, no boosts): complete in ~30 min (no softlock).
  Harbor Tavern: ~11 min.
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
  station: a price chip that becomes an orange "Open" sign when affordable (tap: station card);
  later plots: a tiny lock.
- Order bubbles at `anchor('customer', id)` for waiting guests: dish icon, progress ring while a
  cook prepares it, a little bounce while it is carried; "+coins" float + a coin flight to the
  HUD on `pay` (hidden while a panel/modal is open).
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
- Tutorial: pointing hand + ring + short bubble; bubbles for card buttons sit above the card.
- Toasts (opened, new cook, new table, milestone, goal done) sit just above the bottom UI (or
  under the HUD while a sheet is open), so they never cover the stations.
- Canvas taps: `scene.pick()` -> station (boost + card), table (info, or Upgrades for an unowned
  table), customer (his order), cook (info), nothing (closes the card).

## Integration (`index.html`, `js/main.js`) - to do when wiring the real scene

main.js and index.html in the repo still come from the old prototype. They need to:
create storage `createStorage()`; `createGame({ save: storage.load(), lang })`;
`await createScene(canvas, { quality: game.state.settings.quality, location: game.state.location })`;
`createUI({ root: #ui, game, scene, audio: createAudio(), canvas })`; forward
`for (const ev of EVENTS) game.on(ev, p => scene.fx(ev, p))`; on `locationStart` call
`scene.setLocation(id)`; save every few seconds, on `open`/`locationComplete`/`locationStart`/
`setting` and on `visibilitychange` (hidden) / `pagehide`; frame loop `game.tick(dt)`,
`scene.update(game.state, dt)`, `ui.update(dt)`; expose `window.diner = { game, scene, ui,
step(dt), save(), ready }`; title/loader texts from i18n (`app.title`). The UI lab
(`ui-lab.html`) shows the same wiring with a fake scene.

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

- `node tests/logic/run.mjs` (~2 s): i18n parity/placeholders/emoji/"!"/leftovers/key use,
  pacing (4 seeds), softlock (careless bot, Harbor Tavern, never buying), save roundtrip and
  determinism, broken/tampered saves, guarded storage, offline (rate, 2 h cap, < 60 s, hidden tab),
  action validation, income estimate vs simulation, world contract (state order, walk durations,
  one cook per station, one guest per seat, waits, events, newest dish, boost).
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
All art is KayKit (CC0, Kay Lousberg): Restaurant Bits for the room, the Adventurers pack for
the people. Nothing is drawn from code primitives except tiny particles (coins, sparkles,
confetti, steam) and soft shadow / light decals.

### Files

```
js/scene/scene.js     createScene(): renderer, lights, camera fit, sync with the state, events, pick, anchors, stats
js/scene/assets.js    loadModel(name) / loadModels(names): assets/models/<name>.glb or window.__EMBED[name] (base64)
js/scene/kit.js       prop templates from props.glb, shared Lambert material, recoloured atlas copies, static batcher
js/scene/room.js      static room per location (floors, walls, kitchen row, pass, decor, contact shadows, window light); THEMES
js/scene/stations.js  stations: merged mesh per visual tier, locked placeholder, pop / bounce, boost glow
js/scene/tables.js    tables + chairs (one mesh each), faded until bought, pop on buy
js/scene/heroes.js    hero templates, tinted textures, pooled instances (one AnimationMixer each), crossfades
js/scene/crowd.js     customers + cooks <-> state entities: walk along the graph, sit, eat, pay, leave; cook, carry, serve
js/scene/dishes.js    instanced dishes / empty plates / blob shadows (filled every frame); DISH map
js/scene/fx.js        pooled particles: coins, sparkles, puffs, confetti, floor rings, steam
js/scene/camera.js    orthographic camera (elevation 40 deg, yaw 0) + fit to the viewport minus UI insets
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

- Camera: orthographic, looking at the back wall (kitchen at the top of the screen, door at the
  bottom), 40 deg down, no yaw. Fit: the room floor (x -6.1..6.1) and the station tops fill the
  viewport minus the UI insets + safe areas (`setInsets()`), centred; on a 390 px wide phone
  that is ~32 px per unit, standing characters ~50-55 px tall.
- Light: hemisphere (warm sky / brown ground) + one warm directional light, Lambert materials,
  Neutral tone mapping (exposure 1.06), sRGB output. No shadow maps: soft blob shadows under
  characters and tables (one instanced mesh) and baked soft contact-shadow strips along the
  kitchen row, the pass counters and the walls, plus faint additive window-light patches.
- Themes (`room.js THEMES`): a theme repaints a few atlas swatches on a copy of the atlas.
  Village Inn: cream plaster over a wooden wainscot, honey-brown wood checker floor in the
  dining room, light tiles in the kitchen, orange tables / chairs, grass outside.
  Harbor Tavern: white over sea-blue walls, blue / white checker floor, terracotta kitchen tiles,
  brown round tables with wooden chairs, a green fridge, sand outside and the sea behind.
- Room (12 x 20): back row fridge + 4 stations + sink, wall cabinets and a shelf with jars,
  pass counters with plates / jars / sauces / a menu, a host desk and vegetable crates by the
  door, a low front wall (dollhouse cut) open at the door.

### Stations (`stations.js`)

Kind by id (index fallback): juice / cocoa = drinks, grill / veggie = grill, stew / soup = pot,
oven / roast = oven. Tier = milestones reached (levels 10/25/50/100 -> 1..4); each tier is one
merged mesh built on demand and cached: drinks = counter with mugs + jars (+ more jars, a crate
of carrots / potatoes), grill = single stove with a pan and a patty -> multi stove with two pans
-> decorated multi stove (+ bun, tomato), pot = countertop stove + stew pot -> two pots + bowls,
oven = oven (+ plates, a roast, a crate on top). A closed station is a plain counter (the UI's
Open sign stands on it). Tier change / open = pop (squash and stretch), plain upgrade = bounce,
boost = warm glow on the floor in front.

### Characters (`heroes.js`, `crowd.js`)

Guests: `look.char` Knight / Mage / Rogue_Hooded (Rogue maps to the hooded model), `look.tint`
0..3: tint 0 original, 1..3 rotate the signature colour on a texture copy (knight red cape ->
blue / green / purple, with bronze and gold armour on tints 2 and 3; mage purple -> blue /
crimson / green; rogue green -> red / blue / yellow); skin untouched. Cooks: bald bearded
Barbarians (no cape, no bear hood). Every hero instance has its own material (opacity fades at
the door) and mixer; instances are pooled and reused.

| entity state | what the scene shows |
|---|---|
| guest enter / toSeat / leaving | Walking_A along `path(from, to)` at `t / dur` (playback from `pathLength / dur`), facing the walk direction, fade in over 0.4 s at the door / out over the last 0.45 s |
| guest waiting / eating | Sit_Chair_Down (0.75 s) on arrival, then Sit_Chair_Idle, facing the table; eating: the dish on `seat.plate`, a small bite pulse, shrinking a little |
| guest paying | Sit_Chair_StandUp then Cheer; empty plate / bowl / mug on the table (it pops away 1.4 s into leaving); coins pop on `pay` |
| guest without a seat (queue) | Idle at its node, facing the room |
| cook idle | Idle at home, facing the room |
| cook toStation / return | Running_A (playback from the real speed, so the Cook speed upgrade shows) |
| cook cooking | Interact at the station, facing it; the dish grows on `dishSpot` during the last 45 % of the cook time; steam puffs over stove / pot / oven |
| cook toTable | Run_Carry (running legs, both arms forward) with the dish in front of the chest |
| cook serving | the dish travels from the hands to `seat.plate` in 0.32 s, then Idle |

`Walk_Carry` / `Run_Carry` / `Carry_Idle` are built at load time: legs and body from the clip,
both arms turned to point forward (solved once on a template). Clip feet speeds (measured):
Walking_A ~0.75, Running_A ~1.5 units/s at timeScale 1; guests walk with quick steps
(timeScale ~2.2 at 3 u/s), cooks run (~1.4 at 3.6 u/s).

Dishes (`dishes.js DISH`): juice -> mug_juice, cocoa -> mug_cocoa, burger -> food_burger,
veggieburger -> food_vegetableburger, stew / soup -> food_stew, dinner -> food_dinner; empty:
mug / bowl_dirty / plate_dirty. Unknown dish ids fall back to the burger.

### API details (in addition to the contract)

- `createScene(canvas, opts)`: `quality` ('high' | 'low'), `location` (initial, default 'inn'),
  `autoQuality` (default true), `onAutoQuality(q)` (called once when the scene drops itself to
  Low: persist it with `game.act({ type: 'setting', key: 'quality', value: q })`),
  `preserveDrawingBuffer` (tests), `antialias` (default true; fixed at creation), `elevation` /
  `yaw` (degrees, lab only), `onProgress(done, total)` (model loading). Resolves after all six
  models are loaded and the first location is built (no frame drawn yet).
- `update(state, dt, render = true)`: dt clamped to 0.1 s; switches the location by itself when
  `state.location` changes (so `setLocation` on `locationStart` is optional); `render = false`
  skips the draw (fast-forward), `draw()` draws once.
- `fx(event, payload)`: pay (coins from the table), upgrade (bounce + sparkles; milestone: more +
  floor ring; the tier pop comes from the state), open (burst + ring), buyTable (pop + burst),
  hire (puff at the cook's home), boost (sparkles), serve (small sparkle), cookStart (steam),
  locationComplete (confetti rain), locationStart (switch + confetti), setting {key: 'quality'}.
  Others are ignored.
- `pick(clientX, clientY)`: screen-space boxes of the projected 3D bounds; stations first (box
  around the station and the cook spot), then the nearest guest / cook, then tables (incl.
  faded ones). Returns null on empty floor.
- `anchor(kind, id, out?)`: station (open: above the appliance, ~2 units up; closed: just above
  the counter), table (1.3 up), customer / cook (above the head: 2.75 standing, 2.35 seated),
  coins (`SCREEN.coins`, top centre), door. `anchor(stationId)` (one argument) = station.
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

Measured (Playwright, SwiftShader, iPhone 13 viewport), busy inn with all 4 stations, 6 tables,
8 guests + 4 cooks: High 34 draw calls / 89k triangles, Low 34 / 75k (pixel ratio 1.25);
with goal confetti + coins + sparkles 40 / 91k; Harbor busy 36 / 85k; empty inn at the start
20 / 33k.

### Scene lab and tests

`scene-lab.html?preset=start|flow|busy|harbor|eat|carry|lineup&loc=inn|harbor&quality=high|low&manual=1&bands=0&labels=0&auto=0`
(`t=<s>` warm-up, `el=` / `yaw=` camera angles). A fake restaurant (`tests/scene/fakesim.js`,
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
