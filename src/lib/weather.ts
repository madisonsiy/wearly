// Weather data (Open-Meteo, free and keyless) and rule-based day analysis.
// Real forecast data is the source of truth; nothing here asks a model to guess.

import type { DailyWeather, Forecast, HourlyWeather, Plan, Preferences, Profile, Routine } from "./types";

const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "wind_gusts_10m",
  "precipitation_probability",
  "precipitation",
  "snowfall",
  "relative_humidity_2m",
  "uv_index",
  "weather_code",
];

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "uv_index_max",
  "weather_code",
];

export function forecastUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: HOURLY_VARS.join(","),
    daily: DAILY_VARS.join(","),
    current: HOURLY_VARS.filter((v) => !["precipitation_probability", "uv_index", "snowfall"].includes(v)).join(","),
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "kmh",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Convert an Open-Meteo JSON response into our Forecast shape. */
export function parseOpenMeteo(json: any): Forecast {
  const h = json.hourly ?? {};
  const hourly: HourlyWeather[] = (h.time ?? []).map((time: string, i: number) => ({
    time,
    temperature: num(h.temperature_2m?.[i]),
    feelsLike: num(h.apparent_temperature?.[i], num(h.temperature_2m?.[i])),
    windSpeed: num(h.wind_speed_10m?.[i]),
    windGusts: num(h.wind_gusts_10m?.[i]),
    precipitationProbability: num(h.precipitation_probability?.[i]),
    precipitation: num(h.precipitation?.[i]),
    snowfall: num(h.snowfall?.[i]),
    humidity: num(h.relative_humidity_2m?.[i]),
    uvIndex: num(h.uv_index?.[i]),
    weatherCode: num(h.weather_code?.[i]),
  }));
  const d = json.daily ?? {};
  const daily: DailyWeather[] = (d.time ?? []).map((date: string, i: number) => ({
    date,
    tempMax: num(d.temperature_2m_max?.[i]),
    tempMin: num(d.temperature_2m_min?.[i]),
    feelsLikeMax: num(d.apparent_temperature_max?.[i]),
    feelsLikeMin: num(d.apparent_temperature_min?.[i]),
    precipitationSum: num(d.precipitation_sum?.[i]),
    precipitationProbabilityMax: num(d.precipitation_probability_max?.[i]),
    windSpeedMax: num(d.wind_speed_10m_max?.[i]),
    uvIndexMax: num(d.uv_index_max?.[i]),
    weatherCode: num(d.weather_code?.[i]),
  }));
  const c = json.current ?? {};
  const currentHour = hourly.find((x) => x.time.slice(0, 13) === String(c.time ?? "").slice(0, 13));
  const current: HourlyWeather = {
    time: c.time ?? hourly[0]?.time ?? "",
    temperature: num(c.temperature_2m, currentHour?.temperature),
    feelsLike: num(c.apparent_temperature, currentHour?.feelsLike),
    windSpeed: num(c.wind_speed_10m, currentHour?.windSpeed),
    windGusts: num(c.wind_gusts_10m, currentHour?.windGusts),
    precipitationProbability: currentHour?.precipitationProbability ?? 0,
    precipitation: num(c.precipitation, currentHour?.precipitation),
    snowfall: currentHour?.snowfall ?? 0,
    humidity: num(c.relative_humidity_2m, currentHour?.humidity),
    uvIndex: currentHour?.uvIndex ?? 0,
    weatherCode: num(c.weather_code, currentHour?.weatherCode),
  };
  return {
    latitude: num(json.latitude),
    longitude: num(json.longitude),
    timezone: json.timezone ?? "UTC",
    current,
    hourly,
    daily,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Environment Canada wind chill index (°C). Defined for T <= 10 °C and wind >= 4.8 km/h;
 * otherwise returns the air temperature.
 */
export function windChill(tempC: number, windKmh: number): number {
  if (tempC > 10 || windKmh < 4.8) return tempC;
  const v = Math.pow(windKmh, 0.16);
  return Math.round((13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v) * 10) / 10;
}

/** Environment Canada frostbite guidance for a given wind chill. */
export function frostbiteRisk(windChillC: number): { level: "low" | "moderate" | "high" | "very-high" | "extreme"; minutes?: number } {
  if (windChillC > -10) return { level: "low" };
  if (windChillC > -28) return { level: "moderate" };
  if (windChillC > -40) return { level: "high", minutes: 30 };
  if (windChillC > -48) return { level: "very-high", minutes: 10 };
  return { level: "extreme", minutes: 5 };
}

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Heavy rain showers", 82: "Violent rain showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};
export const describeWeatherCode = (code: number): string => WMO[code] ?? "Unknown";
export const isFreezingPrecip = (code: number) => [56, 57, 66, 67].includes(code);
export const isSnowCode = (code: number) => [71, 73, 75, 77, 85, 86].includes(code);
export const isThunderCode = (code: number) => code >= 95;

export function weatherEmoji(code: number): string {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (isThunderCode(code)) return "⛈️";
  if (isSnowCode(code)) return "🌨️";
  if (code >= 51) return "🌧️";
  return "🌤️";
}

/** The plan that applies on a date: a date-specific plan wins over a weekly one. */
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
/** Week number with weeks starting on Sunday (1970-01-01 was a Thursday). */
const weekNumber = (date: string) => Math.floor((dayNumber(date) + 4) / 7);

/** Does a plan apply on this date? */
export function planMatches(plan: Plan, date: string): boolean {
  const s = plan.schedule;
  if (s.kind === "date") return s.date === date;
  if (!s.days.includes(new Date(`${date}T12:00`).getDay())) return false;
  if (s.start && date < s.start) return false;
  if (s.until && date > s.until) return false;
  const every = Math.max(1, s.every ?? 1);
  if (every > 1 && s.start) return (((weekNumber(date) - weekNumber(s.start)) % every) + every) % every === 0;
  return true;
}

/** The plan for a date: a one-day plan wins over a repeating one. */
export function activePlan(profile: Pick<Profile, "plans">, date: string): Plan | undefined {
  const plans = profile.plans ?? [];
  return plans.find((p) => p.schedule.kind === "date" && planMatches(p, date)) ?? plans.find((p) => p.schedule.kind === "weekly" && planMatches(p, date));
}

export interface ExposureSegment {
  label: string;
  hour: number;
  minutes: number;
  weather: HourlyWeather;
  /** Feels-like used for dressing: the colder of model apparent temp and wind chill. */
  effectiveFeelsLike: number;
}

export type AlertSeverity = "info" | "caution" | "warning" | "danger";
export interface WeatherAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Concept key in the education library this alert relates to. */
  learn?: string;
}

export interface DayAnalysis {
  date: string;
  segments: ExposureSegment[];
  totalOutdoorMinutes: number;
  longestExposureMinutes: number;
  /** Coldest exposure-relevant feels-like across today's outdoor segments. */
  coldestFeelsLike: number;
  warmestFeelsLike: number;
  /** Feels-like adjusted for personal cold sensitivity and exposure length. */
  dressingTemp: number;
  maxPrecipProbability: number;
  totalPrecipitation: number;
  snowExpected: boolean;
  freezingPrecip: boolean;
  maxWind: number;
  maxGust: number;
  maxUv: number;
  hottestFeelsLike: number;
  /** Hottest feels-like adjusted for sweating / running warm. */
  heatTemp: number;
  thunder: boolean;
  /** Whether a personal plan was used (otherwise a general day out). */
  personalized: boolean;
  /** Feels-like range across the whole waking day, for layering advice. */
  daySwing: number;
  needsRainProtection: boolean;
  needsWindProtection: boolean;
  needsSunProtection: boolean;
  alerts: WeatherAlert[];
}

function hoursForDate(forecast: Forecast, date: string): HourlyWeather[] {
  return forecast.hourly.filter((h) => h.time.startsWith(date));
}

function atHour(hours: HourlyWeather[], hour: number): HourlyWeather | undefined {
  return hours.find((h) => Number(h.time.slice(11, 13)) === hour) ?? hours[Math.min(Math.max(hour, 0), hours.length - 1)];
}

/**
 * Times the user is outside. With a routine we follow it; without one we assume a
 * general day out and check morning, afternoon and evening.
 */
export function exposureSegments(routine: Routine | undefined, hours: HourlyWeather[]): ExposureSegment[] {
  const segs: { label: string; hour: number; minutes: number }[] = [];
  if (!routine) {
    segs.push({ label: "Morning", hour: 8, minutes: 20 }, { label: "Afternoon", hour: 14, minutes: 20 }, { label: "Evening", hour: 19, minutes: 20 });
  } else {
    if (routine.commuteMode !== "none" && routine.commuteOutdoorMinutes > 0) {
      segs.push({ label: "Heading out", hour: routine.leaveHour, minutes: routine.commuteOutdoorMinutes });
    }
    if (routine.middayOutdoorMinutes > 0) {
      const mid = Math.round((routine.leaveHour + routine.returnHour) / 2);
      segs.push({ label: "Midday", hour: mid, minutes: routine.middayOutdoorMinutes });
    }
    if (routine.commuteMode !== "none" && routine.commuteOutdoorMinutes > 0) {
      segs.push({ label: "Heading home", hour: routine.returnHour, minutes: routine.commuteOutdoorMinutes });
    }
    if (routine.indoorEnvironment === "outdoors-job") {
      for (let hr = routine.leaveHour + 1; hr < routine.returnHour; hr += 3) {
        segs.push({ label: `Working outside (${hr}:00)`, hour: hr, minutes: 120 });
      }
    }
    if (segs.length === 0) segs.push({ label: "Short errand", hour: 12, minutes: 10 });
  }
  return segs
    .map((s) => {
      const w = atHour(hours, s.hour);
      if (!w) return undefined;
      const effectiveFeelsLike = Math.min(w.feelsLike, windChill(w.temperature, w.windSpeed));
      return { ...s, weather: w, effectiveFeelsLike };
    })
    .filter((s): s is ExposureSegment => Boolean(s));
}

/** Rule-based analysis of a day's weather against the user's routine. */
export function analyzeDay(forecast: Forecast, preferences: Preferences, routine?: Routine, date?: string): DayAnalysis {
  const day = date ?? forecast.daily[0]?.date ?? forecast.hourly[0]?.time.slice(0, 10) ?? "";
  const hours = hoursForDate(forecast, day);
  const segments = exposureSegments(routine, hours.length ? hours : forecast.hourly.slice(0, 24));

  const waking = hours.filter((h) => {
    const hr = Number(h.time.slice(11, 13));
    return routine ? hr >= routine.leaveHour && hr <= routine.returnHour : hr >= 7 && hr <= 21;
  });
  const outdoorWindowHours = waking.length ? waking : hours;

  const totalOutdoorMinutes = segments.reduce((a, s) => a + s.minutes, 0);
  const longestExposureMinutes = Math.max(0, ...segments.map((s) => s.minutes));
  const coldestFeelsLike = Math.min(...segments.map((s) => s.effectiveFeelsLike));
  const warmestFeelsLike = Math.max(...segments.map((s) => s.effectiveFeelsLike));

  // Very short exposures are more tolerable; long ones feel colder. Cold sensitivity shifts it too.
  const coldestSeg = segments.reduce((a, s) => (s.effectiveFeelsLike < a.effectiveFeelsLike ? s : a), segments[0]);
  let exposureAdj = 0;
  if (coldestSeg.minutes <= 5) exposureAdj = 3;
  else if (coldestSeg.minutes <= 10) exposureAdj = 1.5;
  else if (coldestSeg.minutes >= 60) exposureAdj = -3;
  else if (coldestSeg.minutes >= 30) exposureAdj = -1.5;
  // Feeling the cold matters most when it's actually cold.
  const sensitivityShift = (coldestFeelsLike < 15 ? 2.5 : 1) * preferences.coldSensitivity;
  const dressingTemp = Math.round((coldestFeelsLike + exposureAdj - sensitivityShift) * 10) / 10;
  // Heat: the hottest time you're outside, nudged up if you sweat easily or run warm.
  const hottestFeelsLike = Math.max(...outdoorWindowHours.map((h) => h.feelsLike), warmestFeelsLike);
  const heatTemp = Math.round((hottestFeelsLike + (preferences.sweatsEasily ? 2 : 0) - 1.5 * Math.min(0, preferences.coldSensitivity)) * 10) / 10;

  const segHours = segments.map((s) => s.weather);
  const maxPrecipProbability = Math.max(0, ...segHours.map((h) => h.precipitationProbability));
  const totalPrecipitation = Math.round(outdoorWindowHours.reduce((a, h) => a + h.precipitation, 0) * 10) / 10;
  const snowExpected = outdoorWindowHours.some((h) => h.snowfall > 0 || isSnowCode(h.weatherCode));
  const freezingPrecip = outdoorWindowHours.some((h) => isFreezingPrecip(h.weatherCode)) ||
    segHours.some((h) => h.temperature <= 0 && h.temperature >= -3 && h.precipitation > 0);
  const maxWind = Math.max(0, ...segHours.map((h) => h.windSpeed));
  const maxGust = Math.max(0, ...segHours.map((h) => h.windGusts));
  const maxUv = Math.max(0, ...outdoorWindowHours.map((h) => h.uvIndex));
  const feels = outdoorWindowHours.map((h) => h.feelsLike);
  const daySwing = feels.length ? Math.round((Math.max(...feels) - Math.min(...feels)) * 10) / 10 : 0;

  const needsRainProtection = maxPrecipProbability >= 40 || segHours.some((h) => h.precipitation >= 0.3);
  const needsWindProtection = maxWind >= 25 || maxGust >= 45;
  const needsSunProtection = (maxUv >= 6 || (maxUv >= 3 && preferences.sunSensitive)) && totalOutdoorMinutes >= 15;
  const thunder = outdoorWindowHours.some((h) => isThunderCode(h.weatherCode));
  const fog = outdoorWindowHours.some((h) => h.weatherCode === 45 || h.weatherCode === 48);

  const alerts: WeatherAlert[] = [];
  if (hottestFeelsLike >= 40) {
    alerts.push({ id: "heat-severe", severity: "danger", learn: "humidex", title: `Extreme heat: feels like ${Math.round(hottestFeelsLike)}°C`, detail: "Limit time outside in the afternoon, drink water often, and wear loose, light-coloured clothes." });
  } else if (hottestFeelsLike >= 33) {
    alerts.push({ id: "heat", severity: "warning", learn: "humidex", title: `Hot and humid: feels like ${Math.round(hottestFeelsLike)}°C`, detail: "Wear loose, breathable clothes and bring water." });
  } else if (hottestFeelsLike >= 28) {
    alerts.push({ id: "warm", severity: "info", learn: "humidex", title: `Warm: feels like ${Math.round(hottestFeelsLike)}°C`, detail: "Light, breathable clothes. Humidity makes it feel hotter than the thermometer says." });
  }
  if (thunder) {
    alerts.push({ id: "thunder", severity: "warning", learn: "storms", title: "Thunderstorms possible", detail: "Have a rain layer handy and head indoors if you hear thunder. Umbrellas aren't safe in lightning." });
  }
  if (fog) alerts.push({ id: "fog", severity: "info", title: "Foggy at times", detail: "Lower visibility. Bright or reflective clothing helps if you're walking or biking." });
  const risk = frostbiteRisk(coldestFeelsLike);
  if (risk.level === "extreme" || risk.level === "very-high") {
    alerts.push({
      id: "frostbite-severe", severity: "danger", learn: "frostbite",
      title: `Dangerous cold: feels like ${Math.round(coldestFeelsLike)}°C`,
      detail: `Exposed skin can freeze in about ${risk.minutes} minutes. Cover all skin (hat, mitts, face), limit time outside, and wait for transit indoors if you can.`,
    });
  } else if (risk.level === "high") {
    alerts.push({
      id: "frostbite", severity: "warning", learn: "frostbite",
      title: `Frostbite risk: feels like ${Math.round(coldestFeelsLike)}°C`,
      detail: "Exposed skin can freeze within about 30 minutes. Cover your head, hands and face.",
    });
  } else if (risk.level === "moderate") {
    alerts.push({
      id: "cold", severity: "caution", learn: "wind-chill",
      title: `Cold enough to cover up: feels like ${Math.round(coldestFeelsLike)}°C`,
      detail: "Wear a hat and gloves, especially if you'll wait outside for more than a few minutes.",
    });
  }
  if (segHours.some((h) => h.feelsLike < h.temperature - 4)) {
    const s = segments.find((x) => x.weather.feelsLike < x.weather.temperature - 4)!;
    alerts.push({
      id: "wind-chill", severity: "info", learn: "wind-chill",
      title: "Wind makes it feel colder",
      detail: `During your ${s.label.toLowerCase()} it's ${Math.round(s.weather.temperature)}°C but feels like ${Math.round(s.weather.feelsLike)}°C. Dress for the feels-like number.`,
    });
  }
  if (freezingPrecip) {
    alerts.push({
      id: "ice", severity: "warning", learn: "black-ice",
      title: "Icy conditions possible",
      detail: "Rain or drizzle near 0°C can freeze on sidewalks. Wear footwear with grip and walk carefully.",
    });
  }
  if (snowExpected) {
    alerts.push({
      id: "snow", severity: "caution", learn: "waterproofing",
      title: "Snow expected",
      detail: "Waterproof, insulated footwear keeps feet dry. Slush soaks through sneakers quickly.",
    });
  } else if (needsRainProtection) {
    alerts.push({
      id: "rain", severity: "caution", learn: "waterproofing",
      title: `Rain likely (${Math.round(maxPrecipProbability)}% chance)`,
      detail: "Bring a waterproof layer or umbrella. Wet cotton loses most of its warmth.",
    });
  }
  if (needsWindProtection) {
    alerts.push({
      id: "wind", severity: maxGust >= 70 ? "warning" : "caution", learn: "wind-chill",
      title: `Windy: up to ${Math.round(maxWind)} km/h, gusts ${Math.round(maxGust)} km/h`,
      detail: "A windproof outer layer matters more than extra sweaters today. Umbrellas may not hold up.",
    });
  }
  if (needsSunProtection) {
    alerts.push({
      id: "uv", severity: maxUv >= 8 ? "warning" : "caution", learn: "uv",
      title: `High UV (index ${Math.round(maxUv)})`,
      detail: "Sunglasses and sunscreen help, even on cool days. Snow reflects UV too.",
    });
  }
  if (daySwing >= 8) {
    alerts.push({
      id: "swing", severity: "info", learn: "layering",
      title: `Big temperature swing today (${Math.round(daySwing)}°)`,
      detail: "Wear layers you can take off and carry. Mornings and evenings will feel very different from midday.",
    });
  }
  if (routine?.indoorEnvironment === "heated" && coldestFeelsLike < 5) {
    alerts.push({
      id: "indoor-heat", severity: "info", learn: "layering",
      title: "Heated indoors, cold outdoors",
      detail: "Put most of your warmth in the layers you take off at the door, so you don't overheat inside.",
    });
  }

  return {
    date: day,
    segments,
    totalOutdoorMinutes,
    longestExposureMinutes,
    coldestFeelsLike,
    warmestFeelsLike,
    dressingTemp,
    maxPrecipProbability,
    totalPrecipitation,
    snowExpected,
    freezingPrecip,
    maxWind,
    maxGust,
    maxUv,
    hottestFeelsLike,
    heatTemp,
    thunder,
    personalized: Boolean(routine),
    daySwing,
    needsRainProtection,
    needsWindProtection,
    needsSunProtection,
    alerts,
  };
}
