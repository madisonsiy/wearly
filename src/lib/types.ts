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
  /** Small data URL thumbnail if added from a photo. */
  photo?: string;
  /** "ai" when created by photo recognition and not yet confirmed. */
  source?: "manual" | "ai" | "ai-confirmed";
}

export type CommuteMode = "walk" | "transit" | "car" | "bike" | "none";

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
  /** How many times per day the user goes between indoors and outdoors. */
  transitionsPerDay: number;
}

export interface Preferences {
  /** -2 runs very hot ... 0 average ... +2 gets cold very easily. */
  coldSensitivity: number;
  dislikesBulk: boolean;
  style: "casual" | "smart" | "sporty" | "any";
}

export interface Profile {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Optional: where the user comes from or what climate they know. */
  homeClimate?: "tropical" | "arid" | "temperate" | "cold" | "unsure";
  coldExperience: "none" | "some" | "lots";
  routine: Routine;
  preferences: Preferences;
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
