// Plain-language explanations of Canadian weather and clothing concepts.

import type { Profile } from "./types";

export interface Concept {
  key: string;
  title: string;
  short: string;
  body: string[];
}

export const CONCEPTS: Concept[] = [
  {
    key: "feels-like", title: "Feels-like temperature",
    short: "What the air feels like on your skin, after wind and humidity.",
    body: [
      "Canadian forecasts give two numbers: the actual temperature and what it feels like. In winter, wind makes it feel colder (wind chill). In summer, humidity makes it feel hotter (humidex).",
      "Dress for the feels-like number, not the actual temperature.",
    ],
  },
  {
    key: "wind-chill", title: "Wind chill",
    short: "Wind pulls heat away from your body, so -5°C with wind can feel like -15°C.",
    body: [
      "Still air next to your skin warms up and acts like a blanket. Wind blows that warm air away, so you lose heat much faster.",
      "This is why a thin windproof jacket over a sweater can feel warmer than a thick knit coat that lets wind through.",
      "Environment Canada issues cold warnings based on wind chill. Below about -27, exposed skin can get frostbite within 30 minutes.",
    ],
  },
  {
    key: "layering", title: "Layering",
    short: "Several thinner layers beat one thick one. You can add or remove them as the day changes.",
    body: [
      "Base layer: against your skin. A thin thermal or regular top.",
      "Mid layer: insulation. A sweater, fleece or hoodie traps warm air.",
      "Outer layer: protection. A coat or shell blocks wind, rain and snow.",
      "Canadian buildings are heated to around 21°C, so you go from -15 outside to +21 inside many times a day. Layers let you take warmth off at the door and put it back on before going out.",
    ],
  },
  {
    key: "insulation", title: "Insulation",
    short: "Clothes keep you warm by trapping still air. Down, fleece and wool trap a lot of it.",
    body: [
      "Down (feathers) is the warmest for its weight but loses warmth when wet. Synthetic insulation stays warm when damp and is cheaper.",
      "Wool stays warm even when a bit wet, which is why wool socks are so good in winter.",
      "Cotton (jeans, t-shirts, hoodies) holds water and loses its warmth when wet. Fine for dry days, poor for slush and rain.",
    ],
  },
  {
    key: "waterproofing", title: "Waterproof vs water resistant",
    short: "Water resistant handles light rain. Waterproof keeps you dry in a downpour or slush.",
    body: [
      "Water-resistant fabric sheds light rain for a while but soaks through eventually.",
      "Waterproof gear has a membrane or coating and sealed seams. Look for 'waterproof' on boots especially: winter sidewalks are covered in salty slush.",
      "Road salt leaves white stains on leather and suede. Wipe boots with a damp cloth (a little vinegar helps).",
    ],
  },
  {
    key: "frostbite", title: "Frostbite",
    short: "Skin freezing. Ears, nose, cheeks, fingers and toes are most at risk.",
    body: [
      "Early signs: skin turns white or greyish-yellow and feels numb or waxy. Get indoors and warm the area gently. Don't rub it.",
      "Prevent it by covering all skin on very cold days: toque over your ears, mittens, and a scarf or neck warmer over your face.",
    ],
  },
  {
    key: "black-ice", title: "Black ice",
    short: "A thin, clear layer of ice that looks like a wet sidewalk.",
    body: [
      "It forms when rain or melted snow freezes, often around 0°C and especially in the morning.",
      "Wear boots with a grippy rubber sole, take short flat steps, and keep your hands free (not in your pockets) for balance.",
    ],
  },
  {
    key: "uv", title: "UV index",
    short: "How strong the sun's burning rays are. 6 or higher is high.",
    body: [
      "The UV index can be high even when it's cool. In winter, snow reflects sunlight, so sunglasses help on bright days.",
    ],
  },
  {
    key: "seasons", title: "Canadian seasons",
    short: "Four distinct seasons, and weather can change a lot within a single day.",
    body: [
      "Fall (Sep to Nov): mild days and cold mornings, more rain. A good time to start building layers.",
      "Winter (Dec to Mar): below 0°C most days in most cities, with snow, slush and cold wind. Coastal Vancouver is milder and rainy; the prairies are colder and drier.",
      "Spring (Mar to May): melting snow, rain, and big swings between cold mornings and warm afternoons.",
      "Summer (Jun to Aug): warm to hot and often humid, with strong sun.",
    ],
  },
];

export const conceptByKey = (k: string) => CONCEPTS.find((c) => c.key === k);

/** Personalised welcome advice based on where the user comes from. Never assumes a budget. */
export function onboardingAdvice(profile: Pick<Profile, "homeClimate" | "coldExperience" | "budgetCad">): string[] {
  const out: string[] = [];
  switch (profile.homeClimate) {
    case "tropical":
      out.push("Coming from a warm climate, your body isn't used to the cold yet. Most people feel colder in their first winter, so we'll recommend slightly warmer outfits until you tell us otherwise.");
      break;
    case "arid":
      out.push("You may be used to big day-to-night temperature swings, which helps. The new parts will be wind, snow and wet slush, so we'll focus on wind and water protection.");
      break;
    case "temperate":
      out.push("You'll recognise fall and spring, but Canadian winters are usually colder and longer. We'll flag the days that need real winter gear.");
      break;
    case "cold":
      out.push("You already know cold weather. We'll focus on local specifics like wind chill warnings, slush and heated indoor spaces.");
      break;
    default:
      out.push("We'll explain new weather terms as they come up, so you can learn as you go.");
  }
  if (profile.coldExperience === "none") {
    out.push("You don't need to buy a full winter wardrobe at once. Start with what you own, and we'll tell you which one or two items make the biggest difference first.");
  }
  if (profile.budgetCad > 0 && profile.budgetCad < 150) {
    out.push("With a tight budget, second-hand stores and community clothing drives can stretch your money a long way. We'll prioritise the cheapest items that make the biggest difference.");
  }
  return out;
}
