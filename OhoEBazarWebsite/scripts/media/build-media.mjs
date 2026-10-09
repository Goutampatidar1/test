/**
 * Builds optimised landing-page media into public/media.
 *   node scripts/media/build-media.mjs            -> cutouts + photos
 *   node scripts/media/build-media.mjs cutouts    -> only product cutouts
 * Uses sharp from the Backend workspace so the website has no image tooling dependency.
 */
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.resolve(fileURLToPath(import.meta.url), "../../../../Backend/package.json"));
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outCutouts = path.join(root, "public/media/products");
const outPhotos = path.join(root, "public/media/photos");
const creditsFile = path.join(root, "src/data/photoCredits.json");

const CUTOUTS = [
  { name: "headphones", file: "hero-headphones.jpg", tol: 20, holes: true },
  { name: "sneaker", file: "hero-sneaker.jpg", tol: 12 },
  { name: "perfume", file: "hero-perfume.jpg", tol: 16 },
  { name: "brass-lantern", file: "hero-brass.jpg", tol: 18, cropTop: 150 },
  { name: "saree", file: "hero-saree.jpg", tol: 48 },
  { name: "watch", file: "hero-watch.jpg", tol: 16 },
  { name: "gift", file: "hero-gift.jpg", tol: 16 },
];

const wiki = (p) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${p}/1280px-${p.split("/").pop()}`;
const unsplash = (id) => `https://images.unsplash.com/${id}?w=1600&q=82&auto=format&fit=crop`;
const UNSPLASH = { author: "Unsplash contributor", license: "Unsplash License" };

const PHOTOS = [
  { name: "wedding-stage", url: unsplash("photo-1587271407850-8d438ca9fdf2"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1587271407850-8d438ca9fdf2" },
  { name: "banquet-hall", url: unsplash("photo-1519167758481-83f550bb49b3"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1519167758481-83f550bb49b3" },
  { name: "catering", url: unsplash("photo-1555244162-803834f70033"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1555244162-803834f70033" },
  { name: "dj", url: unsplash("photo-1470225620780-dba8ba36b745"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1470225620780-dba8ba36b745" },
  { name: "tent", url: unsplash("photo-1464366400600-7168b8af9bc3"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1464366400600-7168b8af9bc3" },
  { name: "table-decor", url: unsplash("photo-1511795409834-ef04bbd61622"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1511795409834-ef04bbd61622" },
  { name: "thali", url: unsplash("photo-1567337710282-00832b415979"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1567337710282-00832b415979" },
  { name: "spices", url: unsplash("photo-1596040033229-a9821ebd058d"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1596040033229-a9821ebd058d" },
  { name: "grocery", url: unsplash("photo-1542838132-92c53300491e"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1542838132-92c53300491e" },
  { name: "saree-portrait", url: unsplash("photo-1610030469983-98e550d6193c"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1610030469983-98e550d6193c" },
  { name: "clothing-rack", url: unsplash("photo-1445205170230-053b83016050"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1445205170230-053b83016050" },
  { name: "electronics", url: unsplash("photo-1498049794561-7780e7231661"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1498049794561-7780e7231661" },
  { name: "living-room", url: unsplash("photo-1616486338812-3dadae4b4ace"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1616486338812-3dadae4b4ace" },
  { name: "ceramics", url: unsplash("photo-1610701596007-11502861dcfa"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1610701596007-11502861dcfa" },
  { name: "gifts", url: unsplash("photo-1513885535751-8b9238bd345a"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1513885535751-8b9238bd345a" },
  { name: "fitness", url: unsplash("photo-1517836357463-d25dfeac3438"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1517836357463-d25dfeac3438" },
  { name: "tee", url: unsplash("photo-1521572163474-6864f9cf17ab"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1521572163474-6864f9cf17ab" },
  { name: "bananas", url: unsplash("photo-1571771894821-ce9b6c11b08e"), ...UNSPLASH, source: "https://unsplash.com/photos/photo-1571771894821-ce9b6c11b08e" },
  {
    name: "lehenga-store",
    url: wiki("4/44/A-store-person-showcases-a-lehenga.jpg"),
    author: "Siddharth Srivastava",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:A-store-person-showcases-a-lehenga.jpg",
  },
  {
    name: "brass-shop",
    url: wiki("7/70/Shopkeeper_in_Market_-_Madurai_-_India.JPG"),
    author: "Adam Jones",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Shopkeeper_in_Market_-_Madurai_-_India.JPG",
  },
  {
    name: "block-print-artisan",
    url: wiki("8/85/Traditional_Bagh_hand_block_print_master_craftsman-artisan-artist_Mohammed_Bilal_Khatri%2C_Madhya_Pradesh%2C_India.jpg"),
    author: "Bsfs",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Traditional_Bagh_hand_block_print_master_craftsman-artisan-artist_Mohammed_Bilal_Khatri,_Madhya_Pradesh,_India.jpg",
  },
  {
    name: "silk-weaving",
    url: wiki("1/1b/Silk_Sari_Weaving_at_Kanchipuram%2C_Tamil_Nadu.jpg"),
    author: "McKay Savage",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Silk_Sari_Weaving_at_Kanchipuram,_Tamil_Nadu.jpg",
  },
  {
    name: "flower-seller",
    url: wiki("4/47/India_-_Varanasi_flower_seller_-_2371.jpg"),
    author: "Jorge Royan",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:India_-_Varanasi_flower_seller_-_2371.jpg",
  },
  {
    name: "bhangra",
    url: wiki("8/8e/Bhangra_Dance_Performed_by_Girls.jpg"),
    author: "Rasdeep Singh",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Bhangra_Dance_Performed_by_Girls.jpg",
  },
  {
    name: "baraat-horse",
    url: wiki("a/ab/The_Groom_has_arrived.jpg"),
    author: "Aditya.singh112",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:The_Groom_has_arrived.jpg",
  },
  {
    name: "wedding-lights",
    url: wiki("e/e6/Aurangabad%2C_ladies_carrying_lights_for_a_wedding_%289841465464%29.jpg"),
    author: "Arian Zwegers",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Aurangabad,_ladies_carrying_lights_for_a_wedding_(9841465464).jpg",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "OhoEBazarSite/1.0 (https://ohoebazar.com; support@ohoebazar.com)" } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429) throw new Error(`${res.status} ${url}`);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`429 ${url}`);
}

/** Flood-fills the near-white studio background from the borders and feathers the edge. */
async function keyOutWhite(input, tol, holes = false) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const near = (p) => {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return min >= 255 - tol && max - min < 16;
  };
  const push = (p) => {
    if (!bg[p] && near(p)) {
      bg[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  const drain = () => {
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < n - w) push(p + w);
    }
  };
  drain();

  // Background enclosed by the product (e.g. inside a headband) is unreachable from the border.
  if (holes) {
    const minArea = Math.round(n * 0.004);
    for (let p = 0; p < n; p++) {
      if (bg[p] || !near(p)) continue;
      const start = tail;
      push(p);
      drain();
      if (tail - start < minArea) for (let k = start; k < tail; k++) bg[queue[k]] = 2;
    }
    for (let p = 0; p < n; p++) if (bg[p] === 2) bg[p] = 0;
  }

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const touchesBg =
      (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < n - w && bg[p + w]);
    if (!touchesBg) continue;
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const a = Math.min(1, Math.max(0.15, (255 - min) / (tol * 2.2)));
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - 255 * (1 - a)) / a)));
    }
    data[i + 3] = Math.round(a * 255);
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function buildCutouts() {
  await fs.mkdir(outCutouts, { recursive: true });
  for (const c of CUTOUTS) {
    let img = sharp(path.join(here, "source", c.file));
    if (c.cropTop) {
      const meta = await img.metadata();
      img = img.extract({ left: 0, top: c.cropTop, width: meta.width, height: meta.height - c.cropTop });
    }
    const keyed = await keyOutWhite(await img.png().toBuffer(), c.tol, c.holes);
    const trimmed = await sharp(keyed).trim({ threshold: 1 }).png().toBuffer();
    await sharp(trimmed).resize({ width: 1000, height: 1000, fit: "inside" }).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(outCutouts, `${c.name}.webp`));
    await sharp(trimmed).resize({ width: 520, height: 520, fit: "inside" }).webp({ quality: 82, alphaQuality: 88 }).toFile(path.join(outCutouts, `${c.name}-sm.webp`));
    const meta = await sharp(trimmed).metadata();
    console.log(`cutout ${c.name} ${meta.width}x${meta.height}`);
  }
}

async function buildPhotos() {
  await fs.mkdir(outPhotos, { recursive: true });
  const credits = [];
  for (const p of PHOTOS) {
    const target = path.join(outPhotos, `${p.name}-1280.webp`);
    const exists = await fs.access(target).then(() => true, () => false);
    if (!exists) {
      if (/wikimedia/.test(p.url)) await sleep(2000);
      const buf = await download(p.url);
      await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }).toFile(target);
      await sharp(buf).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 76 }).toFile(path.join(outPhotos, `${p.name}-640.webp`));
    }
    const meta = await sharp(target).metadata();
    console.log(`photo ${p.name} ${meta.width}x${meta.height}`);
    credits.push({ name: p.name, author: p.author, license: p.license, source: p.source, width: meta.width, height: meta.height });
  }
  await fs.writeFile(creditsFile, `${JSON.stringify(credits, null, 2)}\n`);
}

const mode = process.argv[2];
if (!mode || mode === "cutouts") await buildCutouts();
if (!mode || mode === "photos") await buildPhotos();
