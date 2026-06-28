import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { favoriteService } from "@/lib/services/history.service";
import { FavoriteSchema, FavoriteDeleteQuerySchema } from "@/lib/schemas";
import { parseBody, parseSearchParams } from "@/lib/validate";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const grouped = new URL(request.url).searchParams.get("grouped");

  if (grouped === "true") {
    const groups = await favoriteService.listGrouped(user.id);
    return NextResponse.json({ groups });
  }

  const favorites = await favoriteService.list(user.id);
  return NextResponse.json({ favorites });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseBody(FavoriteSchema, await request.json());
  if (parsed.error) return parsed.error;

  await favoriteService.add(user.id, parsed.data.channelId, parsed.data.category);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseSearchParams(
    FavoriteDeleteQuerySchema,
    new URL(request.url).searchParams
  );
  if (parsed.error) return parsed.error;

  await favoriteService.remove(user.id, parsed.data.channelId);
  return NextResponse.json({ ok: true });
}
