// Scene-side screen helpers shared with the UI / main.js. The world layout (positions, walk
// graph) lives in js/game/layout.js; this file only has screen-space fallbacks.
export { LAYOUTS, getLayout } from '../game/layout.js';

/**
 * Screen space the UI covers, in CSS px, NOT counting the device safe-area insets (the scene
 * adds env(safe-area-inset-*) itself). The scene frames the restaurant inside the rest of the
 * viewport. The UI can override at run time with scene.setInsets({ top, bottom, left, right }).
 */
export const UI_INSETS = { top: 92, bottom: 150, left: 0, right: 0 };
export const INSETS = UI_INSETS; // alias

/**
 * Rough normalised screen positions (0..1 of the canvas, y down) on a 390 x 844 portrait screen,
 * only for placement before the scene is ready (or without WebGL). Use scene.anchor() for real
 * positions. stations: above each station (level badge / Open sign), tables: above each table.
 */
export const SCREEN = {
  stations: [
    { x: 0.33, y: 0.2 }, { x: 0.45, y: 0.2 }, { x: 0.55, y: 0.2 }, { x: 0.67, y: 0.2 },
  ],
  tables: [
    { x: 0.25, y: 0.52 }, { x: 0.75, y: 0.52 }, { x: 0.25, y: 0.4 }, { x: 0.75, y: 0.4 }, { x: 0.25, y: 0.64 }, { x: 0.75, y: 0.64 },
  ],
  coins: { x: 0.5, y: 0.05 },
};
