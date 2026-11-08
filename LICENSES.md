# Third-party material

Everything not listed here (all JavaScript in `js/`, all CSS in `css/`, the procedural sounds and music in `js/audio.js`,
every 3D model, texture and effect generated at runtime by `js/scene/`, the Magmadon and KALKAN-07 designs, the `g-*`
game glyphs and the eight extra `t-*` line glyphs listed below, the app icons in `icons/`) is original work of this
project. No CC-BY or other attribution-required material is used.

| What | Where | Source | Version | Licence | Licence text |
|---|---|---|---|---|---|
| three.js (module build) | `vendor/three/build/three.module.min.js` | npm `three` | r187 (0.187.0) | MIT | `vendor/three/LICENSE` |
| three.js addons ConvexGeometry, ConvexHull, RoundedBoxGeometry | `vendor/three/addons/` | npm `three` | r187 | MIT | `vendor/three/LICENSE` |
| Archivo (variable, wght + wdth), latin + latin-ext | `assets/ui/fonts/archivo-*.woff2` | npm `@fontsource-variable/archivo` (Omnibus-Type) | 5.3.0 | SIL OFL 1.1 | `assets/ui/fonts/OFL-Archivo.txt` |
| Big Shoulders Display 700 / 800 / 900 | `assets/ui/fonts/big-shoulders-display-*.woff2` | npm `@fontsource/big-shoulders-display` (Patric King) | 5.3.0 | SIL OFL 1.1 | `assets/ui/fonts/OFL-BigShoulders.txt` |
| Big Shoulders Stencil Display 800 | `assets/ui/fonts/big-shoulders-stencil-display-*.woff2` | npm `@fontsource/big-shoulders-stencil-display` | 5.3.0 | SIL OFL 1.1 | `assets/ui/fonts/OFL-BigShoulders.txt` |
| Tabler Icons (outline glyphs with ids `t-*`) | `assets/ui/icons/sprite.svg`, `js/ui/sprite.js` | npm `@tabler/icons` (Paweł Kuna) | 3.50.0 | MIT | `assets/ui/icons/LICENSE-tabler-MIT.txt` |

Original glyphs in the same sprite (no licence needed): all `g-*`, plus `t-phone t-music t-mute t-news t-trash t-repeat t-gauge t-door`.

`assets/lab/*.jpg` are screenshots of this project's own 3D prototype, used only by `ui-lab.html` (never loaded by the game).

Details per folder: `assets/ui/LICENSES.md`.
