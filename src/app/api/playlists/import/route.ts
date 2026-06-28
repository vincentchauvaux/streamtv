import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { playlistService } from "@/lib/services/playlist.service";
import { ImportPlaylistSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseBody(ImportPlaylistSchema, await request.json());
  if (parsed.error) return parsed.error;

  try {
    const playlist = await playlistService.importPlaylist({
      name: parsed.data.name,
      url: parsed.data.url,
      epgUrl: parsed.data.epgUrl,
      userId: user.id,
    });

    return NextResponse.json({
      playlist: {
        ...playlist,
        _count: { channels: 0 },
      },
      message: "Import lancé en arrière-plan",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
