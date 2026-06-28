import { prisma } from "@/lib/prisma";
import { DEMO_PLAYLISTS } from "@/lib/demo-playlists";
import { playlistRepository } from "@/lib/repositories/playlist.repository";
import { scanService } from "@/lib/services/scan.service";
import { jobQueue } from "@/lib/queue";
import { logger } from "@/lib/logger";

export type DemoImportResult = {
  imported: Array<{ id: string; name: string; url: string }>;
  skipped: number;
};

export const playlistService = {
  listForUser(userId: string) {
    return playlistRepository.findByUser(userId);
  },

  async importPlaylist(data: {
    name: string;
    url: string;
    epgUrl?: string;
    userId: string;
  }) {
    const playlist = await playlistRepository.create({
      name: data.name,
      url: data.url,
      epgUrl: data.epgUrl,
      userId: data.userId,
    });

    logger.info("Import playlist lancé", { playlistId: playlist.id });
    jobQueue.enqueue("IMPORT", {
      playlistId: playlist.id,
      type: "IMPORT",
      skipOnlineCheck: true,
    });

    return playlist;
  },

  async rescan(playlistId: string, userId: string) {
    const playlist = await playlistRepository.findByIdForUser(playlistId, userId);
    if (!playlist) throw new Error("Playlist introuvable");

    logger.info("Rescan lancé", { playlistId });
    jobQueue.enqueue("SCAN", { playlistId, type: "RESCAN" });
    return { status: "PENDING" as const };
  },

  async delete(playlistId: string, userId: string) {
    const playlist = await playlistRepository.findByIdForUser(playlistId, userId);
    if (!playlist) throw new Error("Playlist introuvable");
    await playlistRepository.delete(playlistId);
  },

  async importDemoPlaylists(
    userId: string,
    options?: { awaitScan?: boolean }
  ): Promise<DemoImportResult> {
    const imported: DemoImportResult["imported"] = [];
    let skipped = 0;

    for (const demo of DEMO_PLAYLISTS) {
      const existing = await prisma.playlist.findFirst({
        where: { userId, url: demo.url },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const playlist = await playlistRepository.create({
        name: demo.name,
        url: demo.url,
        epgUrl: demo.epgUrl,
        userId,
      });

      logger.info("Import playlist démo lancé", { playlistId: playlist.id, name: demo.name });

      if (options?.awaitScan) {
        await scanService.scanPlaylist(playlist.id, "IMPORT", { skipOnlineCheck: true });
      } else {
        jobQueue.enqueue("IMPORT", {
          playlistId: playlist.id,
          type: "IMPORT",
          skipOnlineCheck: true,
        });
      }

      imported.push({ id: playlist.id, name: playlist.name, url: playlist.url! });
    }

    return { imported, skipped };
  },
};
