import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { recommendationService } from "@/lib/services/recommendation.service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const channels = await recommendationService.getRecommendations(user);
  return NextResponse.json({ channels });
}
