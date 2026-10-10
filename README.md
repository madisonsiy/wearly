# Wearly

**An AI-powered wardrobe and weather assistant that helps newcomers dress for Canada's unpredictable weather in every season, using the clothes they already own, and build a wardrobe gradually within their budget.**

Built for the ElleHacks × Hacktoberfest Hack Day 2026 (Best Open-Source AI Project).

Wearly answers three connected questions:

1. **What should I wear today?** Based on the real hourly forecast *and* when you're actually outside (commute, waiting for the bus, walking between buildings).
2. **How can I make it work with what I own?** Outfits are built only from your wardrobe. When something essential is missing, it improvises (e.g. a windbreaker over two sweaters) and says clearly when that isn't enough.
3. **What should I buy, if anything?** Wardrobe gaps ranked by importance and exposure, with a purchase plan that never exceeds your budget.

## Who it helps

Newcomers to Canada (international students, new immigrants, refugees) facing their first Canadian winter, who don't know what wind chill means, don't own a parka yet, and can't afford to buy everything at once. It's useful for anyone who wants weather advice that fits their actual day.

## Features (MVP)

Designed as a phone app (installable to the home screen), with five tabs: Today, Closet, Shop, Learn, Settings.

| Feature | Where |
| --- | --- |
| 3-question onboarding: name, comfort (gets cold, runs warm, sweats easily, no bulky layers, sun-sensitive), location (GPS or city search) | `Onboarding.tsx` |
| Today: live local clock (city's time zone, updates every minute), weather summary (temp, feels-like, rain, wind, UV, humidity), hourly strip, weather alerts for every season (heat/humidex, UV, storms, rain, wind, ice, snow, frostbite) | `src/lib/weather.ts`, `TodayView.tsx` |
| Outfit from your own clothes, plus alternatives, scored over every sensible layering combination | `src/lib/outfit.ts` |
| "Make it work": for each missing or unsuitable item, a workaround using what you own, and an honest status (good / small tweaks / limited / needs proper gear) | `buildOutfit()` |
| Personalize: no plan needed (dresses you for the whole day by default); add a plan for one date (e.g. October 14) or a repeating one (every day, weekdays, Mon/Wed/Fri, any days you pick); build the outfit around an item you want to wear | `PlanEditor`, `activePlan()` |
| Closet: add by photo (AI recognition, works on flat-lays or photos of someone wearing the clothes) or by name; your own photo on every item (tap to add), with a coloured illustration until then; door-opening animation and a 3D carousel of today's picks (drag or arrows); mark items in the wash | `WardrobeView.tsx`, `src/lib/garments.ts` |
| Shop: all-season gap detection, "want something?" check against what you own, budget plan (CAD) that never overspends | `src/lib/gaps.ts`, `src/lib/shop.ts` |
| Learn: short explainers (feels-like, humidex, wind chill, layering, waterproofing, storms, UV, seasons) | `src/lib/education.ts` |
| Preview a snowy January, rainy April, hot July or crisp October day to see how your closet holds up | Today tab |
| Seasonal look: animated splash and onboarding art (summer waves, spring cherry blossoms, fall maple leaves, winter snow), pastel palette per season, phone-style bottom nav | `SeasonScene.tsx`, `globals.css` |

## Open-weight AI: what it does

Wearly uses **[Qwen2.5-VL 7B Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)**, an open-weight small vision-language model (≈7B parameters, [Apache-2.0 license](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/blob/main/LICENSE)), served locally with [Ollama](https://ollama.com/library/qwen2.5vl) (`qwen2.5vl:7b`).

It also ships a second, smaller open-weight model that runs in the browser with no server: **[CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32)** (MIT license), loaded through [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) as `Xenova/clip-vit-base-patch32`. It classifies a photo against Wearly's garment library zero-shot (`src/lib/localVision.ts`), so photo recognition works even without Ollama or a token.

The models do the parts that need perception and language:

- **Clothing recognition**: identifies garments in a photo with type, colour, visible material and estimated warmth / water / wind protection (`src/lib/ai.ts → recognizeGarments`).
- **Explanations**: turns the engine's facts into a short, friendly explanation of why an outfit works, and why a wardrobe gap matters (`explain`).

The model is **not** trusted with anything safety- or money-related. Explicit rules handle those:

- Forecast data comes from Open-Meteo; wind chill and frostbite thresholds follow Environment Canada.
- Model output is validated against a garment library. Known garment types take their warmth / waterproofing from the library, and the model can only lower them one step (`normalizeRecognition`). Users confirm every AI-detected item before it's added.
- Outfit status, limitations and the "needs proper winter gear" rule are computed by the engine and passed to the model as fixed facts. The prompt forbids inventing items or softening warnings, and the UI always shows the rule-based status next to the model's text.
- Budget plans never exceed the budget (unit-tested), and products come from a data file with explicit prices and links.

Any OpenAI-compatible endpoint works (Ollama, vLLM, llama.cpp server, LM Studio), so you can swap in another open-weight model such as Llama 3.2 Vision 11B or Gemma 3. If no model server is running, the app still works fully: photos are recognised by the in-browser CLIP model and explanations are rule-based.

## Run it

Requirements: Node 20+.

```bash
npm install
npm run dev        # open http://localhost:3000 (use your browser's phone view, or open the Network URL on your phone)
```

### Turn on the AI (photo recognition and explanations)

**Built in, no setup:** photos are recognised right in the browser with OpenAI's CLIP ViT-B/32 (open weights, MIT licence, run via Transformers.js, Apache-2.0, model `Xenova/clip-vit-base-patch32`). It picks the garment type out of every type Wearly knows (so a tank top and a hoodie get different warmth), and the colour comes from the photo's pixels. The model (~90 MB) downloads once and the browser caches it. It's also the fallback when the AI server below fails.

For richer results (several items in one photo, materials, written explanations), also connect Qwen2.5-VL. Pick one:

**Option A: on your computer with Ollama (free, private, ~6 GB download)**

```bash
brew install ollama        # or download from https://ollama.com
ollama serve               # leave running in its own terminal
ollama pull qwen2.5vl:7b
```

Restart `npm run dev`. Settings → AI model should say "Connected".

**Option B: hosted, no download.** Create a free token at https://huggingface.co/settings/tokens, then create `.env.local`:

```bash
WEARLY_AI_BASE_URL=https://router.huggingface.co/v1
WEARLY_AI_API_KEY=hf_your_token_here
WEARLY_VISION_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
WEARLY_TEXT_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
```

If photo upload says "Can't reach the model server", the app couldn't connect to either option.

**Photos slow?** A 7B vision model running on a laptop (Option A) can take 30 seconds to a few minutes per photo and slows the whole computer while it works, especially without a strong GPU. The first photo is slowest because the model has to load into memory. Wearly sends the model a small 448px copy and shows a timer with a "Fill it in myself" button, which stops the model. For a quick demo, use Option B so the model runs on Hugging Face instead of your laptop.

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
