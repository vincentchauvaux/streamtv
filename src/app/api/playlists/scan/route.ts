import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { playlistService } from "@/lib/services/playlist.service";
import { PlaylistIdQuerySchema } from "@/lib/schemas";
import { parseSearchParams } from "@/lib/validate";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseSearchParams(
    PlaylistIdQuerySchema,
    new URL(request.url).searchParams
  );
  if (parsed.error) return parsed.error;

  try {
    const result = await playlistService.rescan(parsed.data.id, user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Playlist introuvable" }, { status: 404 });
  }
}
