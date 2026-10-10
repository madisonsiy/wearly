"use client";

// In-browser garment recognition, used when no AI server is connected (or it fails).
// Runs OpenAI's CLIP ViT-B/32 (MIT licence, open weights) through Transformers.js
// (Apache-2.0) entirely on the user's device: zero-shot it scores the photo against
// every garment type Wearly knows, and the colour comes from the photo's pixels.
// The model (~90 MB) downloads once from Hugging Face and is cached by the browser.

import { GARMENT_PRESETS, itemFromPreset, type GarmentPreset } from "./garments";
import type { ClothingItem } from "./types";
import { COLORS } from "@/components/GarmentArt";

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6";
export const LOCAL_MODEL = "Xenova/clip-vit-base-patch32";

type Classifier = (image: string, labels: string[], opts: { hypothesis_template: string }) => Promise<{ label: string; score: number }[]>;
type Progress = (pct: number | null) => void;

// Import from the CDN at runtime so the bundler leaves the library (and its WebAssembly) alone.
const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let classifier: Promise<Classifier> | null = null;
const loaded: Record<string, number> = {};

function load(onProgress?: Progress): Promise<Classifier> {
  if (!classifier) {
    classifier = importUrl(TRANSFORMERS_URL)
      .then((t) => {
        t.env.allowLocalModels = false;
        return t.pipeline("zero-shot-image-classification", LOCAL_MODEL, {
          progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
            if (p.status === "progress" && p.file && p.total) {
              loaded[p.file] = p.loaded! / p.total;
              const files = Object.values(loaded);
              onProgress?.(Math.round((files.reduce((a, b) => a + b, 0) / files.length) * 100));
            }
          },
        });
      })
      .catch((e) => {
        classifier = null;
        throw e;
      });
  }
  return classifier;
}

// Plain phrases CLIP understands better than our internal type names.
const PHRASE: Record<string, string> = {
  "t-shirt": "short-sleeve t-shirt",
  "tank top": "sleeveless tank top",
  "long-sleeve shirt": "long-sleeve shirt",
  "thermal top": "thermal base layer top",
  "down vest": "puffy sleeveless vest",
  "light jacket": "light jacket",
  "lined pants": "lined winter pants",
  "thermal leggings": "thermal long underwear",
  "neck warmer": "neck gaiter",
  cap: "baseball cap",
  toque: "knit winter hat",
};

/** Most common colour in the middle of the photo, ignoring the background colour from the corners. */
async function dominantColor(dataUrl: string): Promise<string | undefined> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  const px = (x: number, y: number) => [d[(y * s + x) * 4], d[(y * s + x) * 4 + 1], d[(y * s + x) * 4 + 2]];
  const corners = [px(1, 1), px(s - 2, 1), px(1, s - 2), px(s - 2, s - 2)];
  const bg = corners.map((_, i) => corners.reduce((a, cc) => a + cc[i], 0) / 4);
  const buckets = new Map<string, { n: number; sum: number[] }>();
  for (let y = Math.floor(s * 0.2); y < s * 0.8; y++)
    for (let x = Math.floor(s * 0.2); x < s * 0.8; x++) {
      const p = px(x, y);
      if (Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) < 40) continue;
      const key = p.map((v) => v >> 5).join();
      const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
      b.n++;
      p.forEach((v, i) => (b.sum[i] += v));
      buckets.set(key, b);
    }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) return undefined;
  const avg = top.sum.map((v) => v / top.n);
  let best: string | undefined;
  let bd = Infinity;
  for (const [name, hex] of Object.entries(COLORS)) {
    if (name === "gray" || name === "denim") continue;
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const dist = Math.hypot(rgb[0] - avg[0], rgb[1] - avg[1], rgb[2] - avg[2]);
    if (dist < bd) {
      bd = dist;
      best = name;
    }
  }
  return best;
}

export interface LocalResult {
  item: ClothingItem;
  confidence: number;
  runnerUp?: string;
}

/** Recognise the main garment in a photo on this device. */
export async function recognizeLocally(dataUrl: string, photo: string, onProgress?: Progress): Promise<LocalResult> {
  const clf = await load(onProgress);
  onProgress?.(null);
  const presets = GARMENT_PRESETS.filter((p) => p.subtype !== "umbrella" && p.subtype !== "sunglasses");
  const labels = presets.map((p) => PHRASE[p.subtype] ?? p.subtype);
  const [ranked, color] = await Promise.all([clf(dataUrl, labels, { hypothesis_template: "a photo of a {}" }), dominantColor(dataUrl).catch(() => undefined)]);
  const byLabel = (l: string): GarmentPreset => presets[labels.indexOf(l)];
  const preset = byLabel(ranked[0].label);
  const name = color ? `${color[0].toUpperCase()}${color.slice(1)} ${preset.subtype}` : preset.subtype[0].toUpperCase() + preset.subtype.slice(1);
  return {
    item: { ...itemFromPreset(preset, { name }), color, photo, source: "ai" },
    confidence: ranked[0].score,
    runnerUp: ranked[1] ? byLabel(ranked[1].label).subtype : undefined,
  };
}
