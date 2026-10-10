import { NextResponse } from "next/server";
import { forecastUrl, parseOpenMeteo } from "@/lib/weather";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  try {
    const res = await fetch(forecastUrl(lat, lon), { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
    return NextResponse.json(parseOpenMeteo(await res.json()));
  } catch (e) {
    return NextResponse.json({ error: `Couldn't load the forecast: ${(e as Error).message}` }, { status: 502 });
  }
}
