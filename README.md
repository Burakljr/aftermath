# Heroes' Diner (Kahramanlar Lokantası, working title)

An idle restaurant tycoon game for phones. You run a cosy inn where fantasy adventurers
(knights, mages, rogues) come to eat after their quests. Guests walk in, sit down and order;
your cooks cook at the kitchen stations and carry the food to the table; guests eat, pay and
leave. Tap a station to upgrade it (more coins per dish, faster cooking at levels 10, 25, 50
and 100), open new stations and dishes, buy tables, hire cooks, finish the goals, complete the
restaurant and move on to the next place.

- Place 1, Village Inn: Juice Bar -> Grill -> Stew Pot -> Oven (about 10-12 minutes).
- Place 2, Harbor Tavern: Cocoa Stand -> Veggie Grill -> Soup Pot -> Roast Oven.
- Coins keep coming while the game is closed (up to 2 hours).
- English and Turkish (picked from the phone language, switchable in Settings).
- Kid-friendly: no alcohol (the mugs hold juice or cocoa), no weapons, no fighting.

The game title lives in the language files (`app.title` in `js/i18n/*.js`).

## Look

3D art: the KayKit Restaurant Bits and Adventurers packs by Kay Lousberg (CC0), one
consistent style, seen from a fixed diagonal (isometric) camera as a cosy cut-away diorama on a
little garden plot (Village Inn) or a pier in the sea (Harbor Tavern); the cooks work behind
their counters facing you and seated guests face the camera. UI: cream panels, one orange
accent for buttons, gold for coins, soft shadows, the Fredoka font and our own simple SVG icons.

## Run

No build step. Serve the folder with any static server and open it in a browser:

```
PORT=5403 node tools/serve.mjs
# open http://localhost:5403/
```

Plain HTML/CSS/JS ES modules, three.js r187 vendored in `vendor/three`, no network
requests at run time except the game's own files (relative paths). Works from a sub-path and
inside a sandboxed iframe (without saving). About 3.8 MB to download (2.6 MB of models).
The plan is to wrap it with Capacitor for the App Store and Google Play later.

Development pages: `ui-lab.html` (the UI on a flat stand-in scene, with presets),
`scene-lab.html` (the 3D scene on a fake restaurant) and `tests/scene/game-lab.html` (the real
game logic on the real scene, no UI).

Preview copy for hosts that cannot serve `.glb` files (models embedded as base64 JS):

```
node tools/build-preview.mjs out/preview
```

## Assets

`assets/models/*.glb` are built from the two KayKit packs by `tools/assets/build.mjs`
(trimmed meshes, weapons removed, 12 shared animations, one texture atlas):

```
cd tools/assets && npm install && node build.mjs <folder with the two KayKit packs>
```

Licence: `assets/LICENSE-KayKit.txt` (CC0). All third-party material: `LICENSES.md`.

## Test

Needs Node 18+ and Playwright with Chromium for the browser tests.

```
node tests/logic/run.mjs                    # game logic, pacing, saves, languages (48 tests)
node tests/logic/bot.mjs                    # pacing timeline of a bot player
timeout 600 node tests/e2e/play.cjs         # plays the real game end to end on an emulated iPhone 13
timeout 600 node tests/shots.cjs out/shots  # 8 screenshots of the real game in play order
timeout 600 node tests/ui/lab-play.cjs      # UI interaction checks in ui-lab.html
timeout 600 node tests/scene/smoke.cjs      # scene smoke test (budgets, picking, anchors, embed fallback)
node tools/build-preview.mjs out/preview && timeout 300 node tests/preview.cjs out/preview
```

See `docs/ARCH.md` for the architecture, the game/scene/UI contract, the economy and all
test scripts.
