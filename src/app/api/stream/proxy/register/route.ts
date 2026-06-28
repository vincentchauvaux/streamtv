import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { StreamProxyRegisterSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";
import {
  buildProxyTokenPath,
  checkStreamProxyRateLimit,
  registerStreamProxyToken,
  validateStreamUrl,
} from "@/lib/stream-proxy";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!checkStreamProxyRateLimit(user.id)) {
    return NextResponse.json({ error: "Limite de requêtes proxy atteinte" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = parseBody(StreamProxyRegisterSchema, body);
  if (parsed.error) return parsed.error;

  const validation = validateStreamUrl(parsed.data.url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const token = registerStreamProxyToken(user.id, validation.url.href);
  if (!token) {
    return NextResponse.json({ error: "Impossible d'enregistrer l'URL" }, { status: 400 });
  }

  return NextResponse.json({ token, path: buildProxyTokenPath(token) });
}

export const runtime = "nodejs";
