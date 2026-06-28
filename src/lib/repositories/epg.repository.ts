import { prisma } from "@/lib/prisma";

export const epgRepository = {
  deleteByChannelIds(channelIds: string[]) {
    if (channelIds.length === 0) return;
    return prisma.program.deleteMany({
      where: { channelId: { in: channelIds } },
    });
  },

  createMany(
    data: Array<{
      channelId: string;
      title: string;
      description?: string | null;
      start: Date;
      end: Date;
      category?: string | null;
    }>
  ) {
    if (data.length === 0) return;
    return prisma.program.createMany({ data });
  },

  findUpcoming(userId: string, channelId?: string, hours = 24) {
    const now = new Date();
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return prisma.program.findMany({
      where: {
        ...(channelId ? { channelId } : {}),
        channel: { playlist: { userId } },
        start: { lte: end },
        end: { gte: now },
      },
      include: {
        channel: {
          select: { id: true, name: true, logo: true, group: true },
        },
      },
      orderBy: { start: "asc" },
      take: channelId ? 50 : 100,
    });
  },
};
