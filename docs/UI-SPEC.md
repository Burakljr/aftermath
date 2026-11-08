# Aftermath UI direction: "Saha"

Status: static mockups. All six requested screens are built and screenshotted (iPhone 13 profile, 390×844, PWA standalone height).
Overview of all screens: `shots/overview.png`. Design system tile: `shots/system.png`. Icon sheet: `shots/icons.png`.

This spec matches the game-design pass in `explore/design/DESIGN.md` (same vocabulary: RADAR / TESLİM chips, "Hedef:" bar, yangın → enkaz → kesim, Güven, Hurdacı Rıza, Nevin Aksoy, ₺ display, no "!" and no emoji). Where this spec and DESIGN.md disagree on looks, this spec wins. On rules, DESIGN.md wins.

---

## 1. The idea in one paragraph

The player is a municipal contractor, so the UI is built from two materials that this kind of company actually handles:

1. **Steel and glass** is the company's own equipment: HUD plates, dispatch panels, fleet buttons. It is dark, slightly translucent over the 3D city, and has machined chamfered corners and a pressable bottom lip on buttons. Signal yellow is used only for the one action that matters right now.
2. **Municipal paper** is the city's side: the hakediş (progress-payment) receipt in yellow carbon-copy paper, with ballpoint-blue ink, a violet stamp-pad stamp and a signature. Paper appears only when the city pays you or judges you. That makes those moments feel different from routine play.

Two Turkish street-level details tie it to a real place. District names are navy **street-name plates** (sokak tabelası) standing in the 3D city. The kaiju alarm is a **local TV broadcast** with a CANLI bug and a lower third, because in this fiction everybody watches the fight on TV and the player arrives afterwards.

### How each "AI-made" tell from v1 was replaced

| v1 tell | Saha replacement |
|---|---|
| Emoji as icons (💰 ⭐ 🏙️ 🚒 🔪 ⚠️) | One SVG system: Tabler line icons for interface chrome, plus 20 custom duotone glyphs for game objects (§5) |
| System font, everything the same weight | Archivo variable (width + weight axes) for UI and numbers, Big Shoulders Display for headings, stencil only for the brand (§3) |
| Generic slate cards, one radius everywhere | Radius hierarchy (3 / 6 / 10 / 18 px), chamfered primary plates, paper for documents, street-sign plates in the world |
| Pill labels everywhere (SAKİN, TEMİZLİK) | A single phase chip with a timer bar; street plates for districts; tags only for "Önerilen" and "Nadir" |
| ⚠️ text banners | Letterboxed broadcast alarm with hazard stripe and a tracking overlay on the predicted impact district |
| Text paragraphs explaining rules | Rules shown by state: locked buttons that state their reason, a stage stepper, a time axis comparing fleet estimate and deadline, a price × deadline grid |
| "%100 kazanma şansı" and a wall of numbers | Honest win-chance grid with colour + number + hatching, and a single big meter for the chosen cell |

---

## 2. Files

```
explore/ui/
  UI-SPEC.md            this file
  LICENSES.md           every third-party file and its license
  css/fonts.css         @font-face (latin + latin-ext, unicode-range)
  css/ui.css            tokens + all shared components
  fonts/                vendored woff2 + OFL texts
  icons/sprite.svg      29 Tabler + 20 custom symbols (18 KB), ids.json, Tabler MIT license
  screens/1-calm.html … 6-depot.html, system.html, icons.html, common.js (mock helper)
  shots/*.png           3× screenshots of every screen + overview.png
  bg/*.png              placeholder city renders (+ projected district anchors .json)
  tools/bg.html         three.js placeholder scene (KayKit + Kenney CC0)
  tools/render-bg.cjs   renders bg/*.png and anchors
  tools/build-icons.cjs builds icons/sprite.svg (custom icon paths live here)
  tools/shoot.cjs       Playwright screenshots (devices['iPhone 13'], viewport 390×844)
  tools/shoot-overview.cjs, tools/overview.html
  vendor-src/           npm pack tarballs (source of fonts/icons)
```

Viewing: serve the scratchpad root over HTTP (`python3 -m http.server 8731` in `scratchpad/`) and open `/explore/ui/screens/1-calm.html`. `node tools/shoot.cjs [filter]` re-shoots. The backgrounds are **placeholders** for the 3D pass and were rendered with the same kind of orthographic camera DESIGN.md §5.2 asks for (pitch 54°, yaw 8°). Normal city view: `vh=26`. District zoom: `vh=17` (≈1.5×).

---

## 3. Tokens

### 3.1 Colour

Core (8):

| Token | Hex | Use |
|---|---|---|
| `--asfalt` | `#171B1E` | panel base (panels are a 180° gradient from `rgba(40,46,51,.9)` to `rgba(22,26,29,.93)`) |
| `--celik` | `#252B2F` | raised steel, tiles |
| `--celik-2` | `#313940` | secondary buttons, tracks |
| `--dikis` | `#48525A` | seams, connectors, hairlines |
| `--beton` | `#A1A8A6` | secondary text, inactive icons |
| `--tebesir` | `#EEEFEA` | primary text |
| `--sinyal` | `#F5B400` | brand + **the one primary action on screen** + selection; text on it is `--sinyal-ink #1B1500` |
| `--ikaz` | `#FF5A1F` | alarm, fire, urgency, "needs attention" |
| `--temiz` | `#46C485` | clean, success, gain, early delivery |

Semantic:

| Token | Hex | Use |
|---|---|---|
| `--yangin` | = `--ikaz` | fire stage bars and icons |
| `--enkaz` | `#C9A46E` | rubble stage |
| `--kesim` | `#E2557E` | carcass / carving stage |
| `--rakip` | `#9A88FF` | Süpürge Holding (logo, their trust value, later their vehicle livery) |
| `--tabela` | `#1F4191` | street-name plates for districts, chip headers |
| `--kagit` | `#F1E7BF` | yellow carbon-copy paper (with SVG noise texture) |
| `--kagit-cizgi` | `#CFC193` | dashed rules on paper |
| `--murekkep` | `#1F2B55` | ballpoint ink on paper |
| `--istampa` | `#5A3FB0` | stamp ink (ERKEN TESLİM, ZAMANINDA) |
| `--kirmizi-istampa` | `#B3261E` | stamp ink for GECİKTİ / İPTAL |

Rules:
- Yellow appears at most once as a filled surface per screen: the primary button. Elsewhere it is a line, a label or a selection outline.
- Win-chance colour is green ≥70, amber 40–69, red <40, at 20–24% fill so text stays readable. The number is always printed (colour-blind safe).
- Hatching (diagonal stripes) always means "blocked or at risk": locked dispatch, deadline shorter than the fleet estimate, paused work.
- The hazard stripe (yellow/black, 12 px) is used only on the alarm lower third and the company logo. It is not decoration.

### 3.2 Type

| Family | Package | Role |
|---|---|---|
| **Archivo** (variable, wght 100–900, wdth 62–125) | `@fontsource-variable/archivo` 5.3.0, OFL-1.1 | all UI text, buttons, **all changing numbers** (has `tnum`) |
| **Big Shoulders Display** 700/800/900 | `@fontsource/big-shoulders-display` 5.3.0, OFL-1.1 | sheet titles, monster names, alarm title, stamp text, phase tags |
| **Big Shoulders Stencil Display** 800 | `@fontsource/big-shoulders-stencil-display` 5.3.0, OFL-1.1 | brand wordmark and crate/vehicle markings only |

Turkish coverage (ç ğ ı İ ö ş ü, ₺) verified with fontTools: `latin` + `latin-ext` subsets together cover all of them, and ₺ (U+20BA) is in `latin-ext`. Big Shoulders figures are proportional, so never use it for a ticking number. Ticking numbers use Archivo with `font-variant-numeric: tabular-nums`.

Scale (px, 390-wide layout):

| Name | Spec | Example |
|---|---|---|
| D64 | Big Shoulders 900, 64/0.9 | KAİJU ALARMI |
| D30 | Big Shoulders 800, 30/1 | Temizlik ihalesi, Merkez, Depo |
| D24 | Big Shoulders 800, 24/1 | Magmadon, Hakediş belgesi |
| D16 | Big Shoulders 800, 16/1, +0.05em | RADAR, TESLİM, Hedef |
| N46 | Archivo 780, wdth 72, tnum | %56 (tender meter) |
| N30 | Archivo 780, wdth 76, tnum | 1.737.500 ₺ (receipt total) |
| N22 | Archivo 720–760, wdth 78–80, tnum | HUD cash, timers, stage values |
| B17 | Archivo 720, wdth 86 | button and dispatch labels |
| T15 | Archivo 400–520, wdth 100 | body, objective text |
| T13 | Archivo 520, wdth 92–100 | secondary lines, reasons |
| T12 | Archivo 600, wdth 84–88 | in-world chips, tab labels |

Caps are used only where real-world signage uses them: phase tags, alarm title, stamp. Always set `lang="tr"` so `text-transform` and the browser keep İ/ı correct. Better still, write caps literally.

### 3.3 Space, radius, elevation, shape

- Spacing: 4-pt grid (`--s1` 4 … `--s8` 32). Screen gutters 10 px (HUD) and 14–16 px (sheets).
- Radius: `--r-tag` 3 (tags, plates), `--r-btn` 6 (buttons, stage cards), `--r-card` 10 (dock cards, offers), `--r-sheet` 18 (top of sheets). Primary buttons and HUD plates are **chamfered** instead of rounded (`clip-path`, 10 px on buttons, 6 px on HUD plates).
- Elevation: one bevel highlight `inset 0 1px 0 rgba(255,255,255,.07)` plus one drop `0 10px 28px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35)`. Chamfered items take `filter: drop-shadow()` from their wrapper, because `clip-path` cuts box-shadow.
- Glass: `backdrop-filter: blur(14–18px)`, only on the sheet, objective bar and dock cards. HUD plates are solid (cheaper, and always readable).
- Hit targets ≥ 44 px (HUD 46, dispatch 60, sell 44, tabs 60).

### 3.4 Button states

| State | Look |
|---|---|
| Primary | `--sinyal` fill, dark ink, chamfer, 3 px darker bottom lip, 1 px top highlight |
| Primary pressed | translateY 2 px, lip removed, inner shadow, brightness .86 |
| Secondary | `--celik-2`, light text, same lip |
| Ghost | no fill, `--beton` text, optional leading icon ("Geri çağır") |
| Locked (with reason) | 6/12 px diagonal hatch over 75% steel, text 55% opacity, reason in signal yellow with a lock icon. Never hidden. On tap: shake 6 px × 3 (200 ms), reason brightens 600 ms, `error` sfx |
| Ready pulse | one element per screen at most: 1 Hz outline pulse in `--sinyal` (or `--ikaz` for "needs attention") |

---

## 4. Components (class names in `css/ui.css`)

**HUD** (`.hud`, max three items):
- `.plate--cash`: lira coin glyph + `2,41 Mn ₺` (N22, tnum; unit 14 px `--beton`). It rolls on change and flashes green or red.
- `.phase`: tag + icon + timer + bar. Variants: `RADAR 0:40` (fills as the monster approaches), `ALARM` (red, no number), `İHALE` + "Teklifini seç", `TESLİM 1:42` with the **3-zone bar** (`.phase--deadline`: gold zone 75%, white 25%, fill + marker; past the deadline it turns red `GECİKME +0:12`), and `TESLİM EDİLDİ` (green).
- `.iconbtn`: settings.

**Objective bar** (`.objective`): a 4 px yellow spine, a "Hedef" label in D16 yellow, one-line text, and a countable progress value at the right ("0/2 bölge"). News headlines replace the text for 5 s (DESIGN.md §5.6).

**Income float** (`.income`): small dark pill, `+72 bin ₺ bakım geliri`, green. It appears under the HUD every 10 s once upkeep exists.

**In-world** (HTML anchored to projected 3D points; `bg/*.anchors.json` shows how the projection works):
- `.sign`: navy street-name plate with an inset white border, plus a 14 px post down to the block. Used in calm mode.
- `.chip`: district job chip. Header = street-plate navy with the name and a working-vehicle badge. Body = **one bar for the current blocking task only** (draining: it shows what is left), a value, and three stage dots (`.on` done, `.now` current). States: `--attention` (orange ring, pulsing), `--selected` (yellow ring), `--done` (green header + check, fades after 2 s), paused (`.bar--striped`).
- `.edge`: off-screen pointer pinned to the screen edge for a district that needs attention ("‹ [flame] Eski Çarşı").
- `.vehicle-tag`: "Yolda 2 sn" above a moving vehicle. It disappears on arrival.
- Route: dashed yellow line (2/7 dash on a dark 6 px under-stroke) with an end dot. Selection: the district polygon in yellow, 7% fill.
- `.float`: "+3 pul", "Yol açık", max 3 on screen, no emoji.

**Bottom sheet** (`.sheet`): 18 px top radius, grabber, D30 title, close button. Slides up 220 ms ease-out. The city stays visible above it, and with a district selected the camera zooms to "Bölge" (≈1.5×) so the district sits above the sheet (see `4-cleanup`).

**Stage stepper** (`.stages` / `.stage`): three cards in sequence: Yangın → Enkaz → Kesim. Each has an icon, a big remaining value ("%62 yanıyor", "48 ton", "35 ton") and a draining bar in the stage colour. The current card is tinted, waiting cards are at 62% opacity, and 6 px connectors show the order.

**Dispatch button** (`.dispatch`): 60 px, icon tile, label + sub-line, and **fleet pips** at the right (one pip per owned vehicle, lit = ready) with "1 hazır". Variants: `--primary` (yellow), default (steel), `--locked` (hatched, with reason). Under the stack: a status line ("1 itfaiye çalışıyor, 1 yolda") and the "Çıkacak" loot icons, which teach which parts this monster gives.

**Tab bar** (`.tabs`): 4 tabs with line icons and 12 px labels. The active tab has a yellow icon and a 3 px top bar. A red dot means "action available", one dot at a time.

**Dock cards** (calm): `.next` (radar scope with an approach blip, monster name in D24, one line of class/weight/hazard, loot icons) and `.task` (the single suggested action, a yellow 4 px spine, one primary button). The calm screen never shows more than these two cards.

**Broadcast alarm** (`2-attack`): 120 px top and 284 px bottom letterbox in near-black. The CANLI bug + channel plate ("Körfez Haber") and clock sit top-left. The scene is graded (desaturate, red tint, vignette, faint scanlines). A tracking overlay shows the dashed approach path with chevrons and a target ellipse with the "Tahmini düşüş: Merkez" label. The lower third has the hazard stripe, a kicker, the D64 title, one sentence and three facts (Sınıf / Ağırlık / Risk). "Geç" pill to skip (after the first time).

**Tender** (`3-tender`):
- Document line: municipal seal + "Körfezkent Belediyesi", "İhale 2026/14".
- Job summary tiles: 2 yangın / 100 t enkaz / 70 t canavar.
- **Estimate axis**: a time rail with the fleet estimate as a hatched band (1:40–2:00) and the three deadline options as ticks (risky = orange, selected = yellow). This one picture answers "can I keep this promise?".
- **Price × deadline grid**: columns are price (İndirimli / Liste / Yüksek with ₺), rows are deadline (Hızlı / Normal / Rahat with time), cells hold the win chance. Selected cell: yellow ring + corner flag. "Önerilen" tag in green. Hatched cells mean the fleet cannot make that deadline. One-line legend.
- Outcome: a big N46 `%56`, a yellow meter, and "Kazanırsan 1,39 Mn ₺ ve canavarın parçaları."
- Rival line: broom logo in `--rakip`, their habit in one sentence, trust as two labelled numbers ("Senin güvenin 50 / Onların 45").
- CTA "Teklifi gönder" (gavel icon). Reveal and stamp per DESIGN.md §7.3.

**Hakediş receipt** (`5-result`): steel header with the district names in D30 and one line of consequence ("Söz verdiğinden 31 saniye önce bitirdin."). Then the paper slip: perforated top edge (CSS mask), rotated −1.2°, municipal header, title "Hakediş belgesi", a 2×2 meta grid, line items with dotted leaders, a 2 px ink rule, and the total in N30. Parts arrive as ink-outlined chips with icons. The signature (SVG scribble) and **stamp** sit together at the bottom right, as on a real document. Stamp: double-ruled rounded rectangle, D29 "ERKEN TESLİM", date line, SVG turbulence for ink loss and edge wobble, `mix-blend-mode: multiply`, rotated −8°. Variants: ERKEN TESLİM and ZAMANINDA in violet ıstampa, GECİKTİ in red. Below the paper: two gain cards (+8 güven, 34 parça) and "Ödemeyi al 1,74 Mn ₺". Motion: the slip slides up 300 ms, rows stagger 120 ms, the stamp slams (scale 1.6 → 1.0, 180 ms, tiny shake), and on collect coins arc to the HUD cash.

**Depot** (`6-depot`): panel title "Depo" + stock count; an **offer card** (buyer, quantity and unit price, "%24 more than Rıza", what you hold, countdown ring); the buyer header (Rıza avatar + "Çok satarsan fiyatı kırar, bir dakikada toparlar."); **stock rows**: 44 px icon tile (`.tile--rare` gold ring + "Nadir" tag), name + count, 62×22 sparkline with an end dot and delta (green up, orange down, grey "sabit"), and a sell button showing the unit price ("42 bin ₺ / tanesi, sat"). Hold-to-sell ticks the quantity up and the price down. Footer: "Hepsini Rıza'ya satarsan 1,62 Mn ₺" + "Hepsini sat".

---

## 5. Icons

**Interface chrome: Tabler Icons v3.50.0 (`@tabler/icons`, MIT).** 24 grid, 2 px stroke, round caps, no fill. Used: settings, x, chevron-right/down, clock, lock, arrow-back-up, trending-up/down, building-warehouse (Depo), building-factory-2 (Fabrika), map-2 (Şehir), briefcase-2 (Şirket), radar-2, route, player-track-next, check, info-circle, volume, hand-finger, dna-2, focus-2, hourglass-high, gavel, receipt-2, alert-circle, plus, minus, map-pin. Symbol ids: `t-*`.

**Game objects: custom "Saha duotone" set, original work for Aftermath (no third-party paths).** 24 grid, 1.9 px stroke, round joins, plus one fill layer at 28% `currentColor`, and solid accents for focal points (pupil, inner flame, rivets, bolt). Symbol ids: `g-*`:

| Group | Icons |
|---|---|
| Crews | firetruck (İtfaiye), excavator (Enkaz ekibi), cleaver (Kesim ekibi) |
| Stages | flame, rubble (jagged pile + rebar), carcass (Magmadon back with dorsal plates and eye) |
| Parts | scale (Pul), bone (Kemik), magma (Magma özü, flask), eye (Göz, slit pupil), armor (Zırh plakası), cell (Enerji hücresi), bonecrete (Kemik beton), relic (Müze eseri, amphora) |
| Economy and people | lira (₺ coin), trust (Güven shield-check), crate, broom (Süpürge Holding), municipal (belediye seal), radarblip |

Hierarchy rule: **line icons = interface, duotone = things in the world.** Colour follows meaning: crew and stage icons take their stage colour, parts keep a material tint in the depot (pul warm, kemik bone-white, magma orange, göz gold).

Delivery: `icons/sprite.svg` (18 KB) is inlined once into the DOM and referenced with `<svg><use href="#g-flame"/></svg>`. Production can inline it in `index.html` to save a request.

---

## 6. Copy rules (summary; full guide in DESIGN.md §9)

- Sentence case, second person *sen*. No "!", no emoji, no "…", no "Harika/Tebrikler".
- Buttons are verbs, 1–3 words: "İtfaiye gönder", "Teklifi gönder", "Ödemeyi al", "Sat", "Hepsini sat", "Geri çağır", "Geç".
- Locked reasons ≤ 5 words: "Yangın sönmeden giremez", "Önce yol açılmalı".
- Every number carries a unit. Chips: "1:42", "%62", "48 ton", "2,41 Mn ₺". Documents: full digits with dot thousands, "1.737.500 ₺". Turkish percent sign goes first: "%56".
- Proper-noun suffixes take an apostrophe: Merkez'deki, Rıza'ya, Süpürge Holding'i.

---

## 7. Integration notes for `index.html` (no build, no CDN)

1. Copy `fonts/`, `css/fonts.css`, the token block and the components you need from `css/ui.css`, and `icons/sprite.svg` into the repo. Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for `archivo-latin-wdth-normal.woff2`, `archivo-latin-ext-wdth-normal.woff2` and `big-shoulders-display-latin-800-normal.woff2`. Total font payload today: 285 KB. A single Turkish-only subset of Archivo made with `pyftsubset` (keeping the variable axes) measured about 75–80 KB, so a production subset can halve this.
2. The `.screen`, `.statusbar` and `.homebar` rules are mock chrome. In the game, use `env(safe-area-inset-top/bottom)` for `--safe-top` and `--safe-bottom`.
3. In-world chips: project each district's anchor (top-centre of the block, y ≈ 2.2) with the camera every frame at ≤30 Hz, set `transform: translate3d(x,y,0)` (not `left/top`), and hide chips that fall behind the HUD or sheet. Off-screen districts with work use `.edge` pinned to the nearest edge.
4. `backdrop-filter` is the most expensive thing here. Keep it on at most two layers at a time (sheet + objective bar). On low-end devices (detected by frame time), swap `.glass` to the solid gradient.
5. Every CSS animation must respect `prefers-reduced-motion` (no stamp slam, no pulse; use instant state changes).
6. Handoff to the 3D pass, from the placeholder renders: tall towers in the near row (Finans) hid the Merkez block and the monster at pitch 54°. Keep near-row buildings under about 1.5 tiles tall, or put the low district (Park) in the near row. The selected-district zoom (`vh 17`) framed the action sheet well.

---

## 8. Licenses

See `LICENSES.md`. Summary: Archivo and Big Shoulders are SIL OFL 1.1 (commercial use fine; do not sell the fonts alone; keep the license file). Tabler Icons is MIT (keep the notice). The custom icons, CSS and mock pages are original to this project. The placeholder backdrops use CC0 3D models (KayKit City Builder Bits; Kenney Car Kit / City Kit Commercial / Nature Kit via the `@netforge/asset-library-files` mirror) and three.js (MIT). No attribution-required (CC-BY) asset is used anywhere.
