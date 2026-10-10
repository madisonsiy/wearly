// Open-weight model hookup (server-side only).
//
// Wearly talks to any OpenAI-compatible chat endpoint. The default is a local
// Ollama server running Qwen2.5-VL 7B (Apache-2.0), an open-weight small vision
// language model. vLLM, LM Studio, llama.cpp server or a hosted open-weight
// endpoint work too: just change the env vars.
//
// The model is used for what it's good at (seeing garments in photos, writing
// friendly explanations). Weather, safety status, budgets and product data never
// come from the model: they are computed by rules and passed in as facts.

import { findPreset, isCategory, clampInt } from "./garments";
import type { Category } from "./types";

export const AI_BASE_URL = process.env.WEARLY_AI_BASE_URL ?? "http://localhost:11434/v1";
export const AI_API_KEY = process.env.WEARLY_AI_API_KEY ?? "ollama";
export const VISION_MODEL = process.env.WEARLY_VISION_MODEL ?? "qwen2.5vl:7b";
export const TEXT_MODEL = process.env.WEARLY_TEXT_MODEL ?? VISION_MODEL;
const TIMEOUT_MS = Number(process.env.WEARLY_AI_TIMEOUT_MS ?? 60000);

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

export async function chat(model: string, messages: { role: "system" | "user"; content: Content }[], json = false, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: json ? 0.1 : 0.4,
      // Short answers keep a local model quick; garment JSON and explanations are both small.
      max_tokens: json ? 600 : 350,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    // Stop the model too when the user gives up waiting, so it doesn't keep the laptop busy.
    signal: signal ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal]) : AbortSignal.timeout(TIMEOUT_MS),
  });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError") throw new Error("The model took too long to answer");
    if (err.name === "AbortError") throw new Error("Cancelled");
    throw new Error(`Can't reach the model server at ${AI_BASE_URL}. Is Ollama running?`);
  }
  if (!res.ok) {
    // Some servers don't support JSON mode; retry once without it.
    if (json && res.status === 400) return chat(model, messages, false, signal);
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    if (res.status === 401 || res.status === 403) throw new Error("The model server rejected the key. For Hugging Face, check the token in .env.local and that it has the \"Make calls to Inference Providers\" permission");
    if (res.status === 404) throw new Error(`The model "${model}" isn't available on this server${detail ? ` (${detail})` : ""}`);
    if (res.status === 402 || res.status === 429) throw new Error("The free model quota is used up for now. Try again later or use Ollama");
    throw new Error(`Model server returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Model returned no content");
  return text;
}

export interface RecognizedGarment {
  name: string;
  category: Category;
  subtype: string;
  material?: string;
  color?: string;
  warmth: number;
  waterResistance: 0 | 1 | 2;
  windResistance: 0 | 1 | 2;
  layerable: boolean;
  confidence: number;
  notes?: string;
}

const RECOGNIZE_PROMPT = `You are a clothing recognition assistant for a wardrobe app.
Look at the photo and identify every distinct clothing item or accessory you can clearly see (max 5).
The clothes may be laid flat, on a hanger, or worn by a person: in that case list what the person is wearing (ignore the person themselves).
Return ONLY JSON in this shape:
{"items":[{"name":"short friendly name, e.g. 'grey wool sweater'","category":"base|mid|outer|bottom|footwear|head|hands|neck|accessory","subtype":"e.g. t-shirt, hoodie, wool sweater, rain jacket, puffer jacket, winter parka, jeans, leggings, sneakers, winter boots, toque, mittens, scarf, wool socks, umbrella","material":"only if visibly identifiable, else omit","color":"main colour","warmth":0-5,"waterResistance":0-2,"windResistance":0-2,"layerable":true|false,"confidence":0-1,"notes":"anything uncertain"}]}
Categories: base = tops worn against the skin; mid = sweaters/hoodies/fleece; outer = jackets and coats.
Warmth: 0 none, 1 light (t-shirt), 2 (hoodie), 3 (fleece, wool sweater), 4 (puffer, wool coat), 5 (heavy winter parka).
Do not guess materials you cannot see. If nothing wearable is visible, return {"items":[]}.`;

/** Validate and normalise model output with explicit rules. Unknown values fall back to preset defaults. */
const CATEGORY_WORDS: [RegExp, Category][] = [
  [/coat|jacket|parka|puffer|windbreaker|raincoat|blazer|vest|anorak/, "outer"],
  [/hoodie|sweater|sweatshirt|cardigan|fleece|pullover|jumper/, "mid"],
  [/shirt|tee|top|blouse|tank|polo|camisole|bodysuit/, "base"],
  [/pant|jean|trouser|short|skirt|legging|jogger|chino|dress/, "bottom"],
  [/shoe|boot|sneaker|sandal|heel|loafer|slipper|trainer/, "footwear"],
  [/hat|cap|toque|beanie|tuque|hood/, "head"],
  [/glove|mitt/, "hands"],
  [/scarf|neck/, "neck"],
];
const DEFAULT_WARMTH: Record<Category, number> = { base: 1, mid: 2, outer: 3, bottom: 1, footwear: 1, head: 1, hands: 2, neck: 2, accessory: 0 };

/** Models don't always follow the schema exactly: accept {items}, {clothing}, a bare array or a single item. */
function itemsFrom(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const k of ["items", "clothing", "garments", "clothes", "results"]) if (Array.isArray(obj[k])) return obj[k] as unknown[];
  return "name" in obj || "subtype" in obj ? [obj] : [];
}

export function normalizeRecognition(raw: unknown): RecognizedGarment[] {
  const items = itemsFrom(raw);
  const out: RecognizedGarment[] = [];
  for (const it of items.slice(0, 5)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const subtype = String(r.subtype ?? r.name ?? "").trim();
    const name = String(r.name ?? subtype).trim().slice(0, 60);
    if (!subtype && !name) continue;
    const preset = findPreset(subtype) ?? findPreset(name);
    const guessed = CATEGORY_WORDS.find(([re]) => re.test(`${subtype} ${name}`.toLowerCase()))?.[1];
    const rc = typeof r.category === "string" ? r.category.toLowerCase().trim() : r.category;
    const category: Category | undefined = isCategory(rc) ? rc : preset?.category ?? guessed;
    if (!category) continue;
    // When we recognise the garment type, our preset values win over the model's guess,
    // except that the model may lower warmth/water by one step (e.g. a thin version).
    const modelWarmth = clampInt(r.warmth, 0, 5, preset?.warmth ?? DEFAULT_WARMTH[category]);
    const warmth = preset ? Math.max(preset.warmth - 1, Math.min(preset.warmth, modelWarmth)) : modelWarmth;
    const water = preset ? preset.waterResistance : (clampInt(r.waterResistance, 0, 2, 0) as 0 | 1 | 2);
    const wind = preset ? preset.windResistance : (clampInt(r.windResistance, 0, 2, 0) as 0 | 1 | 2);
    const confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0.5));
    out.push({
      name: name || subtype,
      category: preset && preset.category !== category && confidence < 0.8 ? preset.category : category,
      subtype: preset?.subtype ?? subtype,
      material: typeof r.material === "string" && r.material.trim() ? r.material.trim().slice(0, 40) : undefined,
      color: typeof r.color === "string" ? r.color.slice(0, 30) : undefined,
      warmth,
      waterResistance: water,
      windResistance: wind,
      layerable: typeof r.layerable === "boolean" ? r.layerable : preset?.layerable ?? true,
      confidence,
      notes: typeof r.notes === "string" ? r.notes.slice(0, 200) : undefined,
    });
  }
  return out;
}

export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No JSON in model output");
    return JSON.parse(m[0]);
  }
}

export async function recognizeGarments(imageDataUrl: string, signal?: AbortSignal): Promise<RecognizedGarment[]> {
  const text = await chat(
    VISION_MODEL,
    [
      { role: "system", content: RECOGNIZE_PROMPT },
      { role: "user", content: [{ type: "text", text: "Identify the clothing in this photo." }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    true,
    signal,
  );
  return normalizeRecognition(parseJsonLoose(text));
}

const EXPLAIN_SYSTEM = `You are Wearly, a friendly assistant helping newcomers to Canada dress for the weather.
You will receive FACTS computed by the app (forecast, chosen outfit, safety status, limitations, wardrobe gaps).
Rules:
- Only mention clothing items listed in the facts. Never invent items the user doesn't own.
- Never contradict or soften the safety status or limitations. If the status is "needs-gear" or "limited", say so clearly.
- Don't recommend purchases unless the facts include wardrobe gaps.
- Use plain, warm, simple English (many readers are new to English and to cold climates). Explain any weather term you use.
- 3 to 5 short sentences. No lists, no markdown headings.`;

export async function explain(kind: "outfit" | "gaps", facts: unknown): Promise<string> {
  const task = kind === "outfit"
    ? "Explain why this outfit works for today and which part of the day each layer matters most. Mention any limitation honestly."
    : "Explain which missing item matters most and why, and what the user can do in the meantime with what they own.";
  const text = await chat(TEXT_MODEL, [
    { role: "system", content: EXPLAIN_SYSTEM },
    { role: "user", content: `${task}\n\nFACTS:\n${JSON.stringify(facts, null, 1).slice(0, 6000)}` },
  ]);
  return text.trim().slice(0, 1500);
}
