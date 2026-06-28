import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { epgService } from "@/lib/services/epg.service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId") ?? undefined;

  const programs = await epgService.getPrograms(user.id, channelId);
  return NextResponse.json({ programs });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const results = await epgService.refreshAllForUser(user.id);
  return NextResponse.json({ results });
}
