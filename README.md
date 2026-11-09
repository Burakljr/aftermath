# Toy Factory (working title)

A bright, cute idle tycoon game for phones. You run a toy factory: a conveyor line runs
down the screen through four stations, little workers run the machines, and a truck at the
bottom sells every finished toy. Tap a station to upgrade it, tap a machine to speed it up
for a moment, open new stations, finish goals, complete the factory and move on to the next.

- Factory 1, Wooden Toys: Saw -> Assembly -> Paint Booth -> Gift Wrap.
- Factory 2, Teddy Bears: Fabric Cutter -> Stuffing -> Stitching -> Ribbon Box.
- Money keeps coming while the game is closed (up to 2 hours).
- English and Turkish (picked from the phone language, switchable in Settings).

The game title lives in the language files (`app.title` in `js/i18n/*.js`).

## Run

No build step. Serve the folder with any static server and open it in a browser:

```
PORT=5300 node tools/serve.mjs
# open http://localhost:5300/
```

Plain HTML/CSS/JS ES modules, three.js r187 vendored in `vendor/three`, no network
requests at run time. Works from a sub-path and inside a sandboxed iframe. The plan is to
wrap it with Capacitor for the App Store and Google Play later.

Development pages: `ui-lab.html` (the UI with a placeholder scene and presets) and
`scene-lab.html` (the 3D scene with a fake production line).

## Test

Needs Node 18+ and Playwright with Chromium for the browser tests.

```
node tests/logic/run.mjs                 # game logic, pacing, saves, languages
node tests/logic/bot.mjs                 # pacing timeline of a bot player
timeout 600 node tests/e2e/play.cjs      # plays the real game end to end on an emulated iPhone 13
timeout 600 node tests/shots.cjs out/    # screenshots of the real game in play order
```

See `docs/ARCH.md` for the architecture, the game/scene/UI contract, the economy and all
test scripts. Third-party material and licences: `LICENSES.md`.
