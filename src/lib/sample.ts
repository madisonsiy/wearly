// Sample data: a default profile, a starter newcomer wardrobe, and synthetic
// forecasts used for tests and for "preview a winter day" in demos.

import { itemFromPreset, findPreset } from "./garments";
import type { ClothingItem, Forecast, HourlyWeather, Profile, Routine } from "./types";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  city: "Toronto, Ontario, Canada",
  latitude: 43.6532,
  longitude: -79.3832,
  preferences: { coldSensitivity: 0, sweatsEasily: false, dislikesBulk: false, sunSensitive: false },
  wishlist: [],
  plans: [],
  budgetCad: 150,
  onboarded: false,
};

/** A starting point when the user adds a plan in settings. */
export const DEFAULT_ROUTINE: Routine = {
  leaveHour: 8,
  returnHour: 17,
  commuteMode: "transit",
  commuteOutdoorMinutes: 15,
  middayOutdoorMinutes: 10,
  indoorEnvironment: "heated",
};

/** A typical first-fall wardrobe of someone arriving from a warm climate. */
export function sampleWardrobe(): ClothingItem[] {
  const mk = (subtype: string, name: string) => itemFromPreset(findPreset(subtype)!, { name });
  return [
    mk("t-shirt", "White t-shirt"),
    mk("t-shirt", "Black t-shirt"),
    mk("long-sleeve shirt", "Blue button-up shirt"),
    mk("hoodie", "Grey hoodie"),
    mk("sweater", "Knit sweater"),
    mk("denim jacket", "Denim jacket"),
    mk("windbreaker", "Light windbreaker"),
    mk("jeans", "Blue jeans"),
    mk("trousers", "Black trousers"),
    mk("sneakers", "Canvas sneakers"),
    mk("sandals", "Sandals"),
    mk("shorts", "Khaki shorts"),
    mk("cap", "Baseball cap"),
    mk("umbrella", "Umbrella"),
  ];
}

function hour(date: string, h: number, w: Partial<HourlyWeather>): HourlyWeather {
  return {
    time: `${date}T${String(h).padStart(2, "0")}:00`,
    temperature: 0, feelsLike: 0, windSpeed: 10, windGusts: 20,
    precipitationProbability: 0, precipitation: 0, snowfall: 0, humidity: 70, uvIndex: 0, weatherCode: 2,
    ...w,
  };
}

/**
 * Build a synthetic one-day forecast from a temperature curve.
 * `temp(h)` gives air temperature for hour h; wind and precipitation are constants.
 */
export function syntheticForecast(opts: {
  date?: string;
  temp: (h: number) => number;
  wind?: number;
  precipProb?: number;
  precip?: number;
  snow?: boolean;
  uv?: number;
}): Forecast {
  const date = opts.date ?? "2027-01-15";
  const wind = opts.wind ?? 10;
  const hourly: HourlyWeather[] = [];
  for (let h = 0; h < 24; h++) {
    const t = opts.temp(h);
    const feels = t <= 10 && wind >= 5 ? t - Math.min(12, wind / 3) : t >= 24 ? t + 2 + (t - 24) * 0.8 : t;
    hourly.push(hour(date, h, {
      temperature: t,
      feelsLike: Math.round(feels * 10) / 10,
      windSpeed: wind,
      windGusts: wind * 1.6,
      precipitationProbability: opts.precipProb ?? 0,
      precipitation: opts.precip ?? 0,
      snowfall: opts.snow ? 0.5 : 0,
      uvIndex: h >= 10 && h <= 15 ? (opts.uv ?? 1) : 0,
      weatherCode: opts.snow ? 73 : (opts.precip ?? 0) > 0 ? 63 : 2,
    }));
  }
  const temps = hourly.map((x) => x.temperature);
  const feels = hourly.map((x) => x.feelsLike);
  return {
    latitude: 43.65, longitude: -79.38, timezone: "America/Toronto",
    current: hourly[8],
    hourly,
    daily: [{
      date,
      tempMax: Math.max(...temps), tempMin: Math.min(...temps),
      feelsLikeMax: Math.max(...feels), feelsLikeMin: Math.min(...feels),
      precipitationSum: (opts.precip ?? 0) * 24,
      precipitationProbabilityMax: opts.precipProb ?? 0,
      windSpeedMax: wind, uvIndexMax: opts.uv ?? 1, weatherCode: hourly[12].weatherCode,
    }],
  };
}

/** A cold, snowy January weekday in Toronto, for "preview winter" in the demo. */
export const winterPreview = () =>
  syntheticForecast({ temp: (h) => -12 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI), wind: 25, precipProb: 60, snow: true, uv: 2 });

export type PreviewKind = "winter" | "spring" | "summer" | "fall";

/** A hot, humid July afternoon. */
export const summerPreview = () =>
  syntheticForecast({ date: "2027-07-15", temp: (h) => 23 + 7 * Math.sin(((h - 9) / 24) * 2 * Math.PI), wind: 8, uv: 8 });

/** A cool, rainy, windy spring day. */
export const rainyPreview = () =>
  syntheticForecast({ date: "2027-04-15", temp: (h) => 8 + 3 * Math.sin(((h - 9) / 24) * 2 * Math.PI), wind: 22, precipProb: 80, precip: 1.2 });

/** A crisp, breezy October day. */
export const fallPreview = () =>
  syntheticForecast({ date: "2027-10-14", temp: (h) => 9 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI), wind: 18, precipProb: 20, uv: 3 });

export const PREVIEWS: Record<PreviewKind, { label: string; make: () => Forecast }> = {
  winter: { label: "Snowy January", make: winterPreview },
  spring: { label: "Rainy April", make: rainyPreview },
  summer: { label: "Hot July", make: summerPreview },
  fall: { label: "Crisp October", make: fallPreview },
};
