import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { playlistService } from "@/lib/services/playlist.service";
import { PlaylistIdQuerySchema } from "@/lib/schemas";
import { parseSearchParams } from "@/lib/validate";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const playlists = await playlistService.listForUser(user.id);
  return NextResponse.json({ playlists });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseSearchParams(
    PlaylistIdQuerySchema,
    new URL(request.url).searchParams
  );
  if (parsed.error) return parsed.error;

  try {
    await playlistService.delete(parsed.data.id, user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Playlist introuvable" }, { status: 404 });
  }
}
