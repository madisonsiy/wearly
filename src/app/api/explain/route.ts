import { NextResponse } from "next/server";
import { explain, TEXT_MODEL } from "@/lib/ai";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  if (kind !== "outfit" && kind !== "gaps") return NextResponse.json({ error: "kind must be outfit or gaps" }, { status: 400 });
  try {
    return NextResponse.json({ text: await explain(kind, body.facts ?? {}), model: TEXT_MODEL });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
