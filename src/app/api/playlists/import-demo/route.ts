import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { playlistService } from "@/lib/services/playlist.service";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const result = await playlistService.importDemoPlaylists(user.id);
    return NextResponse.json({
      ...result,
      message:
        result.imported.length > 0
          ? "Import des playlists de démo lancé en arrière-plan"
          : "Aucune nouvelle playlist à importer",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
