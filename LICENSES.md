# Licences

## Third-party material

| What | Where | Licence |
|------|-------|---------|
| three.js r187 (`build/three.module.min.js`, `addons/loaders/GLTFLoader.js`, `addons/utils/SkeletonUtils.js`, `addons/utils/BufferGeometryUtils.js`, from the npm package `three@0.187.0`) | `vendor/three/` | MIT, Copyright 2010-2026 three.js authors. Full text: `vendor/three/LICENSE` |
| KayKit Restaurant Bits 1.0 and KayKit Character Pack: Adventurers 1.0, by Kay Lousberg (www.kaylousberg.com): restaurant pieces, food, mugs, the Knight, Mage, Rogue (hooded) and Barbarian characters and their animations. Converted to .glb, trimmed (unused meshes, weapons and animations removed), textures downscaled and a few swatches recoloured by `tools/assets/build.mjs` | `assets/models/` | CC0 1.0 (public domain). Details: `assets/LICENSE-KayKit.txt` |
| Fredoka font, weights 500/600/700, latin + latin-ext (woff2, from the npm package `@fontsource/fredoka`) | `assets/fonts/` | SIL Open Font License 1.1, Copyright 2016 The Fredoka Project Authors. Full text: `assets/fonts/OFL.txt` |

The KayKit packs do not require credit; the game credits Kay Lousberg in Settings anyway.

## Everything else

All other code and content is original work made for this project: the game logic and
economy, the scene code (layout, camera, lighting, characters' behaviour, effects), the inline
SVG icons, the synthesised sounds (Web Audio, no sound files), the texts in both languages,
the styles, the tools and the tests. Nothing is fetched from the network at run time.

The asset pipeline (`tools/assets/`) uses `@gltf-transform/*`, `meshoptimizer` and `pngjs`
from npm at build time only (not shipped).
