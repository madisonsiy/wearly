import { NextResponse } from "next/server";
import { recognizeGarments, VISION_MODEL } from "@/lib/ai";

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const image = body?.image;
  if (typeof image !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(image)) {
    return NextResponse.json({ error: "Send a PNG, JPEG or WebP image as a data URL." }, { status: 400 });
  }
  if (image.length * 0.75 > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 6 MB)." }, { status: 413 });
  try {
    const items = await recognizeGarments(image, req.signal);
    return NextResponse.json({ items, model: VISION_MODEL });
  } catch (e) {
    return NextResponse.json(
      { error: `Photo recognition is unavailable (${(e as Error).message}). You can still add the item manually.`, items: [] },
      { status: 503 },
    );
  }
}
