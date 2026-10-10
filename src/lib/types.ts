// Shared domain types for Wearly.

export type Category =
  | "base" // t-shirts, thermals, blouses: worn against skin on the torso
  | "mid" // sweaters, hoodies, fleece, cardigans: insulating layer
  | "outer" // jackets and coats
  | "bottom" // pants, jeans, skirts, leggings
  | "footwear"
  | "head" // toque, cap, hood-less hat
  | "hands" // gloves, mittens
  | "neck" // scarf, neck warmer
  | "accessory"; // umbrella, sunglasses, socks, etc.

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  /** Free-text subtype like "hoodie", "parka", "rain jacket", "jeans". */
  subtype: string;
  material?: string;
  /** 0 (none) to 5 (heavy winter insulation). */
  warmth: number;
  /** 0 none, 1 water resistant, 2 waterproof. */
  waterResistance: 0 | 1 | 2;
  /** 0 none, 1 partial, 2 windproof. */
  windResistance: 0 | 1 | 2;
  /** Whether it can be worn under/over other layers comfortably. */
  layerable: boolean;
  /** Is it clean / available for recommendations today. */
  available: boolean;
  /** Data URL photo of the user's actual item. */
  photo?: string;
  /** Main colour, used to tint the illustration when there's no photo. */
  color?: string;
  /** "ai" when created by photo recognition and not yet confirmed. */
  source?: "manual" | "ai" | "ai-confirmed";
}

export type CommuteMode = "walk" | "transit" | "car" | "bike" | "none";

/** What the user's day looks like. Optional: without one we dress for the whole daytime. */
export interface Routine {
  /** Hour of day (0-23) the user leaves home. */
  leaveHour: number;
  /** Hour of day the user returns home. */
  returnHour: number;
  commuteMode: CommuteMode;
  /** One-way commute minutes spent outside (walking, waiting for the bus). */
  commuteOutdoorMinutes: number;
  /** Extra outdoor minutes during the day (lunch walk, between buildings). */
  middayOutdoorMinutes: number;
  /** Indoor environment where most of the day is spent. */
  indoorEnvironment: "heated" | "air-conditioned" | "variable" | "outdoors-job";
}

/** When a plan applies: one specific date, or certain weekdays every week. */
export type PlanSchedule =
  | { kind: "date"; date: string }
  /** Repeats on the chosen weekdays (0 = Sunday). `every` 2 means every other week, counted from `start`. */
  | { kind: "weekly"; days: number[]; every?: number; start?: string; until?: string };

/** A named routine with a flexible schedule (e.g. "Class days" every Mon/Wed/Fri, or "Job interview" on Oct 14). */
export interface Plan extends Routine {
  id: string;
  label: string;
  schedule: PlanSchedule;
}

export interface Preferences {
  /** -2 runs very hot ... 0 average ... +2 gets cold very easily. */
  coldSensitivity: number;
  sweatsEasily: boolean;
  dislikesBulk: boolean;
  sunSensitive: boolean;
}

export interface Profile {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  preferences: Preferences;
  /** Optional routines. A date-specific plan wins over a weekly one. */
  plans: Plan[];
  /** Item the user wants to wear today; outfits are built around it. */
  pinned?: { itemId: string; date: string };
  /** Clothes the user would like to own. */
  wishlist: string[];
  /** Budget in CAD available for wardrobe purchases. */
  budgetCad: number;
  onboarded: boolean;
}

export interface HourlyWeather {
  time: string; // ISO local time
  temperature: number; // °C
  feelsLike: number; // °C apparent temperature
  windSpeed: number; // km/h
  windGusts: number; // km/h
  precipitationProbability: number; // %
  precipitation: number; // mm
  snowfall: number; // cm
  humidity: number; // %
  uvIndex: number;
  weatherCode: number;
}

export interface DailyWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  feelsLikeMax: number;
  feelsLikeMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  uvIndexMax: number;
  weatherCode: number;
}

export interface Forecast {
  latitude: number;
  longitude: number;
  timezone: string;
  current: HourlyWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}
