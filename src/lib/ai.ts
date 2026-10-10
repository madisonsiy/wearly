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

export async function chat(model: string, messages: { role: "system" | "user"; content: Content }[], json = false): Promise<string> {
  const res = await fetch(`${AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: json ? 0.1 : 0.4,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Model endpoint returned ${res.status}`);
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
Return ONLY JSON in this shape:
{"items":[{"name":"short friendly name, e.g. 'grey wool sweater'","category":"base|mid|outer|bottom|footwear|head|hands|neck|accessory","subtype":"e.g. t-shirt, hoodie, wool sweater, rain jacket, puffer jacket, winter parka, jeans, leggings, sneakers, winter boots, toque, mittens, scarf, wool socks, umbrella","material":"only if visibly identifiable, else omit","color":"main colour","warmth":0-5,"waterResistance":0-2,"windResistance":0-2,"layerable":true|false,"confidence":0-1,"notes":"anything uncertain"}]}
Categories: base = tops worn against the skin; mid = sweaters/hoodies/fleece; outer = jackets and coats.
Warmth: 0 none, 1 light (t-shirt), 2 (hoodie), 3 (fleece, wool sweater), 4 (puffer, wool coat), 5 (heavy winter parka).
Do not guess materials you cannot see. If nothing wearable is visible, return {"items":[]}.`;

/** Validate and normalise model output with explicit rules. Unknown values fall back to preset defaults. */
export function normalizeRecognition(raw: unknown): RecognizedGarment[] {
  const obj = raw as { items?: unknown[] } | null;
  const items = Array.isArray(obj?.items) ? obj!.items : [];
  const out: RecognizedGarment[] = [];
  for (const it of items.slice(0, 5)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const subtype = String(r.subtype ?? r.name ?? "").trim();
    const name = String(r.name ?? subtype).trim().slice(0, 60);
    if (!subtype && !name) continue;
    const preset = findPreset(subtype) ?? findPreset(name);
    const category: Category | undefined = isCategory(r.category) ? r.category : preset?.category;
    if (!category) continue;
    // When we recognise the garment type, our preset values win over the model's guess,
    // except that the model may lower warmth/water by one step (e.g. a thin version).
    const modelWarmth = clampInt(r.warmth, 0, 5, preset?.warmth ?? 1);
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

export async function recognizeGarments(imageDataUrl: string): Promise<RecognizedGarment[]> {
  const text = await chat(
    VISION_MODEL,
    [
      { role: "system", content: RECOGNIZE_PROMPT },
      { role: "user", content: [{ type: "text", text: "Identify the clothing in this photo." }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    true,
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
