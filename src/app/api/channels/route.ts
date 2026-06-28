import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { channelService } from "@/lib/services/channel.service";
import { SearchSchema } from "@/lib/schemas";
import { parseSearchParams } from "@/lib/validate";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(SearchSchema, searchParams);
  if (parsed.error) return parsed.error;

  const params = parsed.data;

  const favoriteIds = new Set(
    (
      await prisma.favorite.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      })
    ).map((f) => f.channelId)
  );

  const channels = await channelService.search(
    {
      userId: user.id,
      q: params.q,
      name: params.name,
      group: params.group,
      country: params.country,
      language: params.language,
      resolution: params.resolution,
      category: params.category,
      playlist: params.playlist ?? params.playlistId,
      online:
        params.status === "ONLINE"
          ? true
          : params.status === "OFFLINE"
            ? false
            : params.online,
      favorite: params.favorite,
      limit: params.limit,
    },
    favoriteIds
  );

  return NextResponse.json({ channels });
}
