import type { ScanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const playlistRepository = {
  findByUser(userId: string) {
    return prisma.playlist.findMany({
      where: { userId },
      include: {
        _count: { select: { channels: true } },
        scanLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.playlist.findFirst({ where: { id, userId } });
  },

  create(data: {
    name: string;
    url: string;
    epgUrl?: string | null;
    userId: string;
  }) {
    return prisma.playlist.create({
      data: {
        name: data.name,
        url: data.url,
        epgUrl: data.epgUrl ?? null,
        userId: data.userId,
        scanStatus: "PENDING",
      },
    });
  },

  updateScanStatus(
    id: string,
    status: ScanStatus,
    channelCount?: number
  ) {
    return prisma.playlist.update({
      where: { id },
      data: {
        scanStatus: status,
        lastScanAt: new Date(),
        ...(channelCount !== undefined ? { channelCount } : {}),
      },
    });
  },

  delete(id: string) {
    return prisma.playlist.delete({ where: { id } });
  },

  findStaleForRescan(olderThan: Date) {
    return prisma.playlist.findMany({
      where: {
        url: { not: null },
        OR: [
          { lastScanAt: null },
          { lastScanAt: { lt: olderThan } },
        ],
      },
    });
  },
};
