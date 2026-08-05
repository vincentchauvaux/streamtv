import { NextResponse } from "next/server";
import { scanService } from "@/lib/services/scan.service";
import { epgService } from "@/lib/services/epg.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET non configuré" },
        { status: 503 }
      );
    }
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const scanResults = await scanService.rescanStalePlaylists();

  const playlistsWithEpg = await prisma.playlist.findMany({
    where: { epgUrl: { not: null } },
    select: { id: true, epgUrl: true, userId: true },
  });

  const epgResults: Array<{ playlistId: string; count: number }> = [];
  for (const pl of playlistsWithEpg) {
    if (!pl.epgUrl) continue;
    const count = await epgService.syncPlaylistEpg(pl.id, pl.epgUrl);
    epgResults.push({ playlistId: pl.id, count });
  }

  return NextResponse.json({
    scan: scanResults,
    epg: epgResults,
    timestamp: new Date().toISOString(),
  });
}
