# Wearly

**An AI-powered wardrobe and weather assistant that helps newcomers dress for Canada's unpredictable climate using the clothes they already own, and build a winter wardrobe gradually within their budget.**

Built for the ElleHacks × Hacktoberfest Hack Day 2026 (Best Open-Source AI Project).

Wearly answers three connected questions:

1. **What should I wear today?** Based on the real hourly forecast *and* when you're actually outside (commute, waiting for the bus, walking between buildings).
2. **How can I make it work with what I own?** Outfits are built only from your wardrobe. When something essential is missing, it improvises (e.g. a windbreaker over two sweaters) and says clearly when that isn't enough.
3. **What should I buy, if anything?** Wardrobe gaps ranked by importance and exposure, with a purchase plan that never exceeds your budget.

## Who it helps

Newcomers to Canada (international students, new immigrants, refugees) facing their first Canadian winter, who don't know what wind chill means, don't own a parka yet, and can't afford to buy everything at once. It's useful for anyone who wants weather advice that fits their actual day.

## Features (MVP)

| Feature | Where |
| --- | --- |
| Current, hourly and 7-day forecast: temperature, feels-like, wind chill, wind, precipitation, snow, humidity, UV | `src/lib/weather.ts`, Today tab |
| Weather alerts (frostbite risk per Environment Canada, ice, snow, rain, wind, UV, big temperature swings) | `analyzeDay()` |
| Wardrobe: add by photo (AI recognition) or by name, edit any detail, mark items unavailable | Wardrobe tab, `src/lib/garments.ts` |
| Routine personalisation: commute mode and minutes outside, midday time outside, heated / AC / outdoor workplace, cold sensitivity, dislike of bulk | My routine tab |
| Daily outfit + alternatives, scored over every sensible layering combination, with a "your day" plan for indoor/outdoor transitions | `src/lib/outfit.ts` |
| Improvisation when essentials are missing, with honest status: good / workaround / limited / needs proper gear | `buildOutfit()` |
| Wardrobe gap detection, prioritised by importance, exposure and this week's forecast; covered needs are never shopped for | `src/lib/gaps.ts` |
| Budget (CAD) purchase plan: essentials first, best value per dollar, "buy later" list, option comparison, thrift tips | `src/lib/shop.ts`, `src/data/products.json` |
| Newcomer onboarding and plain-language explainers (feels-like, wind chill, layering, insulation, waterproofing, frostbite, black ice, UV, seasons) | `src/lib/education.ts`, Learn tab |
| Profile and wardrobe saved on your device | `src/lib/storage.ts` |
| "Preview a January day" to see how your wardrobe would hold up in winter | Today tab |

## Open-weight AI: what it does

Wearly uses **[Qwen2.5-VL 7B Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)**, an open-weight small vision-language model (≈7B parameters, [Apache-2.0 license](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/blob/main/LICENSE)), served locally with [Ollama](https://ollama.com/library/qwen2.5vl) (`qwen2.5vl:7b`).

The model does the parts that need perception and language:

- **Clothing recognition**: identifies garments in a photo with type, colour, visible material and estimated warmth / water / wind protection (`src/lib/ai.ts → recognizeGarments`).
- **Explanations**: turns the engine's facts into a short, friendly explanation of why an outfit works, and why a wardrobe gap matters (`explain`).

The model is **not** trusted with anything safety- or money-related. Explicit rules handle those:

- Forecast data comes from Open-Meteo; wind chill and frostbite thresholds follow Environment Canada.
- Model output is validated against a garment library. Known garment types take their warmth / waterproofing from the library, and the model can only lower them one step (`normalizeRecognition`). Users confirm every AI-detected item before it's added.
- Outfit status, limitations and the "needs proper winter gear" rule are computed by the engine and passed to the model as fixed facts. The prompt forbids inventing items or softening warnings, and the UI always shows the rule-based status next to the model's text.
- Budget plans never exceed the budget (unit-tested), and products come from a data file with explicit prices and links.

Any OpenAI-compatible endpoint works (Ollama, vLLM, llama.cpp server, LM Studio), so you can swap in another open-weight model such as Llama 3.2 Vision 11B or Gemma 3. If no model is running, the app still works fully: photo items can be described by hand and explanations are rule-based.

## Run it

Requirements: Node 20+ and (for AI features) [Ollama](https://ollama.com).

```bash
# 1. AI model (optional but recommended)
ollama pull qwen2.5vl:7b        # ~6 GB; runs on a recent laptop
ollama serve                     # if not already running

# 2. App
npm install
cp .env.example .env.local       # adjust if your model runs elsewhere
npm run dev                      # http://localhost:3000
```

Tests and checks:

```bash
npm test           # engine unit tests (weather rules, outfits, gaps, budget, AI output validation)
npm run typecheck
npm run build
```

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) + React 19 + TypeScript, plain CSS
- [Open-Meteo](https://open-meteo.com) forecast and geocoding APIs (free, no API key, [CC BY 4.0 data](https://open-meteo.com/en/license))
- Ollama / any OpenAI-compatible server for the open-weight model
- Vitest for tests

## Project layout

```
src/
  app/                 Next.js pages and API routes (weather, geocode, recognize, explain, ai-status)
  components/          UI: onboarding, today, wardrobe, gaps & budget, routine, learn
  lib/
    weather.ts         Open-Meteo parsing, wind chill, routine-aware day analysis and alerts
    outfit.ts          Outfit engine: layering search, improvisation, limitations, day plan
    gaps.ts            Wardrobe gap detection and prioritisation
    shop.ts            Budget-aware purchase planner
    ai.ts              Open-weight model client, prompts and output validation
    garments.ts        Garment library (warmth / water / wind defaults)
    education.ts       Newcomer explainers
  data/products.json   Product catalogue (CAD reference prices, retailer links)
tests/                 Unit tests
```

## Limitations and next steps

- Product prices in `products.json` are typical reference prices and links open the retailer's search for that item; they are not live quotes. Live, verified availability is the next step.
- Profile and wardrobe are stored in the browser only.
- Future: learn from "I was too cold / too warm" feedback, live product data, outfit images.

## License

[MIT](LICENSE)
