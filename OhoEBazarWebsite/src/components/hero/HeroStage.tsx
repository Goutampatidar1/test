import { MeshReflectorMaterial, Sparkles, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { cutouts, cutoutSrc } from "@/lib/media";
import { EXIT_LENGTH, INTRO_LENGTH, getChoreography } from "./choreography";
import { FLOOR_Y, HERO_PRODUCTS, RIBBON_POINTS, type HeroProduct } from "./heroScene";

export type HeroStageProps = {
  /** 0 → 1 while the hero scrolls away (written by the hero ScrollTrigger). */
  progressRef: RefObject<number>;
  /** Pointer in -1…1 (written by the hero). */
  pointerRef: RefObject<{ x: number; y: number }>;
  /** Starts the intro sequence; until then the stage stays dark. */
  play: boolean;
  eventSource: RefObject<HTMLElement | null>;
};

/** Per-frame values the director derives from Theatre and hands to every object. */
type StageFrame = { exposure: number; sweep: number; rim: number; ribbonProgress: number };

const NIGHT = "#0e0b09";
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ----------------------------------------------------------------------------------------------
 * Director: camera orbit, lens shift and Theatre → frame values. Runs before everything else.
 * -------------------------------------------------------------------------------------------- */

function Director({ frame, progressRef, pointerRef }: { frame: StageFrame } & Pick<HeroStageProps, "progressRef" | "pointerRef">) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { objects, exitSheet } = getChoreography();
  const pointer = useRef({ x: 0, y: 0 });
  const lastProgress = useRef(-1);

  // Lens shift keeps the orbit centred on the products while framing them in the right half, clear of the copy.
  const framing = useMemo(() => {
    const aspect = size.width / size.height;
    return {
      shift: aspect >= 1.55 ? 0.34 : 0.4,
      distance: THREE.MathUtils.clamp(1.72 / aspect, 1, 1.38),
    };
  }, [size.width, size.height]);

  useLayoutEffect(() => {
    camera.filmOffset = (-framing.shift * camera.getFilmWidth()) / 2;
    camera.updateProjectionMatrix();
  }, [camera, framing, size.width, size.height]);

  useFrame((state, dt) => {
    const p = progressRef.current ?? 0;
    if (Math.abs(p - lastProgress.current) > 1e-4) {
      exitSheet.sequence.position = p * EXIT_LENGTH;
      lastProgress.current = p;
    }

    const target = pointerRef.current ?? { x: 0, y: 0 };
    pointer.current.x = THREE.MathUtils.damp(pointer.current.x, target.x, 2.2, dt);
    pointer.current.y = THREE.MathUtils.damp(pointer.current.y, target.y, 2.2, dt);

    const cam = objects.camera.value;
    const ex = objects.exitCamera.value;
    const t = state.clock.elapsedTime;
    const az = THREE.MathUtils.degToRad(cam.azimuth + ex.azimuth + pointer.current.x * 5 + Math.sin(t * 0.11) * 1.4);
    const el = THREE.MathUtils.degToRad(cam.elevation + ex.elevation + pointer.current.y * 2.5);
    const dist = (cam.distance - ex.push) * framing.distance;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + 0.15, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, 0.05, 0);

    const light = objects.light.value;
    frame.exposure = light.exposure * (1 - objects.exitLight.value.dim);
    frame.sweep = light.sweep;
    frame.rim = light.rim;
    frame.ribbonProgress = objects.ribbon.value.progress;
  }, -1);

  return null;
}

/** Starts the Theatre intro once the textures are on the GPU and the page curtain has lifted. */
function IntroCue({ play }: { play: boolean }) {
  useEffect(() => {
    const { project, introSheet } = getChoreography();
    if (!play) {
      introSheet.sequence.position = 0;
      return;
    }
    let cancelled = false;
    void project.ready.then(() => {
      if (!cancelled) void introSheet.sequence.play({ range: [0, INTRO_LENGTH] });
    });
    return () => {
      cancelled = true;
      introSheet.sequence.pause();
    };
  }, [play]);
  return null;
}

/* ----------------------------------------------------------------------------------------------
 * Products: lit cutout planes with an orange rim, a sweeping key light and floor contact shadows.
 * -------------------------------------------------------------------------------------------- */

const productVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const productFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;
  uniform float uOpacity;
  uniform float uExposure;
  uniform float uSweep;
  uniform float uRim;
  uniform float uHover;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.03) discard;
    // Orange rim from a light behind-right; a soft cool key edge from the top-left.
    float rim = clamp(c.a - texture2D(uMap, vUv + vec2(0.97, 0.24) * uTexel * 8.0).a, 0.0, 1.0);
    float key = clamp(c.a - texture2D(uMap, vUv + vec2(-0.6, 0.8) * uTexel * 7.0).a, 0.0, 1.0);
    // Key-light band travelling across the object, driven by the Theatre sweep.
    float d = (vUv.x - 0.5) * 1.5 + (vUv.y - 0.5) * 0.7 - uSweep;
    float band = exp(-d * d * 7.0);
    float ground = mix(0.62, 1.0, smoothstep(0.0, 0.6, vUv.y));
    vec3 col = c.rgb * ground * (0.74 + band * 0.4 + uHover * 0.1);
    col += rim * vec3(1.0, 0.45, 0.1) * 0.7 * uRim;
    col += key * vec3(1.0, 0.92, 0.84) * 0.16 * uRim;
    col *= uExposure;
    gl_FragColor = vec4(col, c.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

function useContactShadow() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.35, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);
}

function Product({ product, texture, shadowMap, frame }: { product: HeroProduct; texture: THREE.Texture; shadowMap: THREE.Texture; frame: StageFrame }) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const hover = useRef(0);
  const [hovered, setHovered] = useState(false);
  const meta = cutouts[product.key];
  const h = product.height;
  const w = h * (meta.w / meta.h);
  const { objects } = getChoreography();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: productVertex,
        fragmentShader: productFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: texture },
          uTexel: { value: new THREE.Vector2(1 / meta.w, 1 / meta.h) },
          uOpacity: { value: 0 },
          uExposure: { value: 0 },
          uSweep: { value: 0 },
          uRim: { value: 0 },
          uHover: { value: 0 },
        },
      }),
    [texture, meta.w, meta.h],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const enter = objects[product.cue].value.enter;
    const lift = product.main ? objects.headphones.value.lift : 0;
    const ex = objects.exitProducts.value;
    const t = state.clock.elapsedTime;
    const inv = 1 - enter;

    const float = Math.sin(t * 0.6 + product.phase) * product.float;
    const x = product.pos[0] + product.from[0] * inv + product.spread[0] * ex.spread;
    const y = product.pos[1] + float + lift + product.from[1] * inv + product.spread[1] * ex.spread;
    const z = product.pos[2] + product.from[2] * inv + product.spread[2] * ex.spread;
    g.position.set(x, y, z);

    hover.current = THREE.MathUtils.damp(hover.current, hovered ? 1 : 0, 6, dt);
    g.scale.setScalar((0.86 + 0.14 * enter) * (1 + hover.current * 0.035));
    g.rotation.z = product.rot + inv * (product.main ? 0 : 0.35) + Math.sin(t * 0.4 + product.phase) * 0.012;

    const opacity = clamp01(enter * 1.8) * (1 - ex.fade);
    const u = material.uniforms;
    u.uOpacity!.value = opacity;
    u.uExposure!.value = frame.exposure * (0.3 + 0.7 * enter);
    u.uSweep!.value = frame.sweep;
    u.uRim!.value = frame.rim;
    u.uHover!.value = hover.current;

    const s = shadow.current;
    if (s) {
      const gap = Math.max(0, y - h / 2 - FLOOR_Y);
      s.position.set(x, FLOOR_Y + 0.004, z);
      s.scale.set(w * (0.95 + gap * 0.25), w * 0.32 * (1 + gap * 0.4), 1);
      (s.material as THREE.MeshBasicMaterial).opacity = opacity * frame.exposure * clamp01(1 - gap * 0.55) * 0.8;
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
  };

  return (
    <>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowMap} transparent depthWrite={false} opacity={0} color="#000000" />
      </mesh>
      <group ref={group} renderOrder={10 + Math.round((product.pos[2] + 5) * 4)}>
        <mesh material={material} onPointerOver={onOver} onPointerOut={() => setHovered(false)}>
          <planeGeometry args={[w, h]} />
        </mesh>
      </group>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Ribbon: a twisting silk band along a Catmull-Rom path, drawn progressively from tail to head.
 * -------------------------------------------------------------------------------------------- */

const ribbonVertex = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSide;
  uniform float uHalf;
  uniform float uWidth;
  uniform float uDrop;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    float taper = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.93, uv.x);
    vec3 p = position + aDir * aSide * uHalf * uWidth * (0.3 + 0.7 * taper);
    p.y -= uDrop * uv.x * uv.x;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const ribbonFragment = /* glsl */ `
  uniform float uProgress;
  uniform float uTail;
  uniform float uTime;
  uniform float uExposure;
  uniform float uSweep;
  uniform vec3 uDeep;
  uniform vec3 uBrand;
  uniform vec3 uAmber;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    if (vUv.x > uProgress || vUv.x < uTail) discard;
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 lightPos = vec3(uSweep * 3.2, 3.2, 3.5);
    vec3 l = normalize(lightPos - vWorld);
    float diff = clamp(dot(n, l), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(l + v)), 0.0, 1.0), 48.0);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);

    vec3 base = mix(uDeep, uBrand, smoothstep(0.0, 0.45, vUv.x));
    base = mix(base, uAmber, smoothstep(0.7, 1.0, vUv.x) * 0.6);
    float edge = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
    float silk = sin(vUv.x * 220.0 + vUv.y * 4.0 - uTime * 0.9) * 0.5 + 0.5;

    vec3 col = base * (0.18 + 0.9 * diff) * mix(0.7, 1.0, edge);
    col += spec * vec3(1.0, 0.86, 0.66) * 1.1;
    col += fres * uAmber * 0.45;
    col += silk * base * 0.04;
    float head = smoothstep(0.05, 0.0, uProgress - vUv.x) * step(uProgress, 0.999);
    col += head * vec3(1.0, 0.55, 0.15) * 1.6;
    col *= uExposure;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function useRibbonGeometry() {
  return useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      RIBBON_POINTS.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
    );
    const segments = 480;
    const frames = curve.computeFrenetFrames(segments, false);
    const centers: number[] = [];
    const dirs: number[] = [];
    const normals: number[] = [];
    const sides: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const dir = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const p = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      const twist = u * Math.PI * 2.6 + Math.sin(u * Math.PI * 3) * 0.6;
      dir
        .copy(frames.binormals[i]!)
        .multiplyScalar(Math.cos(twist))
        .addScaledVector(frames.normals[i]!, Math.sin(twist))
        .normalize();
      nrm.crossVectors(tangent, dir).normalize();
      for (const side of [-1, 1]) {
        centers.push(p.x, p.y, p.z);
        dirs.push(dir.x, dir.y, dir.z);
        normals.push(nrm.x, nrm.y, nrm.z);
        sides.push(side);
        uvs.push(u, side < 0 ? 0 : 1);
      }
      if (i < segments) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(centers, 3));
    geometry.setAttribute("aDir", new THREE.Float32BufferAttribute(dirs, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(sides, 1));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    // Width and drop are applied in the vertex shader, so give the bounds room instead of recomputing them.
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius += 6;
    return geometry;
  }, []);
}

function Ribbon({ frame }: { frame: StageFrame }) {
  const geometry = useRibbonGeometry();
  const { objects } = getChoreography();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ribbonVertex,
        fragmentShader: ribbonFragment,
        side: THREE.DoubleSide,
        uniforms: {
          uHalf: { value: 0.125 },
          uWidth: { value: 1 },
          uDrop: { value: 0 },
          uProgress: { value: 0 },
          uTail: { value: 0 },
          uTime: { value: 0 },
          uExposure: { value: 0 },
          uSweep: { value: 0 },
          uDeep: { value: new THREE.Color("#7a2400") },
          uBrand: { value: new THREE.Color("#fe7000") },
          uAmber: { value: new THREE.Color("#ffb35c") },
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );

  useFrame((state) => {
    const ex = objects.exitRibbon.value;
    const u = material.uniforms;
    u.uProgress!.value = frame.ribbonProgress;
    u.uTail!.value = ex.tail;
    u.uWidth!.value = ex.width;
    u.uDrop!.value = ex.drop;
    u.uTime!.value = state.clock.elapsedTime;
    u.uExposure!.value = Math.max(frame.exposure, 0.15);
    u.uSweep!.value = frame.sweep;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/* ----------------------------------------------------------------------------------------------
 * Atmosphere: warm light pool behind the products, a softly reflective floor and a little dust.
 * -------------------------------------------------------------------------------------------- */

function Glow({ frame }: { frame: StageFrame }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color("#ff7a1a") } },
        vertexShader: productVertex,
        fragmentShader: /* glsl */ `
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            vec2 p = (vUv - 0.5) * vec2(1.0, 1.4);
            float g = exp(-dot(p, p) * 16.0);
            gl_FragColor = vec4(uColor * g * uStrength, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.uStrength!.value = 0.11 * frame.exposure;
  });
  return (
    <mesh position={[0.2, 0.3, -3.2]} renderOrder={-10} material={material}>
      <planeGeometry args={[16, 11]} />
    </mesh>
  );
}

function Floor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]}>
      <planeGeometry args={[60, 60]} />
      <MeshReflectorMaterial
        blur={[420, 140]}
        resolution={512}
        mixBlur={1}
        mixStrength={6}
        mixContrast={1}
        roughness={1}
        depthScale={1.1}
        minDepthThreshold={0.5}
        maxDepthThreshold={1.3}
        color="#17110d"
        metalness={0.2}
        mirror={0.55}
      />
    </mesh>
  );
}

function Scene(props: HeroStageProps) {
  const textures = useTexture(
    HERO_PRODUCTS.map((p) => cutoutSrc(p.key)),
    (loaded) => {
      (Array.isArray(loaded) ? loaded : [loaded]).forEach((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
      });
    },
  );
  const shadowMap = useContactShadow();
  const frame = useRef<StageFrame>({ exposure: 0, sweep: -1.4, rim: 0, ribbonProgress: 0 }).current;

  return (
    <>
      <color attach="background" args={[NIGHT]} />
      <fog attach="fog" args={[NIGHT, 12, 26]} />
      <Director frame={frame} progressRef={props.progressRef} pointerRef={props.pointerRef} />
      <IntroCue play={props.play} />
      <ambientLight intensity={0.25} />
      <spotLight position={[1.5, 7, 4]} angle={0.55} penumbra={1} intensity={3.2} decay={0} color="#ffd2a1" />
      <Glow frame={frame} />
      <Floor />
      <Ribbon frame={frame} />
      {HERO_PRODUCTS.map((p, i) => (
        <Product key={p.key} product={p} texture={textures[i]!} shadowMap={shadowMap} frame={frame} />
      ))}
      <Sparkles count={28} scale={[9, 5, 5]} position={[0.3, 0.6, 0]} size={2.2} speed={0.18} opacity={0.5} color="#ffb06a" />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.45} luminanceThreshold={0.86} luminanceSmoothing={0.2} />
        <Vignette offset={0.2} darkness={0.78} />
      </EffectComposer>
    </>
  );
}

/** WebGL hero product stage. Pauses rendering once the hero is scrolled away. */
export default function HeroStage(props: HeroStageProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas
        flat
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.6, 13], fov: 28, near: 0.1, far: 80 }}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        frameloop={visible ? "always" : "never"}
        eventSource={props.eventSource as RefObject<HTMLElement>}
        eventPrefix="client"
        style={{ position: "absolute", inset: 0 }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
