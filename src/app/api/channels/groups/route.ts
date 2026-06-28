import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { channelService } from "@/lib/services/channel.service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const groups = await channelService.getGroups(user.id);
  return NextResponse.json({ groups });
}
