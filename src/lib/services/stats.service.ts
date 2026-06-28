import { prisma } from "@/lib/prisma";
import { cache, cacheKeys } from "@/lib/cache";

export type DashboardStats = {
  channelCount: number;
  playlistCount: number;
  favoriteCount: number;
  programsToday: number;
  offlineCount: number;
};

export const statsService = {
  async getForUser(userId: string): Promise<DashboardStats> {
    const cacheKey = cacheKeys.stats(userId);
    const cached = cache.get<DashboardStats>(cacheKey);
    if (cached) return cached;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [channelCount, playlistCount, favoriteCount, programsToday, offlineCount] =
      await Promise.all([
        prisma.channel.count({ where: { playlist: { userId } } }),
        prisma.playlist.count({ where: { userId } }),
        prisma.favorite.count({ where: { userId } }),
        prisma.program.count({
          where: {
            channel: { playlist: { userId } },
            start: { lte: todayEnd },
            end: { gte: todayStart },
          },
        }),
        prisma.channel.count({
          where: { playlist: { userId }, status: "OFFLINE" },
        }),
      ]);

    const stats: DashboardStats = {
      channelCount,
      playlistCount,
      favoriteCount,
      programsToday,
      offlineCount,
    };

    cache.set(cacheKey, stats, 60 * 1000);
    return stats;
  },
};

export type AdminHealth = {
  channelCount: number;
  offlineCount: number;
  lastScanAt: string | null;
  lastImportDurationMs: number | null;
  lastEpgDurationMs: number | null;
  recentErrors: Array<{
    id: string;
    playlistName: string;
    errors: string | null;
    createdAt: string;
  }>;
  playlists: Array<{
    id: string;
    name: string;
    scanStatus: string;
    channelCount: number;
    lastScanAt: string | null;
  }>;
};

export const adminService = {
  async getHealth(userId: string): Promise<AdminHealth> {
    const playlists = await prisma.playlist.findMany({
      where: { userId },
      include: {
        scanLogs: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { updatedAt: "desc" },
    });

    const [channelCount, offlineCount] = await Promise.all([
      prisma.channel.count({ where: { playlist: { userId } } }),
      prisma.channel.count({ where: { playlist: { userId }, status: "OFFLINE" } }),
    ]);

    const lastScan = playlists
      .map((p) => p.lastScanAt)
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0];

    const allLogs = playlists.flatMap((p) =>
      p.scanLogs.map((log) => ({ ...log, playlistName: p.name }))
    );
    allLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const lastLog = allLogs[0];
    const errorLogs = allLogs.filter((l) => l.errorCount > 0 || l.errors).slice(0, 5);

    return {
      channelCount,
      offlineCount,
      lastScanAt: lastScan?.toISOString() ?? null,
      lastImportDurationMs: lastLog?.durationMs ?? null,
      lastEpgDurationMs: null,
      recentErrors: errorLogs.map((l) => ({
        id: l.id,
        playlistName: l.playlistName,
        errors: l.errors,
        createdAt: l.createdAt.toISOString(),
      })),
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        scanStatus: p.scanStatus,
        channelCount: p.channelCount,
        lastScanAt: p.lastScanAt?.toISOString() ?? null,
      })),
    };
  },
};
