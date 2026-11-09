// Shared layout numbers for the factory floor. Imported by the scene and,
// if needed, by the UI. No three.js import here: plain numbers only.
//
// World space: ground is the XZ plane, Y is up, 1 unit ~ one toy-table width.
// The orthographic camera looks from +X +Z (yaw 45 deg), so +X runs toward the
// lower right of the screen and +Z toward the lower left. The conveyor makes a
// staircase in world space, which reads as a zigzag running straight down the
// portrait screen: station 1 top-left, 2 right, 3 left, 4 right, truck bottom.

/** Distance between two neighbouring belt corners (one station per corner). */
export const STEP = 3.6;

/** Belt corner (work spot) of each station, in order, [x, z]. */
export const CORNERS = [
  [0, 0],
  [STEP, 0],
  [STEP, STEP],
  [2 * STEP, STEP],
];

/** Each machine stands behind its corner, away from the camera: centre = corner - [off, off]. */
export const MACHINE_OFFSET = 1.4;

/** Raw material pile that feeds station 1 (belt runs +Z from here to corner 1). */
export const STOCK = [0, -3.3];

/** End of the belt at the truck dock, and the parked truck centre (truck points +Z). */
export const DOCK = [2 * STEP, STEP + 1.9];
export const TRUCK = [2 * STEP, STEP + 3.55];

/** Camera angles in degrees. */
export const CAMERA = { yaw: 45, pitch: 34 };

/** Back walls of the hall (x = WALLS.x runs along Z, z = WALLS.z runs along X). */
export const WALLS = { x: -3.3, z: -3.3, height: 2.5 };

/**
 * Screen space the UI covers, in CSS px, NOT counting the device safe-area
 * insets (the scene adds env(safe-area-inset-*) itself). The scene frames the
 * factory inside the rest of the viewport (HUD at the top, goal strip at the
 * bottom). The UI can override at run time with scene.setInsets({ top, bottom }).
 */
export const UI_INSETS = { top: 96, bottom: 176, left: 0, right: 0 };
export const INSETS = UI_INSETS; // alias

/**
 * Approximate normalised screen positions (0..1 of the viewport) on a
 * 390 x 844 portrait screen with the default INSETS. Only for rough
 * placement before the scene is ready; use scene.anchor() for exact numbers.
 */
export const SCREEN = {
  stations: [
    { x: 0.30, y: 0.22 },
    { x: 0.70, y: 0.37 },
    { x: 0.30, y: 0.51 },
    { x: 0.70, y: 0.66 },
  ],
  truck: { x: 0.30, y: 0.79 },
  coins: { x: 0.22, y: 0.05 },
};
