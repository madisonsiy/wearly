import { NextResponse } from "next/server";

/** City search via Open-Meteo geocoding (free, no key). Canadian results first. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: "8", language: "en", format: "json" })}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Geocoding returned ${res.status}`);
    const json = await res.json();
    type R = { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number };
    const results = ((json.results ?? []) as R[])
      .map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(", "), latitude: r.latitude, longitude: r.longitude, ca: r.country_code === "CA" }))
      .sort((a, b) => Number(b.ca) - Number(a.ca));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, results: [] }, { status: 502 });
  }
}
