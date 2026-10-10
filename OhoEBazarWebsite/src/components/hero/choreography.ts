import { getProject } from "@theatre/core";

/*
 * Hero choreography, authored as Theatre.js keyframes.
 *
 * `Intro` plays once on load (seconds): the headphones emerge from darkness, the ribbon traces its path,
 * the supporting products enter where the ribbon passes them, the camera orbits and the key light sweeps.
 * `Exit` is scrubbed by scroll (0 → 1): the camera pushes in, the ribbon unspools downward into the
 * next section's ribbon edge, and the products part.
 *
 * The state below uses Theatre's on-disk format, so it can be opened and refined in @theatre/studio.
 */

type Ease = readonly [number, number, number, number];
const ease = {
  inOut: [0.65, 0, 0.35, 1],
  out: [0.16, 1, 0.3, 1],
  soft: [0.45, 0, 0.2, 1],
  in: [0.55, 0, 0.9, 0.4],
  linear: [0.33, 0.33, 0.67, 0.67],
} as const satisfies Record<string, Ease>;

/** [position, value, easing of the segment that starts at this key] */
type Key = readonly [number, number, Ease?];
type Tracks = Record<string, Record<string, readonly Key[]>>;

function sheetState(length: number, objects: Tracks) {
  const tracksByObject: Record<string, unknown> = {};
  for (const [object, props] of Object.entries(objects)) {
    const trackData: Record<string, unknown> = {};
    const trackIdByPropPath: Record<string, string> = {};
    for (const [prop, keys] of Object.entries(props)) {
      const id = `${object}-${prop}`;
      trackIdByPropPath[JSON.stringify([prop])] = id;
      trackData[id] = {
        type: "BasicKeyframedTrack",
        __debugName: `${object}:${prop}`,
        keyframes: keys.map(([position, value, e = ease.inOut], i) => {
          const prev = keys[i - 1]?.[2] ?? ease.inOut;
          return {
            id: `${id}-${i}`,
            position,
            value,
            type: "bezier",
            connectedRight: i < keys.length - 1,
            handles: [prev[2], prev[3], e[0], e[1]],
          };
        }),
      };
    }
    tracksByObject[object] = { trackData, trackIdByPropPath };
  }
  return {
    staticOverrides: { byObject: {} },
    sequence: { type: "PositionalSequence", length, subUnitsPerUnit: 30, tracksByObject },
  };
}

export const INTRO_LENGTH = 6.5;
export const EXIT_LENGTH = 1;

const intro = sheetState(INTRO_LENGTH, {
  Camera: {
    azimuth: [[0, -22, ease.soft], [6.5, 4]],
    elevation: [[0, 9, ease.soft], [6.5, 4]],
    distance: [[0, 13.2, ease.out], [5.2, 10.4]],
  },
  Light: {
    exposure: [[0, 0.08, ease.soft], [1.3, 1]],
    sweep: [[0.4, -1.4, ease.inOut], [5.6, 1.2]],
    rim: [[0.6, 0, ease.out], [2.6, 1]],
  },
  Ribbon: {
    progress: [[0.9, 0, ease.inOut], [4.4, 1]],
  },
  Headphones: {
    enter: [[0, 0, ease.out], [2, 1]],
    lift: [[0, -0.45, ease.out], [2.8, 0]],
  },
  Sneaker: {
    enter: [[1.35, 0, ease.out], [2.6, 1]],
  },
  Watch: {
    enter: [[2.3, 0, ease.out], [3.6, 1]],
  },
});

const exit = sheetState(EXIT_LENGTH, {
  Camera: {
    push: [[0, 0, ease.in], [1, 3.4]],
    elevation: [[0, 0, ease.inOut], [1, -3]],
    azimuth: [[0, 0, ease.inOut], [1, 9]],
  },
  Ribbon: {
    tail: [[0.05, 0, ease.inOut], [0.9, 0.82]],
    width: [[0, 1, ease.in], [1, 3.2]],
    drop: [[0.15, 0, ease.in], [1, 3.6]],
  },
  Products: {
    spread: [[0, 0, ease.in], [1, 1]],
    fade: [[0.45, 0, ease.linear], [0.95, 1]],
  },
  Light: {
    dim: [[0.3, 0, ease.linear], [1, 0.7]],
  },
});

function createChoreography() {
  const project = getProject("OHO Hero", {
    state: {
      sheetsById: { Intro: intro, Exit: exit },
      definitionVersion: "0.4.0",
      revisionHistory: ["oho-hero-v2"],
    },
  });
  const introSheet = project.sheet("Intro");
  const exitSheet = project.sheet("Exit");

  const objects = {
    camera: introSheet.object("Camera", { azimuth: 4, elevation: 4, distance: 10.4 }),
    light: introSheet.object("Light", { exposure: 1, sweep: 1.2, rim: 1 }),
    ribbon: introSheet.object("Ribbon", { progress: 1 }),
    headphones: introSheet.object("Headphones", { enter: 1, lift: 0 }),
    sneaker: introSheet.object("Sneaker", { enter: 1 }),
    watch: introSheet.object("Watch", { enter: 1 }),
    exitCamera: exitSheet.object("Camera", { push: 0, elevation: 0, azimuth: 0 }),
    exitRibbon: exitSheet.object("Ribbon", { tail: 0, width: 1, drop: 0 }),
    exitProducts: exitSheet.object("Products", { spread: 0, fade: 0 }),
    exitLight: exitSheet.object("Light", { dim: 0 }),
  };

  return { project, introSheet, exitSheet, objects };
}

export type Choreography = ReturnType<typeof createChoreography>;

let instance: Choreography | null = null;

/** The Theatre project and the objects the R3F stage reads every frame. Theatre projects are global by id, so this is a singleton. */
export function getChoreography() {
  instance ??= createChoreography();
  return instance;
}
