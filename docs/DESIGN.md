# Aftermath v2: making the game understandable

Spec author: game design pass. Scope: rules, flow, onboarding, interaction, copy. Visual and 3D art direction belong to the art/3D passes; this document lists what those passes have to *support* (anchors, states, vehicles), not how they should look.

Source read: `js/data.js`, `js/sim.js`, `js/ui.js`, `js/render.js`, `js/state.js`, `js/main.js`, `js/audio.js`, `css/style.css`, `index.html`, plus all 11 screenshots in `scratchpad/shots/`.

---

## 0. TL;DR

- **Root cause:** the game shows almost every system it has in the first minute, and hides the one verb that matters (sending a crew) behind a `+/-` stepper below the fold. In the first 40 seconds the player reads about 140 words in 3 modals (intro, tender, "İhale senin"). They are asked to price a job they have never done, and they get a 100% win chance that makes the choice meaningless. Then they land on a dashboard of six tiles with emoji floating on them.
- **Fix in one line:** one city, one district, one fire, one tap. Then the player watches a truck drive there, sees the fire die, sees the road open, sees the monster cut up into crates and sells the crates. That is the whole game, and the player gets through it in about 70 seconds. Every other system arrives later, one at a time, and the player earns each one.
- **Core loop:** `DÜŞÜŞ → SEVK → TEMİZLİK → SATIŞ` (monster falls → dispatch → clear and carve → sell). New hard rule inside a district: **yangın → enkaz → kesim** (fire, then rubble, then carving), shown by disabled buttons that say why.
- **HUD:** at most three numbers (cash, phase timer, objective progress). There is always one "Hedef: …" line, and no emoji anywhere in UI text.
- **Systems:** cut anger, storage cap and early Otomatik. Hide reputation from the HUD. Turn passive income into per-district *Bakım sözleşmesi*, unlocked after contract 3. Replace the stock-ticker market with named buyers making concrete offers. The tender moves to contract 3 as a 3×3 heat-map with honest odds and a "your fleet needs ~1:50" line.
- **Save:** bump to v2 with a fresh start (a v1 save cannot be mapped onto the onboarding). Keep the v1 blob untouched so a rollback is possible. Audio prefs live in a separate key and survive.

---

## 1. Diagnosis: why the player did not understand the game

Each point is tied to evidence in the code or a screenshot.

| # | Problem | Evidence | Effect on the player |
|---|---|---|---|
| D1 | **The first screen is an investment menu, not the game.** After a 47-word intro modal, the calm panel shows "Sonraki saldırı 0:07", a "Hızlandır" button and "Bakım sözleşmeleri" (passive income, star levels, upgrade prices). | `2-calm.png`, `ui.js` buildCity calm branch (l.288-301) | The first decision offered is the most abstract system in the game. The player has no idea what a "level" is for. |
| D2 | **Three HUD numbers with no meaning.** `💰1.503`, `⭐50`, `🏙️+7,2/sn`. Reputation is never explained. Income drops from 7,2 to 4,8 after the first attack with no message. | `1-intro.png` vs `5-tender.png`; `sim.js` l.260 (`sec.level -= 1` on impact) | Numbers move for invisible reasons. That reads as "fake". |
| D3 | **Pricing a job before knowing what the job is.** The tender modal opens 4.4 s after the attack: 4 stat tiles in tons, 6 buttons, a win chance and a paragraph of rules. | `5-tender.png`, `ui.js` tenderHTML | The player cannot judge "2:09 vs 1:31" because they have never cleaned anything. |
| D4 | **The first tender is rigged to 100%, and the odds shown are not the odds used.** `winChance` scores you against a fixed rival bid. `resolveTender` rolls a random rival bid plus noise on both sides. Simulated over 200k trials (`odds_check.mjs`): shown 24% → actual 12%, shown 86% → actual 95%. | `sim.js` l.297-318; `explore/design/odds_check.mjs` | The one strategic screen is decorative the first time and slightly dishonest afterwards. |
| D5 | **The core verb is off-screen.** In cleanup, the crew `−/+` rows for the selected district sit *below* the contract card and the crew-pool card. At 390×844 they are not visible without scrolling. | `7-cleanup.png`, `8-working.png` (no crew rows visible) | The player taps a district, sees nothing change, and presses "⚡ Otomatik". From then on the game plays itself. |
| D6 | **"⚡ Otomatik" from minute one** removes the only decision in cleanup. | `ui.js` l.266, `sim.js autoAssign` | Optimal play is a single button, so the player never learns how fire, rubble and the monster relate. |
| D7 | **Rules are soft and invisible.** Fire slows other crews to 30% (`sim.js` l.437). The only hint is one line in a hint bar, and rubble and carving can run in any order. | `sim.js cleanupTick` | There is no visible cause and effect, so the player cannot form a mental model. |
| D8 | **Six rounded cards do not read as a city.** Thin dashed "roads" between tiles, empty lots drawn as dashed rectangles (look like missing art), rubble as grey circles, the monster as a cartoon crocodile with ✕ eyes. | `2-calm.png`, `7-cleanup.png`, `render.js drawSector/visibleLots` | It reads as a dashboard of tiles, not a place, so the player cannot "see" logistics. |
| D9 | **Crews do not travel.** Emoji (`🚒 🚜 🔪`) bob in place inside the tile. Debris is a farm tractor and carving is a kitchen knife. | `render.js drawCrews`, `9-company.png` | Dispatching has no visible result. The emoji choices are the strongest "made by AI" signal. |
| D10 | **Too many systems at once.** About 14 systems with no gating: money, reputation, rival reputation, anger, deadline + bonus thresholds, 3 crew types, storage cap, 8 items with per-unit elasticity and random-walk prices, booms, 4 recipes × auto-repeat × line count, 3 upgrades, 6 district levels, offline income, DNA, secret buyer, mutant, loss-streak pity. All four tabs are open from the start. | `index.html` tabs, `data.js` | Overload. The player cannot tell which systems matter. |
| D11 | **Text-heavy modals, emoji soup, exclamation spam.** Every toast, title and news line starts with an emoji. Titles like "💪 İhale senin!", "🏆 Rekor temizlik!", button "Harika". Ticker: "pırıl pırıl", "kapış kapış". | `ui.js`, `sim.js news()` | Reads as generated copy. |
| D12 | **The ticker is unreadable.** CSS starts the text at `padding-left:100%` and scrolls for 16 s, so screenshots show "Afte", "Magm". | `style.css` l.70-72, every screenshot | News, which explains causes ("prices fell because…"), is effectively invisible. |
| D13 | **The pacing is clock-driven, with dead time.** 75 s calm countdown with a skip button. A lost tender means 25 s of watching a purple pill. | `data.js BAL.calmTime/rivalTime`, `sim.js rivalTick` | Waiting with nothing to do. Losing feels like being punished. |
| D14 | **Two revenue streams, explained in one subordinate clause.** "Canavar parçaları da senin." appears once, in a modal. | `ui.js tenderResultHTML` | The economic logic (the city pays you to clean, *and* you keep the monster) never lands. |
| D15 | **No goal.** There is no objective, milestone or end state on screen. The README promises "dünyanın en büyük temizlik şirketi". | whole UI | "What am I trying to do?" has no answer. |
| D16 | **Selling looks like stock trading.** 8 rows with sparklines, `▲▼`, "Sat 1 / Tümü", boom badges. No buyer, no truck, no place. | `9-depot.png` | Abstract, and it disconnects selling from the parts you just cut. |

**Summary:** the problem is not missing content. The order is wrong, the visibility is wrong and the honesty is wrong. The redesign keeps about 80% of the simulation and changes when things appear, how they are shown and what the player physically does.

---

## 2. Fantasy and core loop

### One-sentence fantasy
> **"Robotlar canavarı devirir; şehri ayağa kaldıran, canavarı parça parça satan sensin."**
> (The robots bring the monster down; you get the city back on its feet and sell the monster piece by piece.)

Tagline on the title card: **"Herkes savaşı izler. Temizlik bize kalır."**

### The 4-step cycle

```
   ┌──────────── 1 DÜŞÜŞ ────────────┐
   │ Canavar bir bölgeye düşer:       │
   │ yangın, enkaz, dev bir leş.      │
   └───────────────┬──────────────────┘
                   ▼
   ┌──────────── 2 SEVK ─────────────┐
   │ Bölgeye dokun → doğru aracı yolla│
   │ (itfaiye / enkaz / kesim).       │
   │ Araç sahadan yola çıkar.         │
   └───────────────┬──────────────────┘
                   ▼
   ┌──────────── 3 TEMİZLİK ─────────┐
   │ Yangın söner → yol açılır →      │
   │ leş kesilir, sandıklar çıkar.    │
   └───────────────┬──────────────────┘
                   ▼
   ┌──────────── 4 SATIŞ ────────────┐
   │ Belediye işi öder + parçaları    │
   │ alıcıya satarsın → yeni araç al. │
   └───────────────┬──────────────────┘
                   └──────► next monster (radar)
```

Two revenue streams, always stated together: **"Belediye temizliği öder. Canavar senin."**

### First 60 seconds (target timeline, FTUE contract #1)

| t (s) | What happens | Player action |
|---|---|---|
| 0-6 | Cold open (TV broadcast of the fight, monster falls on Merkez). Skippable. | none (or tap to skip) |
| 6-10 | Municipal coordinator's call card. | **Tap "İşi al"** |
| ~12 | Merkez pulses; bubble "Merkez'e dokun." | **Tap Merkez → "İtfaiye gönder"** |
| 12-15 | Fire truck leaves the yard, drives the road, arrives. | watch |
| 15-21 | Water arc, flames shrink, steam burst. "Yangın söndü". | watch |
| ~23 | Objective switches. | **Tap Merkez → "Enkaz ekibi gönder"** |
| 26-33 | Excavator + dump truck; pile drops in 3 steps; cones lift: "Yol açık". | watch |
| ~35 | | **Tap Merkez → "Kesim ekibi gönder"** |
| 38-50 | Crane + saws; crates pop: Pul, Kemik, Magma özü; gold glint: Göz. | watch |
| ~52 | District lights back on, "TEMİZ" stamp, contract sheet. | **Tap "Ödemeyi al"** |
| ~58 | Depo tab drops in. | **Tap Depo → "Hepsini Rıza'ya sat"** |
| ~65 | Buyer van leaves the yard, cash rolls up. | done: first full loop |

**Targets:** first meaningful tap ≤ 12 s; parts in hand ≤ 50 s; first sale ≤ 75 s; ≤ 40 words of reading before the first dispatch (title line + call card + bubble + objective = 35 words).

---

## 3. Guided first session (FTUE)

### Principles
1. **One highlighted action at a time.** Everything else stays visible but dimmed to 40%, and taps on dimmed UI do nothing (no error toast).
2. **Guidance is a person, not the system.** A recurring NPC, **Nevin Aksoy, Belediye Afet Koordinatörü**, speaks in short lines on a small portrait card (bottom-left, max 2 lines, auto-hides after 4 s or on tap). The system itself only speaks through the objective bar and pointer bubbles.
3. **Teach by consequence.** The disabled buttons *are* the tutorial ("Yangın sönmeden giremez").
4. **No timers or failure in contract #1.** A deadline is shown but it is generous (2:00 for ~45 s of work), so the bar always ends in the gold zone and the player sees the "Erken teslim" stamp the first time.
5. **Resume-safe.** The current FTUE step is saved (`progress.ftue`). Reloading resumes at the same step, and a half-done district stays half-done.

### Screen layout during FTUE (390×844)
```
┌─────────────────────────────────┐ safe-area
│ 1,5 Mn ₺        [TESLİM 2:00] ⚙ │ HUD (48 px)
│ Hedef: Merkez'deki yangını söndür│ objective bar (36 px)
├─────────────────────────────────┤
│                                 │
│     3D city (≈56% of height)    │
│   districts + yard at bottom    │
│                                 │
├─────────────────────────────────┤
│ bottom panel (phase-dependent)  │ ≈200 px
├─────────────────────────────────┤
│ [Şehir]  (other tabs hidden)    │ tab bar, progressive
└─────────────────────────────────┘
```

### Step-by-step script

Copy is final Turkish. "→" means the step completes when that happens.

**Step 0 · Cold open (skippable, 6 s)**
- Screen: the 3D city at dusk, letterboxed, with a TV "CANLI · AFT HABER" bug top-left and a lower-third "Magmadon Liman açıklarında". Defense drones (see §8 note) cable the monster. It topples onto **Merkez**. Impact shake, dust. Letterbox slides away. Title card fades in for 1.2 s:
  - **AFTERMATH**
  - "Herkes savaşı izler. Temizlik bize kalır."
- Highlight: none. A tap anywhere skips to step 1.
- Audio: existing attack sequence (siren, footsteps, roar, jets, laser, impact) as it is now.

**Step 1 · The call**
- Screen: call card slides up from the bottom (not a full modal; the city stays visible above it). Portrait: Nevin (simple flat illustration or initials avatar "NA").
- Text:
  - "Aftermath? Nevin Aksoy, Belediye Afet Koordinasyon."
  - "Canavar Merkez'e düştü. Yangın var, yol enkazla kapalı."
  - "İlk iş sizin, pazarlığa vakit yok: 900 bin lira."
- Single button: **İşi al** → contract created (`pay 900, deadline 120 s`).

**Step 2 · First dispatch: fire**
- Screen: camera eases to frame Merkez and the yard (0.8 s). Merkez gets a pulsing orange outline. The in-world chip over Merkez shows a full orange bar with a flame icon. A pointer bubble above Merkez says **"Merkez'e dokun."**
- Objective: **Hedef: Merkez'deki yangını söndür**
- Tap Merkez → action sheet (see §5.4) slides up:
  - **İtfaiye gönder**, sub-label "1 araç hazır" (primary, pulsing)
  - Enkaz ekibi, sub "Yangın sönmeden giremez" (disabled)
  - Kesim ekibi, sub "Önce yol açılmalı" (disabled)
- → Tap "İtfaiye gönder": the sheet closes, the yard gate opens, the truck drives out with flashing lights, a dashed route line draws along the road to Merkez, and a chip "Yolda · 3 sn" floats over the truck.
- While extinguishing, Nevin card: **"Yangın sönmeden kepçe girmesin. Kural bu."**
- → Fire reaches 0: steam burst, the chip bar wipes from orange to tan (rubble), and the first stage dot fills. Chip text "Yangın söndü" for 1.2 s. The truck drives back to the yard.

**Step 3 · Rubble**
- Objective: **Hedef: Enkazı kaldır, yolu aç**
- Bubble: **"Merkez'e tekrar dokun."**
- Sheet: Enkaz ekibi is now primary ("2 araç hazır"). İtfaiye shows "Bu bölgede yangın yok".
- → Rubble reaches 0: traffic cones pop away, lane markings fade back in, chip text "Yol açık", and the second dot fills.

**Step 4 · Carving**
- Objective: **Hedef: Canavarı parçala**
- Sheet now shows an extra info line on the carcass row: **"Çıkacaklar: pul, kemik, magma özü. Kafada göz var."**
- → Tap "Kesim ekibi gönder". Crane truck arrives, tarps go up, saw sparks. Each yield unit pops a crate on the truck, and an icon flies from the district to the bottom-left of the screen, where the Depo tab will appear. Counter bumps.
- Nevin card at the first crate: **"Parçalar sizin. Belediye temiz sokak istiyor, o kadar."**
- Head finished: slow-mo 0.4 s, gold glint, larger card **"Nadir parça · Göz"**.
- FTUE yields are **scripted, not random**: Pul 3, Magma özü 2, Kemik 2, Göz 1.

**Step 5 · Delivery**
- District clean: windows light up in a wave, two civilian cars drive in, and a green "TEMİZ" stamp lands on the chip, which then fades.
- Camera pulls out to the whole city (1.2 s). The contract sheet slides up (bottom sheet, not a modal):
  - Title: **Merkez teslim edildi**
  - Stamp: **ERKEN TESLİM** (gold)
  - Rows: "Süre 0:48 / Söz 2:00" · "Ödeme 900 bin ₺" · "Erken teslim primi 225 bin ₺" · "Güven +8"
  - Button: **Ödemeyi al** → cash rolls up in the HUD (1,5 Mn → 2,6 Mn ₺).

**Step 6 · First sale**
- Unlock animation: the **Depo** tab drops into the tab bar with a "Yeni" pill.
- Objective: **Hedef: Parçaları sat**
- Bubble on the tab: **"Parçalar depoda."**
- Depo screen: stock grid (4 item tiles with counts) and one buyer card:
  - **Hurdacı Rıza** · "Ne getirirsen alırım. Fiyatı ben söylerim."
  - Button: **Hepsini Rıza'ya sat · 472 bin ₺** (60% of base: 3×24 + 2×15,6 + 2×19,2 + 330; Rıza's per-unit price drop is off during the FTUE so the number on the button is exact)
- → Sell: in-world, Rıza's van pulls into the yard, crates load, the van leaves. Coins arc from the button to the HUD cash, roll-up.
- Rıza card line: **"Göze iyi para verdim, haberin olsun."**
- Small grey line under the card, shown permanently: "Rıza piyasanın altında öder. Daha iyi alıcılar ileride çıkar."

**Step 7 · First purchase (closes the loop)**
- Unlock animation: **Şirket** tab drops in.
- Objective: **Hedef: İkinci itfaiye aracını al**
- Şirket screen, Filo section: card **İtfaiye aracı · 680 bin ₺** with sub-text "İki araçla yangın iki kat hızlı söner." Button **Satın al** (pulsing).
- → Purchase: a new truck drives into the yard and parks, with a short horn (`buy` sfx).
- Nevin card: **"Radar yeni bir sinyal aldı. Bu sefer iki bölge."**
- HUD timer chip switches to **RADAR 0:40**.
- Objective: **Hedef: Sıradaki saldırıya hazırlan**
- FTUE flag `progress.ftue = 'done'`. Total reading so far is about 120 words across about 3 minutes.

### Light guidance for contracts #2 and #3 (no forced steps)

**Contract #2 (direct award, 3 districts):** call card:
"Kafa Merkez'de, gövde Park'ta. Eski Çarşı'da da enkaz var. Süre 2 dk 10 sn; erken biterse prim öderiz." Button **İşi al**.
- First time the deadline bar appears with zones, a one-shot tooltip on the HUD timer says: **"Altın bölgede bitirirsen %25 prim."**
- First fire-spread threat (scripted: Park's fire is the only one ≥70% and unattended for 8 s): the neighbour district gets a red pulsing outline and a 5 s countdown ring. Chip: **"Sıçramak üzere"**. Nevin: **"Park'taki yangın Eski Çarşı'ya sıçramak üzere."**
- A pointer bubble shows only if the player is idle for 8 s with a free vehicle and an available job. It points at the highest-priority district (fire > rubble > carcass).

**Contract #3 (first tender):** see §7. Guided with 3 bubbles, then the player chooses freely.

---

## 4. Progressive unlocks: the "Hedef" chain

The objective bar always shows one line. **Priority:** an active contract objective beats the FTUE step, which beats the current goal in the chain. Each goal completion plays the unlock animation and grants its reward.

| # | Goal (Hedef text) | Trigger to complete | Unlocks / reward |
|---|---|---|---|
| G1 | Merkez'deki yangını söndür → Enkazı kaldır → Canavarı parçala | FTUE steps 2-4 | — |
| G2 | Parçaları sat | first sale | **Depo** tab (appears at step 6) |
| G3 | İkinci itfaiye aracını al | own ≥2 fire trucks | **Şirket** tab, radar timer |
| G4 | İkinci işi teslim et | contract #2 delivered (late counts too, so progression never blocks) | **Fabrika** tab, recipe *Kemik beton*, +200 bin ₺ |
| G5 | Fabrikada ilk kemik betonu üret | first job finished | Tenders begin (contract #3 is a tender) |
| G6 | Süpürge Holding'i bir ihalede yen | first tender won | **Bakım sözleşmeleri** (tap a district in calm) |
| G7 | Bir bölgenin bakımını üstlen | first upkeep signed | offline income + "welcome back" card enabled |
| G8 | 4. sözleşmeyi tamamla | stats.contracts ≥ 4 | **Alıcılar** (buyer offers, price swings, booms), recipe *Zırh plakası* |
| G9 | Bir alıcıya 5 parça sat | 5 units sold to offers | recipe *Enerji hücresi* |
| G10 | Bir işi altın bölgede bitir | contract with ratio ≤ 0.75 (excluding #1); fallback: stats.contracts ≥ 6 | **Ekipman** upgrade + 2nd factory line |
| G11 | Filoda 3 kesim ekibi olsun | crews.carve ≥ 3; fallback: stats.contracts ≥ 8 | **Vardiya şefi** (auto-dispatch, purchasable), factory auto-repeat, recipe *Müze eseri* |
| G12 | 7. sözleşmeyi tamamla | contract #7 | first DNA guaranteed in the head ("Kafatasından etiketsiz bir tüp çıktı.") |
| G13 | Plakasız araca bir cevap ver | buyer decision | mutant arc (if sold), regular DNA chance 25%/head afterwards |
| G14 | Güveni 80'e çıkar | trust ≥ 80 | +1 district upkeep tier cap (3 → 4) |
| G15 | Altı bölgenin bakımını da üstlen | all 6 upkeep ≥1 | chapter end: "Şehir senin." summary card; roadmap hook for city 2 |

Pacing target: one unlock every 2-4 minutes for the first 30 minutes. The secret buyer appears around minute 25-30.

---

## 5. Interaction model: 3D city on a phone

### 5.1 City layout (recommended for portrait)
Switch the district topology from 3×2 to **2 columns × 3 rows**. That fits a portrait view, and the yard sits at the near edge, so vehicles visibly drive *up* into the city. Keep sector ids stable for code/save sanity and add `col,row` to `SECTORS` (neighbors computed from positions).

```
     ~~~~~~~~~~~~~~ körfez ~~~~~~~~~~~~~~
  ~~ ┌────────────┬────────────┐
  ~~ │ LİMAN (0)  │ SANAYİ (3) │   row 0 (far)
  ~~ ├────────────┼────────────┤
  ~~ │ ESKİ ÇARŞI │ MERKEZ (1) │   row 1
     │    (5)     │            │
     ├────────────┼────────────┤
     │ PARK (4)   │ FİNANS (2) │   row 2 (near)
     └────────────┴────────────┘
     ═════════ çevre yolu ═════════
     [ AFTERMATH SAHASI: garaj · depo · fabrika · kapı ]
```
- Roads are real road tiles between blocks: one vertical avenue, two horizontal streets and a ring road along the yard. Vehicles path along a small road graph: intersection nodes plus one entry node per district.
- Travel time: `1.5 s + 1.0 s × rowDistance + 0.6 s × colChange` from the vehicle's current node. That gives 2.5-4.5 s, which is short enough not to frustrate but long enough to read as driving.
- The yard is part of the scene: parked vehicles (one model per owned unit, up to ~8 visible), crate stacks (stock), the factory shed with a progress glow, and a gate. Buyer vans arrive here.

### 5.2 Camera
- **Orthographic**, pitch ≈ 50-55°, yaw 0-15°. Districts stay near-rectangular on screen and the same size at every row, so tap targets are equal. The yard sits at the bottom edge of the view.
- Pinch zoom with two stops: *Şehir* (whole map) and *Bölge* (≈1.6×, auto-applied when a district is selected and released on close). One-finger pan only when zoomed, clamped to map bounds.
- Camera moves are always eased (0.6-0.8 s, ease-in-out cubic) and never instant. Screen shake only on monster impact and on the tender stamp (tiny).

### 5.3 Tap targets
- Raycast the tap onto the ground plane → district id from the grid, or yard if below the ring road. A tap anywhere inside a district block counts (≥ 120×120 CSS px each).
- Tap the yard → opens the Depo tab (shortcut). Tap a vehicle → selects its district.
- Two ways to dispatch, both supported: (a) tap a district → action sheet → vehicle button; (b) tap a vehicle card in the fleet strip → districts that accept it glow → tap a district.

### 5.4 District action sheet (contract phase)
Slides up over the bottom panel (200 ms ease-out). The city view stays visible and the selected district is outlined.

```
┌──────────────────────────────────────┐
│ MERKEZ                          [✕]  │
│ ●──○──○   Yangın → Enkaz → Kesim     │  stage dots
│                                      │
│ [flame] Yangın    ▮▮▮▮▯▯   %62   1 araç│
│ [rubble] Enkaz    ▮▮▮▮▮▮   14 ton     │
│ [carcass] Kafa    ▮▮▮▮▮▮   12 ton     │
│   Çıkacaklar: pul, kemik, göz         │
│                                      │
│ [ İtfaiye gönder        1 hazır ]    │  primary
│ [ Enkaz ekibi   Yangın sönmeden giremez ]│ disabled
│ [ Kesim ekibi   Önce yol açılmalı ]   │ disabled
│                     Geri çağır (1)    │  text button
└──────────────────────────────────────┘
```
- Buttons are ≥ 48 px tall and full width. A disabled button keeps its reason visible. Tapping it shakes it (6 px × 3, 200 ms) and plays `error`.
- The sheet stays open after a dispatch for 150 ms (the button flashes) and then closes, so the player sees the truck leave.
- Calm phase: the same tap opens the **upkeep sheet** (after G6): "Merkez · Bakım sözleşmesi · Kademe 1 · 72 bin ₺/dk · Kademe 2'ye çıkar: 650 bin ₺". It is the same gesture with different content.

### 5.5 In-world progress (HTML overlays anchored to 3D points)
Implement as absolutely positioned HTML elements whose screen position is projected from a 3D anchor each frame (≤ 30 Hz). Text stays crisp and the elements stay cheap and accessible. **No 3D text.**

**District chip** (one per district, ≤ 96 px wide, anchored above the block):
- Line 1: district name (12 px, semibold).
- Line 2: **one bar = the current blocking task only**: orange = fire, tan = rubble, deep red-violet = carcass. With nothing left, a green check, and the chip fades after 2 s.
- Line 3: three stage dots (fire, rubble, carcass); filled = done, hollow = pending, absent = not in this district.
- Badge: number of vehicles working there (vehicle glyph + "×2").
- States: **needs attention** (work and no vehicle): orange outline pulse at 1 Hz. This replaces the "!" badge. **Spreading**: red outline + 5 s countdown ring. **Paused** (fire spread in): bar striped.

**Vehicle chip:** only while driving, "Yolda · 3 sn", anchored above the vehicle, and it disappears on arrival.

**Float texts:** "+3 Pul", "Yol açık", "Yangın söndü", "TEMİZ". Max 3 on screen, 900 ms, rise 24 px, no emoji.

### 5.6 HUD (max 3 numbers)
```
[ 2,6 Mn ₺ ]   [ TESLİM 1:42 ▰▰▰▱ ]   [⚙]
```
1. **Cash** (always), tabular numerals, rolls on change, flashes green on gain and red on spend.
2. **Phase chip** (one timer, depends on phase):
   - calm: `RADAR 0:40`, plus a thin bar that fills as the threat approaches
   - attack: `ALARM` (red, no number)
   - tender: `İHALE`
   - contract: `TESLİM 1:42`, with the 3-zone bar (gold = early-bonus zone up to 75% of deadline, white = on time, red = late). After the deadline: `GECİKME +0:12` in red.
   - rival: `SÜPÜRGE ÇALIŞIYOR` with a bar
3. **Objective progress**, inside the objective bar, only when the goal is countable: "Hedef: Şehri temizle · 2/4 bölge".

Not in the HUD: reputation/trust (shown in tender + Şirket), passive income (shown as a "+72 bin ₺ · bakım" float near the cash every 10 s once unlocked), crew pool (shown in the fleet strip).

The gear ⚙ opens settings: Efektler, Müzik, Haber arşivi, Oyunu sıfırla.

**Objective bar** (always visible under the HUD, 36 px): "Hedef: …". Tap → a short popover with the reward ("Ödül: Fabrika").

**News line:** move the ticker *into* the objective bar's second state. A headline replaces the objective text for 5 s when it arrives (fade 200 ms), then the objective returns. No marquee. Tap the bar → news archive. Headlines are ≤ 56 characters (one line).

### 5.7 Bottom panel by phase

| Phase | Bottom panel content | Primary action |
|---|---|---|
| **Calm (Hazırlık)** | "Sıradaki iş" card: radar ETA + monster type silhouette. Below it, one *suggestion card* chosen by priority: unsold parts → "Depoda 8 parça var · Sat"; idle factory line → "Fabrika boş · Üret"; affordable useful purchase → "Kesim ekibi al · 900 bin ₺"; upkeep available → "Merkez bakımını al". After G4: "Sıradaki işe geç" text button (skips the radar). | the suggestion's button |
| **Attack** | Panel collapses (city goes full height, letterbox). Tap to skip after the first time. | none |
| **Call / tender** | Call card (direct award) or tender sheet (§7) covering the panel. | İşi al / Teklifi gönder |
| **Contract** | **Fleet strip**: 3 vehicle cards (İtfaiye / Enkaz / Kesim), each "2 hazır / 3"; a card glows when there is a job it can do. Below it, contract line: "Ödeme 1,39 Mn ₺ + parçalar". District sheet replaces the strip when a district is selected. | dispatch |
| **Rival (lost tender)** | "Kuyruk sende" card: tail district highlighted, its carcass bar, "Ücret yok, parçalar senin." Fleet strip as in contract. | dispatch to the tail |
| **Result** | Result sheet with stamp (see §8), 1 button. | Ödemeyi al |

### 5.8 Tabs (progressive)
`Şehir` only, then `+ Depo` (FTUE step 6), `+ Şirket` (step 7), `+ Fabrika` (G4). Tabs use SVG icons + label, no emoji. A red dot means "action available": unsold parts with a better offer, idle line, affordable vehicle. At most one dot at a time, highest priority wins.

---

## 6. Systems: keep, merge, cut, defer

### 6.1 Decision table

| v1 system | Problem | v2 decision |
|---|---|---|
| Reputation ⭐ in HUD | unexplained; only feeds the tender | Rename **Güven** (0-100). Remove from HUD. Show in tender reveal and Şirket. Gains: early +8, on time +4. Loss: late −6, scandal −8. |
| Anger % (`contract.anger`) | second pressure meter duplicating the deadline | **Cut.** The deadline zones carry the pressure. Lateness costs pay and Güven. |
| District levels 0-5 + passive income from start + level loss on impact | shown first; abstract; income drops with no explanation; dashed empty lots look like missing art | **Defer to G6** as **Bakım sözleşmesi** per district, tiers 0-3 (G14 → 4). A damaged district **pauses** its upkeep until cleaned (no permanent loss); its chip shows "Bakım durdu". In-world: company sign on the block, more lit windows, street lights and trees per tier. No placeholder outlines. Start at 0 upkeep everywhere. |
| Crew `−/+` steppers | off-screen, fiddly | **Replace** with the action sheet + fleet strip; one tap = one vehicle. "Geri çağır" recalls one. |
| ⚡ Otomatik | removes the core decision from minute one | **Cut early; return at G11** as purchasable **Vardiya şefi** ("Boştaki araçları en yakın işe kendisi yollar."). Automation becomes a reward. |
| Fire slows others to 30% | soft, invisible | **Hard rule:** while a district burns, rubble and carving crews cannot enter. Any working there pull back (the bar goes striped) if fire spreads in. |
| Rubble and carving independent | no sequence | **Sequence per district: yangın → enkaz → kesim.** "Enkaz yolu kapatıyor; vinç giremez." Districts with no carcass end at rubble. The puzzle becomes allocation *across* districts with a limited fleet. |
| Crew counts per sector | crews cannot travel | **Vehicles become entities** (`fleet[]`, see §10) with travel state. A vehicle becomes free the moment its task ends and can be re-dispatched from wherever it is. |
| Storage cap + "Depo dolu, parçalama durdu" | blocks the core verb mid-contract | **Cut.** Selling pressure comes from offers expiring and Rıza's price dropping per unit. |
| 8-item random-walk market, per-unit elasticity, sparklines, booms | stock-ticker UI | **Early:** Hurdacı Rıza, a flat 60% of base × slow drift (±15%), −1% per unit sold within 60 s, recovering. **After G8: Alıcılar**, 2-3 offer cards (buyer, item, quantity, unit price, expiry 60-120 s). Booms *become* high-multiplier offers with a headline. The internal `market[k].m` stays as the drift source. |
| Factory: 4 recipes, auto toggles, line upgrades from start | overload | **Unlock at G4** with *Kemik beton* only. Recipes unlock via G8/G9/G11. Auto-repeat at G11. 2nd line at G10. |
| Upgrades: speed / storage / factory | storage cut | **Ekipman** (speed, G10), **Fabrika hattı** (G10). Vehicles bought in Filo. |
| Tender before the first cleanup; rigged 100%; odds mismatch | confusing and dishonest | **Tender from contract #3.** 3×3 heat-map with fleet estimate. **Honest odds:** roll `Math.random() < shownChance`, then sample a rival bid consistent with the outcome for the reveal (§7). |
| Rival phase (25 s watching) | dead time | **"Kuyruk sende":** the rival takes the contract, but the tail segment is handed to you (no pay, no deadline, parts yours). Rival vehicles in purple livery visibly work the other districts. On completion the rival dump stays, shown as "Rıza pul fiyatını düşürdü" and an offer price drop. |
| Calm 75 s + Hızlandır | waiting | **Calm = Hazırlık**, 35 s for contracts #2-#4, 45 s later, 60 s once upkeep and offers exist (there is more to do). "Sıradaki işe geç" after G4. |
| Intro modal (47 words) | wall of text | **Cut.** Cold open + call card. |
| Result modal + "Harika" | text-only dead end | Bottom sheet with stamp + breakdown + one button "Ödemeyi al". |
| Offline income modal | fine | Keep, only after G7. Copy rewritten. |
| DNA (40%/head from contract 1) + secret buyer + mutant | a good hook, but random and too early | **Defer:** guaranteed first DNA at contract #7, 25%/head afterwards. Buyer visit on the next calm. Mutant arc unchanged. |
| Loss-streak pity | invisible fairness | Keep, internal. |
| News ticker (marquee) | unreadable | One headline at a time inside the objective bar (§5.6). |
| Stats card, sound card, reset | fine | Stats → bottom of Şirket; sound + reset → ⚙ settings. |

### 6.2 Resulting rules sheet (what a player should be able to say after 5 minutes)
1. Canavar düşünce belediye temizlik işi verir (önce doğrudan, sonra ihaleyle).
2. Bir bölgede sıra hep aynı: yangın, enkaz, kesim.
3. Sönmeyen yangın komşu bölgeye sıçrar.
4. Söz verdiğin sürede bitirirsen ödemeni alırsın. Altın bölgede bitirirsen prim alırsın, geç kalırsan kesinti yersin.
5. Canavarın parçaları senin. Sat ya da fabrikada işleyip daha pahalı sat.
6. Parayla araç alırsın. Araç çoksa iş hızlanır, ihalede daha kısa süre söz verebilirsin.

### 6.3 Balance starting points (to tune with a playtest script)

| Contract | Type | Districts (chain + extra) | Fire | Rubble | Carcass | Expected fleet (F/D/C) | Target clean time | Deadline |
|---|---|---|---|---|---|---|---|---|
| #1 | FTUE, direct | 1 (Merkez, head only) | 30 | 14 t | 12 t | 1/2/1 | ~45 s | 2:00 |
| #2 | direct | 2 + 1 | 2 × 50 | 70 t | 50 t | 2/2/1 | ~1:45 | 2:10 |
| #3 | first tender | 2 + 1 | 2 × 70 | 100 t | 70 t | 2/2/1-2 | ~2:00 | matrix |
| #4+ | tender | v1 formula (`attackLevel` scaling) | v1 | v1 | v1 | growing | 2-3 min | matrix |

- Rates: fire 5/s, rubble 2.2 t/s (v1), **carve 1.1 → 1.4 t/s**, so carving is not a 70 s bottleneck in #2.
- Fire spread: only from fires ≥70% that have been unattended for ≥10 s. 5 s visible warning, then the spread. Spread fire = 35 (v1).
- Contract pay v1 formula (`baseContract 1200 …`) unchanged from #3. Display ×1000 as ₺ (see §9).
- Vehicle costs: v1 `crewCost` (base × 1.5^n) unchanged. FTUE money check: 1500 + 900 + 225 bonus + 472 sale = 3097, minus the 680 truck = 2417. Enough for the next purchase after #2.

---

## 7. Tender redesign

### 7.1 Goals
The player should *see* the trade-off (price vs deadline vs win chance) in one glance and know whether their fleet can keep the promise. The result should explain *why* they won or lost.

### 7.2 Layout (full-height sheet, city dimmed behind)
```
┌──────────────────────────────────────┐
│ Temizlik ihalesi · Liman–Merkez      │
│ [flame]2 yangın  [rubble]100 ton  [carcass]70 ton │
│ Filonla tahmini süre: 1:50 (1:40–2:00)│
│                                      │
│            Fiyat →                   │
│          İndirimli  Liste   Yüksek   │
│ Süre  ┌─────────┬─────────┬─────────┐│
│ Hızlı │ 1,04 Mn │ 1,39 Mn │ 1,74 Mn ││  hatched = deadline
│ 1:31  │  %97 ▨  │  %80 ▨  │  %50 ▨  ││  shorter than estimate
│       ├─────────┼─────────┼─────────┤│
│Normal │[1,04 Mn]│ 1,39 Mn │ 1,74 Mn ││  [ ] = selected
│ 2:09  │  %86    │  %56    │  %26    ││
│       ├─────────┼─────────┼─────────┤│
│ Rahat │ 1,04 Mn │ 1,39 Mn │ 1,74 Mn ││
│ 3:01  │  %54    │  %24    │  %3     ││
│       └─────────┴─────────┴─────────┘│
│ Rakip: Süpürge Holding · Güven 45    │
│ "Genelde liste fiyatı, normal süre." │
│                                      │
│ Kazanırsan 1,04 Mn ₺ + parçalar      │
│ Şans %86 · Söz 2:09 · Tahminin 1:50  │
│ [          Teklifi gönder          ] │
└──────────────────────────────────────┘
```
- **Cell colour = win chance:** ≥70% green, 40-69% amber, <40% red (fill at 35% opacity, so the text stays readable). The number is always printed too (colour-blind safe).
- **Hatching** marks cells whose promised deadline is shorter than the fleet estimate's upper bound. Legend under the grid: "Taralı: tahmini süren bu sözden uzun".
- The **fleet estimate** comes from a fast deterministic dry-run of greedy dispatch (the old `autoAssign` heuristic) over the current damage, in 0.5 s steps, plus travel times. It is shown as a range ±10%. This is the key information v1 never gave.
- Multipliers stay as in v1: price ×0.75 / 1.0 / 1.25, deadline ×0.7 / 1.0 / 1.4. Score formula from v1 `scoreFor(trust, bid, speed)` vs the rival's *declared tendency* (default bid 0.98, speed 1.05; after 2 rival losses: 0.9 / 0.95 "Süpürge Holding bu sefer iddialı").
- **Honest resolution:** `win = Math.random() < chance(cell)`. For the reveal, sample a rival bid/speed from the rival's distribution by rejection until its score agrees with `win`.

### 7.3 Reveal (2.5 s, then result line)
Two envelopes slide in (yours on the left, Süpürge's on the right) and open. Three rows fill in sequence (300 ms each), with bars compared side by side:
- **Fiyat** (cheaper is better), **Süre** (shorter is better), **Güven**.
Then the total score bars, and the stamp slams on the winner: **KAZANDIN** (green) or **SÜPÜRGE HOLDİNG** (purple). The player can read which factor decided it.

### 7.4 First tender (contract #3), guided
- Pre-selected cell: the highest pay with chance ≥ 60% and no hatching. Tag: "Önerilen".
- Three sequential bubbles (tap to advance), max 12 words each:
  1. On the grid: **"Her kutu bir teklif. Yeşil kolay kazanır, az kazandırır."**
  2. On the estimate line: **"Filonla bu iş 1:50 sürer. Daha kısa söz verme."**
  3. On the rival card: **"Süpürge Holding genelde liste fiyatı verir."**
- Picking a red cell (<40%) asks once: **"Kazanma şansın %24. Yine de gönderilsin mi?"** [Gönder] [Vazgeç].
- If the player loses anyway, "Kuyruk sende" (§6.1) keeps them playing, and Nevin says: **"Bu sefer olmadı. Kuyruğu almadılar; isterseniz sizin."** Button: **Kuyruğu al**.

---

## 8. Moment-to-moment juice

General motion rules: UI transitions 150-250 ms ease-out cubic. Number roll-ups 600-800 ms. Only one attention pulse on screen at a time (the objective target). Overshoot only on stamps (scale 1.15 → 1.0, 180 ms). Particle cap 300. Existing sfx names from `audio.js` are in `code`. "New" means a small procedural addition in the same style as `audio.js`.

| Trigger | Visual | Timing | Audio | Haptic |
|---|---|---|---|---|
| **Monster impact** (attack) | Letterboxed "CANLI" broadcast. Drones cable the monster, it topples onto the chain districts. Dust ring expands from each landing point (24 particles each), buildings in the chain swap to damaged variants, fires ignite with a flash. | 6 s first time, 3.5 s later; tap to skip after the first | existing attack sequence (`impact`, siren, roar) | `vibrate([90,40,180])` (v1) |
| **Call card** | Slides up from the bottom, portrait fades in. | 250 ms | `radar` (radio blip) | — |
| **Dispatch** | Button flash; yard gate swings open; vehicle pulls out with roof lights (fire: red/blue alternating 4 Hz; others: amber); a dashed route line draws along the road (dash offset animates) and fades after 1.5 s; "Yolda · 3 sn" chip. On arrival: brake pitch (3° forward, back in 200 ms), stabilisers/outriggers out, work loop starts. | departure 300 ms; travel 2.5-4.5 s | New `dispatch` (engine rev + one siren chirp for fire trucks). Existing engine/water ambient loops then take over. | 10 ms |
| **Extinguishing** | Water arc from truck to flames (blue-white particle stream, 20/s). Flame meshes scale with `fire/initial`. Smoke turns from dark to white steam below 25%. | continuous | existing `water` + fire crackle ambient | — |
| **Fire out** | Steam burst (12 white particles, rise 1.2 s), last flame shrinks to 0 in 250 ms, smoke column stops. Chip bar wipes orange → tan (200 ms), stage dot 1 fills with a pop. Float "Yangın söndü". If the sheet is open, the Enkaz button turns primary with one pulse. Truck reels hose (0.5 s) and drives back. | 1.2 s | New `hiss` (0.4 s highpass noise) then `done` | 15 ms |
| **Rubble work** | Excavator arm loop (1.2 s cycle), dump truck shuttles to the map edge and back (visible trips), dust puff on each scoop (6 particles). Pile mesh shrinks in **3 discrete steps** at 66/33/0%, each with a thud + 8 dust particles. | per step | existing reverse-beep ambient; thud = low noise burst | — |
| **Road open** (rubble 0) | Traffic cones/barriers scale to 0 one by one (staggered 80 ms), lane markings fade in (300 ms), float "Yol açık". Chip dot 2 fills. | 600 ms | `done` | 15 ms |
| **Carving** | Crane truck parks, tarp walls rise (300 ms), saw sparks (orange, 6 particles every 0.4 s). Carcass segment loses chunks in 4 steps. Chunks lift by crane and drop onto the truck bed as crates. No red particles (replace v1 red `carve` particles: age-appropriate and less gory). | continuous | existing saw whine ambient | — |
| **Part extracted** (per unit) | Crate pops on the truck (scale 0 → 1.1 → 1, 180 ms). An HTML icon (item SVG) flies on a bezier from the district's screen point to the Depo tab (700 ms ease-in-out). The tab counter bumps (scale 1.25 → 1, 150 ms). Float "+1 Pul". | 700 ms; throttle 120 ms | `part` (throttled) | — |
| **Rare part** (Göz, DNA) | Time scale 0.35 for 0.4 s, gold ring glint at the head, a larger card "Nadir parça · Göz" anchored over the district for 1.5 s, then it flies to Depo. | 2 s | `rare` (DNA: `mystery`) | 30 ms |
| **District clean** | Windows light up in a bottom-to-top wave (0.8 s), street lights on, 2-4 civilian cars spawn at district entries and drive off along roads, chip turns into a green check + "TEMİZ" stamp, then fades after 2 s. Vehicles head back to the yard. | 2 s | `done` + soft chord (reuse `win` at low volume) | 20 ms |
| **Fire spread warning** | Target district: red outline pulsing at 2 Hz plus a 5 s countdown ring on its chip ("Sıçramak üzere"). | 5 s | 1 tick per second (short click) | — |
| **Fire spread** | Ember particles arc from source to target (8 particles, 600 ms), target ignites, any rubble/carving crews there pull back 10 m (bar striped "Durdu"). Headline in the objective bar. | 600 ms | `fireSpread` | 40 ms |
| **Deadline zones** | HUD chip bar: when the gold zone ends, a gold sparkle runs off the bar. At 90% of the deadline the chip pulses white. Past the deadline it turns red with "GECİKME +0:05". | — | at 90%: soft tick every 2 s; late: `late` once | — |
| **Contract complete** | Camera eases out to the full city (1.2 s). The result sheet slides up. Stamp slams: **ERKEN TESLİM** (gold) / **ZAMANINDA** (white) / **GECİKTİ** (red). Breakdown rows appear one by one (120 ms stagger). On "Ödemeyi al": 6 coin sprites arc to the HUD cash, roll-up. | 2.5 s | `record` / `win` / `late` (v1 mapping), `cash(true)` on collect | 30 ms |
| **Sale** | Depo: hold-to-sell on a stock tile: quantity ticks up 1 → n (accelerating), and with Rıza the unit price visibly ticks down per unit (elasticity made visible). Release → buyer van arrives at the yard (in-world, 1.5 s), crates load, van leaves. HTML: coins arc from the button to cash, roll-up. | 800 ms UI; van 3 s (non-blocking) | `cash(qty ≥ 10)` | 10 ms |
| **Factory job done** | Shed in the yard flashes its door light, a crate slides out onto the stack. Factory tab dot. | 600 ms | `factory` | — |
| **Purchase** | Vehicle drives in through the gate and parks in its bay, horn. | 2 s | `buy` | 10 ms |
| **Unlock** | New tab icon drops in from above (translateY −24 px → 0, 220 ms, slight overshoot), "Yeni" pill until first opened. Objective bar flashes once. | 400 ms | `build` | 20 ms |
| **Tender reveal** | §7.3: envelopes, 3 bars, stamp (scale 1.6 → 1.0, 180 ms, trauma 0.2). | 2.5 s | `win` / `lose` | 30 ms |
| **Disabled tap** | Button shake 6 px × 3 (200 ms), reason text brightens for 600 ms. | 200 ms | `error` | — |
| **Money change** | Roll-up, green flash (gain) or red flash (spend) on the cash chip. | 600 ms | — | — |

**Note for the 3D/art pass (monster and robots, original designs):** make the defense units *heavy-lift tri-rotor drones* ("Kalkan" class) that bring the monster down with harpoon cables. This explains why it falls in one piece onto specific districts, and avoids the humanoid-mech look. Magmadon reads best as a low, broad quadruped with basalt armour and glowing fissures along the back ("Lav Sırtlı"), not an upright reptile. As built (ARCH §20) it is a **banded lava bull**: a long, low, bull-shouldered body whose back carries eight overlapping arched basalt bands (pale worn rear lips, rust low on the flanks) with magma glowing in the seams between them, a low row of stubby vent chimneys along the spine, a heavy wedge snout capped by a faceted basalt ram plate (a battering prow), small glowing eyes under a frowning brow ridge, a jaw seam that glows from inside, thick ridged horns sweeping backward along the neck, thick legs in cooled lava sleeves and a thick banded tail that simply tapers. It must not read as any existing kaiju or game monster: no domed shell, no upward lower-jaw tusks, no rows of dorsal plates or back spikes, no tail club, no chin club. Carving then has natural "chunks": bands (Pul), ribs (Kemik), magma glands (Magma özü), head (Göz).

---

## 9. Text tone guide (Turkish UI copy)

### 9.1 Rules
1. **Address:** the UI talks to the player as *sen*. NPCs talk to the company as *siz* (Nevin is formal, Rıza is casual: "haberin olsun").
2. **Length:** sentences ≤ 12 words. Buttons 1-3 words, verb-first or verb-last, imperative ("İşi al", "İtfaiye gönder", "Sat", "Satın al", "Geri çağır", "Ödemeyi al"). One idea per card.
3. **No exclamation marks.** Not in alarms either: the alarm look comes from colour, caps and sound ("KAİJU ALARMI").
4. **No emoji in UI text.** Icons are separate SVG elements (recommend vendoring the needed glyphs from **Tabler Icons, MIT**, via npm `@tabler/icons`: flame, firetruck, bulldozer, crane, truck, bone, eye, shield, battery, bricks, building-factory-2, coin, radar, dna, clock). Record the license in `LICENSES.md`.
5. **Numbers always carry a unit:** "14 ton", "%62", "1 dk 42 sn" (sentences) / "1:42" (chips), "680 bin ₺", "2,6 milyon ₺" (sentences) / "2,6 Mn ₺" (HUD). Turkish formatting: decimal comma, dot thousands.
6. **Concrete nouns:** district names, vehicle names, people. "Merkez'deki yangın", not "bir bölgedeki tehlike".
7. **Humour lives only in news headlines and NPC lines.** It is dry, short and has no punchline marker. Instructions are plain.
8. **Errors = what + how much/why, ≤ 8 words:** "Para yetmiyor: 120 bin ₺ eksik." "Yangın sönmeden giremez." "Boşta araç yok."
9. **Turkish typography:** apostrophe before suffixes on proper nouns (Merkez'e, Süpürge Holding'i, Rıza'ya, Eski Çarşı'da). Correct İ/ı in caps (KAZANDIN, GECİKTİ, İHALE). No ellipsis drama ("…şimdilik").
10. **Banned words and patterns (they read as generated):** "Harika", "Muhteşem", "Tebrikler", "Hadi", "Efsane", "çılgınlık", "kapış kapış", "pırıl pırıl", "Unutma ki", "dünyanın en büyük", rhetorical questions, triple-adjective strings, an emoji at the start of a line, "…" endings, and "!" anywhere.

### 9.2 Currency display
Internal values stay as in v1 (balance-neutral). Display = internal × 1000 ₺. `fmtMoney(v)`: `< 1000` internal → "N bin ₺"; `≥ 1000` → "x,y milyon ₺" in text and "x,y Mn ₺" in compact contexts; `≥ 1e6` → "x,y milyar ₺" / "x,y Mr ₺". Realistic magnitudes ("1,39 milyon ₺ for a district cleanup") are part of the "less fake" feel.

### 9.3 Item and role names
| v1 | v2 display | Note |
|---|---|---|
| Parçalama Ekibi 🔪 | **Kesim ekibi** (crane truck + saws) | knife emoji gone |
| Enkaz Ekibi 🚜 | **Enkaz ekibi** (kepçe + damperli kamyon) | no farm tractor |
| İtfaiye 🚒 | **İtfaiye aracı** | |
| Kan 🩸 | **Magma özü** (per-monster display name; key stays `blood`) | less gory, fits Magmadon, makes "→ Enerji hücresi" intuitive |
| Pul 🐉 | **Pul** | SVG plate icon |
| Kemik 🦴 / Göz 👁️ | Kemik / Göz | |
| Zırh Plakası, Enerji Hücresi, Kemik Beton, Müze Eseri | Zırh plakası, Enerji hücresi, Kemik beton, Müze eseri | sentence case |
| ⭐ itibar | **Güven** | |
| Bakım sözleşmeleri (stars) | **Bakım sözleşmesi · Kademe 1-3** | |

### 9.4 Rewrites of existing strings

| Where | v1 | v2 |
|---|---|---|
| Intro modal | "Dev canavarlar şehre saldırıyor, savunma robotları onları yere seriyor…" (47 words) + "Şirketi kur" | removed; cold open + "Herkes savaşı izler. Temizlik bize kalır." |
| Status calm | "SAKİN · Sonraki saldırı 0:07" | "RADAR 0:40" |
| Hint calm | "🌆 Şehir sakin... şimdilik." | (objective) "Hedef: Sıradaki saldırıya hazırlan" |
| Hint cleanup | "👆 Bir bölgeye dokun ve ekip ata ya da ⚡ Otomatik'e bas." | "Hedef: Park'taki yangını söndür" + pointer on Park |
| Hint fire | "🔥 Yangın olan bölgede ekipler %70 yavaş çalışır. Önce itfaiyeyi gönder!" | button reason: "Yangın sönmeden giremez" |
| Toast storage | "📦 Depo dolu! Parçalama durdu — sat ya da işle." | removed (no cap) |
| Toast money | "Yetersiz bakiye" | "Para yetmiyor: 120 bin ₺ eksik." |
| Toast no work | "Bu bölgede bu iş yok" | button reason: "Bu bölgede yangın yok" |
| Toast auto | "⚡ 3 ekip sahaya yollandı" | (Vardiya şefi, later) "Vardiya şefi 3 aracı yola çıkardı." |
| Tender title | "📝 Temizlik ihalesi" | "Temizlik ihalesi · Liman–Merkez" |
| Tender help | "Düşük fiyat ve hızlı teslim sözü şansını artırır, ama daha az kazanırsın…" | grid + legend "Taralı: tahmini süren bu sözden uzun" |
| Tender win | "💪 İhale senin!" + "Temizliğe başla" | stamp **KAZANDIN**, button "İşe başla" |
| Tender lose | "😤 Süpürge Holding kazandı" | stamp **SÜPÜRGE HOLDİNG**; Nevin: "Bu sefer olmadı. Kuyruğu almadılar; isterseniz sizin." Button "Kuyruğu al" |
| Result titles | "🏆 Rekor temizlik!" / "✅ Zamanında teslim" / "😬 Geç kaldın" + "Harika" | stamps **ERKEN TESLİM** / **ZAMANINDA** / **GECİKTİ** + "Ödemeyi al" |
| Result tip | "Şimdi parçaları Fabrika'da işle, Depo'dan sat ve bakım sözleşmelerine yatırım yap. Sıradaki saldırı yolda..." | removed; the next suggestion card does this job |
| Offline | "👋 Tekrar hoş geldin! Sen 3 saat yokken bakım sözleşmelerin 💰5.400 kazandırdı." + "Topla" | "Sen yokken bakım sözleşmeleri 5,4 milyon ₺ getirdi." + "Kasaya al" |
| DNA found | "🧬 Nadir bir DNA örneği buldun..." | "Kafatasından etiketsiz bir tüp çıktı. Depoya kaldırıldı." |
| Secret buyer | "🕴️ Gizli alıcı · Siyah bir araba şirketin önünde duruyor…" + "Reddet, bağışla" / "Sat" | Title "Depo kapısında plakasız bir araç". Body: "Tüpü istiyorlar. 4,2 milyon lira, nakit." / "Kim olduklarını söylemiyorlar." Grey: "Haber sızarsa güven kaybedebilirsin." Buttons: "Üniversiteye bağışla" / "Sat" |
| Factory row | "Elinde 1/5 🐉 · Ham 💰210 → Ürün 💰331 (+58%)" | "5 pul → 1 zırh plakası · 20 sn" / "Ham satarsan 210 bin ₺, işlersen 330 bin ₺" |
| Depo help | "Satış yaptıkça o ürünün fiyatı düşer, zamanla toparlanır. Fiyat yükselişlerini kolla!" | Rıza card sub-line: "Çok satarsan fiyatı düşürür. Bir dakikada toparlar." |
| Skip | "⏩ Hızlandır" / "⏩ Radar hızlandırıldı" | "Sıradaki işe geç" (no toast) |
| Reset | "Oyunu sıfırla? Tüm ilerlemen silinir. Bu geri alınamaz." | "Şirketi kapat? Tüm ilerleme silinir, geri alınamaz." Buttons "Vazgeç" / "Sil" |

### 9.5 News headline bank (≤ 56 characters = one line at 13 px on a 390 px screen; dry; no emoji, no "!")
Event-bound (replace v1 `news()` strings):
- Attack: "Magmadon Liman açıklarında. Kalkan dronları havalandı."
- Mutant: "Uzmanlar gelen canavarın rengini doğal bulmuyor."
- Won tender: "Temizlik ihalesi Aftermath'in. Söz: 2 dk 09 sn."
- Lost tender: "İhale Süpürge Holding'e gitti. Kuyruk Aftermath'e kaldı."
- Early: "Şehir 1 dk 30 sn'de temizlendi. Belediye alışmasın."
- On time: "Aftermath sözünü tuttu. Merkez'de trafik açıldı."
- Late: "Eski Çarşı esnafı: 'Koku hâlâ dükkânda.'"
- Rival dump: "Süpürge Holding pulları piyasaya sürdü. Fiyat düştü."
- Boom/offer: "Ordu acil zırh alıyor. Teklif bir dakika geçerli."
- Fire spread: "Yangın Park'tan Eski Çarşı'ya sıçradı."
- DNA scandal: "İddia: Aftermath canavar örneği sattı. Şirket yorumsuz."
- DNA donated: "Aftermath bulduğu örneği üniversiteye bağışladı."

Filler (random during calm, 1 per ~40 s):
- "Başkan robotlara teşekkür etti. Temizlikten söz etmedi."
- "Kalkan pilotları imza dağıttı. Kepçeciye soran yok."
- "Hava durumu: Parçalı bulutlu, canavar beklenmiyor."
- "Hurdacı Rıza yeni kamyonet aldı. Sebebi soruldu, güldü."
- "Eski Çarşı'da çay ocağı açıldı. İlk çaylar itfaiyeye."
- "Bir banka canavar hasarını 'doğal afet' saymadı."
- "Süpürge Holding: 'Biz olsak çoktan bitmişti.'"
- "Moda haftasında üç tasarımcı pul ceket gösterdi."
- "Park gölünde tanımsız balıklar görüldü." (mutant foreshadow, only after a DNA sale)

---

## 10. Save compatibility and state v2

### 10.1 Decision: fresh start with v1 preserved
- **Why not migrate:** v2 changes the *shape* of play, not just values. Vehicles become entities with positions. District levels become upkeep (which starts at 0 and is gated behind G6). Storage and anger are removed. Unlocks and FTUE progress are new. A mid-phase v1 save (cleanup/tender/rival) has no v2 equivalent. A migrated player would land with everything unlocked and skip the onboarding, which is the whole point of the redesign, and the user, the main player, explicitly did not understand v1.
- **How:**
  - New key `aftermath.save.v2`, `v: 2`. `load()` reads only v2.
  - If v2 is missing and `aftermath.save.v1` exists: **do not delete or overwrite v1** (rollback stays possible). Show a one-time card after the cold open, before the call: "Aftermath yenilendi. Eski kayıt bu sürümle açılmıyor; yeni bir şirketle başlıyorsun." Button "Tamam". Set `flags.v1Notice = true`.
  - Audio prefs (`aftermath.audio.v1`) are a separate key and stay untouched.
- **If the team prefers a migration anyway** (fallback mapping): money → money; rep → trust; rival.rep → rivalTrust; crews → fleet entities in the yard; inv (drop nothing; storage cap gone) → inv; dna, flags.mutantNext, stats, attackLevel, upgrades.speed, upgrades.factory → same; upgrades.storage → refund `Σ upgradeCost` as money; sector.level → upkeep = min(level, 3) **only if** stats.contracts ≥ 3; any non-calm phase → calm with a 10 s radar (in-progress contract dropped, parts kept); progress.unlocked derived from stats.contracts via the §4 table; `ftue = 'done'` if stats.contracts ≥ 1.

### 10.2 v2 state outline
```js
{
  v: 2,
  money, trust, rivalTrust,
  phase,             // 'calm' | 'attack' | 'tender' | 'cleanup' | 'rival'  (names unchanged → audio.js music works)
  timer,
  progress: { ftue: 'call'|'fire'|'rubble'|'carve'|'deliver'|'sell'|'buy'|'done', goal: 'G4', unlocked: { depot, company, factory, tender, upkeep, offers, equipment, foreman, dna } },
  sectors: [{ id, fire, fire0, rubble, rubbleMax, corpse, corpseMax, seg: 'head'|'body'|'tail'|null, upkeep: 0, damaged: false, spreadT: 0,
              crews: { fire, debris, carve } /* DERIVED cache from fleet, rebuilt every tick, so audio.js ambient() keeps working */ }],
  fleet: [{ id, type: 'fire'|'debris'|'carve', state: 'yard'|'enroute'|'working'|'returning', sector: null, eta: 0, from: 'yard'|sectorId }],
  inv, dna, yieldAcc, market /* drift source */, offers: [{ buyer, item, qty, unit, until }],
  jobs, autoJobs, upgrades: { speed, lines },
  attack, tender: { value, baseDeadline, estimate: [lo, hi], rivalBias }, contract: { pay, deadline, elapsed, tailOnly: false },
  flags: { mutantNext, lossStreak, buyerAt, buyerOffer, v1Notice },
  news, stats: { contracts, lost, parts, earned, sold }, lastSave
}
```

---

## 11. Implementation map

| File | Change |
|---|---|
| `js/data.js` | `SECTORS` + `col,row` (2×3), `neighbors()` from positions; `GOALS` table (§4); `FTUE` step table; `BUYERS` (Rıza + offer buyers from `RECIPES.buyer`); item display names per monster (`blood` → "Magma özü" for Magmadon); travel constants; balance per §6.3; remove storage/anger constants. |
| `js/sim.js` | Fleet entities + travel; hard sequence (fire → rubble → carve); derived `sec.crews`; spread warning timer; honest tender (`chance()`, `resolveTender()` with consistent reveal); fleet estimate dry-run; rival "tail" contract; offers generation and selling; Rıza elasticity; upkeep instead of levels (pause when damaged); goal checks + unlock events; scripted FTUE yields; `autoAssign` kept as the Vardiya şefi engine. |
| `js/ftue.js` (new) | Small director: `steps[] = { id, objective, highlight: {type:'district'|'tab'|'button', ref}, allow: [action ids], npc: 'text', done: (s) => bool }`. Gates `onClick` actions while active, emits `highlight` events for the renderer/UI. |
| `js/state.js` | v2 key, `newState()` per §10.2, v1 notice, no merge from v1. |
| `js/ui.js` | HUD (3 numbers), objective bar + headline swap, fleet strip, district action sheet, call card, NPC card, tender matrix + reveal, result sheet, Depo (stock grid + offers + Rıza, hold-to-sell), Factory (recipe cards), Şirket (Filo, Geliştirmeler, İstatistik), settings sheet, progressive tabs, SVG icons, all copy per §9. |
| render (3D pass) | Must expose: `projectAnchor(districtId)` → screen xy for chips; `vehicleScreenPos(id)`; events `dispatch`, `arrive`, `stage-done`, `part`, `clean`, `spread-warn`, `spread`; camera API `frame(districtId | 'city')`; tap → `{type:'district'|'yard'|'vehicle', id}`. |
| `js/audio.js` | Keep everything (the user likes it). Add `dispatch` and `hiss` procedural sfx; optional per-second warning tick. `ambient()` keeps reading `sec.crews` (derived cache), so no other change is needed. |
| `js/main.js` | Boot: v1 notice, cold open, FTUE director tick. Keep `window.aftermath.step()`, add `aftermath.ftue(stepId)` and `aftermath.unlockAll()` for testing. |
| `css/style.css` | New components; static headline (no marquee). Font: an OFL face with full Turkish glyphs, vendored (e.g. Barlow / Barlow Condensed via npm `@fontsource/barlow`, OFL-1.1). |

---

## 12. Acceptance criteria (testable with Playwright, iPhone 13 profile)

1. **FTUE flow:** a script that only taps the currently highlighted element completes the FTUE. Measured on the real clock with skip used: first dispatch ≤ 15 s, first sale ≤ 90 s.
2. **Always an objective:** at every sampled frame (every 500 ms) `#objective` text is non-empty, except during the attack cinematic.
3. **No emoji:** no DOM text node matches `/\p{Extended_Pictographic}/u` (canvas/3D excluded).
4. **No exclamation marks** in any UI string (`/!/` over `ui.js`/`data.js` string literals and rendered DOM).
5. **HUD numeric tokens ≤ 3** (count `/\d/` groups in `#hud` + `#objective`).
6. **Every disabled button has a visible reason** (non-empty `.reason` child).
7. **Primary-button rule:** at most one `.btn.primary` visible per screen state.
8. **Honest odds:** 10k simulated tenders per cell; observed win rate within ±2 points of the displayed chance.
9. **Estimate accuracy:** the fleet estimate range contains the auto-dispatch completion time in ≥ 80% of 500 simulated contracts.
10. **Comprehension check (manual):** after 3 minutes, a first-time tester can say the loop in one sentence ("söndür, enkazı kaldır, kes, sat") and name what the money is for.

---

## 13. Open questions / risks

- **Hard sequencing could feel slow** in single-district contracts. Mitigation: keep contract #1 short and make multi-district contracts the norm from #2, so parallel work exists. If playtests still show idle carving crews, allow carving at 50% speed while rubble remains (keep fire as a hard block).
- **Travel times vs. frustration:** the cap is 4.5 s. Re-dispatch from the current position, never forced back to the yard.
- **3D performance on mid-range phones:** in-world UI is HTML overlays (cheap). The juice particle cap is 300. Vehicles ≤ 12 on screen; rival vehicles reuse models with a purple material.
- **Age appropriateness:** carving is industrial (tarps, crates, sparks), with no blood particles; "Kan" is renamed. The secret-buyer choice is moral but not graphic.
- **Real currency (₺) display:** purely cosmetic; there are no purchases. If the team prefers neutrality, swap the suffix to "kr" (kredi) in `fmtMoney` only.
- **Chapter end (G15)** needs a second city or a prestige loop to avoid a dead end. Out of scope here; flagged for the roadmap.
