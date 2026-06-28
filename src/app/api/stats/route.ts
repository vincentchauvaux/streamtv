import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { statsService } from "@/lib/services/stats.service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const stats = await statsService.getForUser(user.id);
  return NextResponse.json({ stats });
}
