import { NextResponse } from "next/server";
import { AI_API_KEY, AI_BASE_URL, TEXT_MODEL, VISION_MODEL } from "@/lib/ai";

export async function GET() {
  try {
    const res = await fetch(`${AI_BASE_URL.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${AI_API_KEY}` },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return NextResponse.json({ online: res.ok, visionModel: VISION_MODEL, textModel: TEXT_MODEL });
  } catch {
    return NextResponse.json({ online: false, visionModel: VISION_MODEL, textModel: TEXT_MODEL });
  }
}
