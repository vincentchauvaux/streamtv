import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { historyService } from "@/lib/services/history.service";
import { WatchHistorySchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const history = await historyService.getHistory(user.id);
  return NextResponse.json({ history });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = parseBody(WatchHistorySchema, await request.json());
  if (parsed.error) return parsed.error;

  const entry = await historyService.recordWatch(user.id, parsed.data);
  return NextResponse.json({ entry });
}
