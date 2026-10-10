import type { CutoutKey } from "@/lib/media";

type Vec3 = [number, number, number];

export type HeroProduct = {
  key: CutoutKey;
  /** Theatre object that drives this product's entrance. */
  cue: "headphones" | "sneaker" | "watch";
  main?: boolean;
  /** World units; the composition is centred on the origin and framed into the right half by a lens shift. */
  height: number;
  pos: Vec3;
  rot: number;
  /** Offset the product enters from (it travels in along the ribbon). */
  from: Vec3;
  /** Direction it parts to while the hero scrolls away. */
  spread: Vec3;
  float: number;
  phase: number;
  /** DOM still-life placement (percent of the composition box). */
  still: { left: number; top: number; width: number; z: number; rot: number };
};

export const FLOOR_Y = -1.62;

export const HERO_PRODUCTS: HeroProduct[] = [
  {
    key: "watch",
    cue: "watch",
    height: 1.25,
    pos: [1.9, 0.95, -1.5],
    rot: 0.1,
    from: [1.6, 0.6, -3.5],
    spread: [2.8, 1.6, 0.5],
    float: 0.07,
    phase: 2.1,
    still: { left: 64, top: 4, width: 22, z: 1, rot: 7 },
  },
  {
    key: "headphones",
    cue: "headphones",
    main: true,
    height: 2.9,
    pos: [0, 0.08, 0],
    rot: -0.03,
    from: [0, -0.2, -6],
    spread: [0, 0.2, 1.2],
    float: 0.05,
    phase: 0,
    still: { left: 18, top: 10, width: 58, z: 2, rot: -2 },
  },
  {
    key: "sneaker",
    cue: "sneaker",
    height: 0.86,
    pos: [-1.4, -1.06, 1.15],
    rot: -0.06,
    from: [-2.6, -0.4, 2.4],
    spread: [-3, -0.8, 1.4],
    float: 0.04,
    phase: 4.2,
    still: { left: 0, top: 64, width: 42, z: 3, rot: -5 },
  },
];

/** Ribbon path: enters low from the copy side, loops behind the products and leaves top-right. */
export const RIBBON_POINTS: Vec3[] = [
  [-4.2, -2.2, 2.2],
  [-2.4, -1.55, 2.25],
  [-0.4, -1.1, 2.0],
  [1.5, -0.6, 1.3],
  [2.6, 0.15, -0.1],
  [2.15, 0.95, -2.1],
  [0.2, 1.15, -2.5],
  [-1.75, 0.55, -1.5],
  [-2.2, -0.25, 0.25],
  [-1.3, 0.85, 1.75],
  [0.55, 1.9, 1.6],
  [2.5, 2.55, 0.7],
  [4.8, 3.6, -0.4],
];
