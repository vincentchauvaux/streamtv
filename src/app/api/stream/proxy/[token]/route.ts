import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  checkStreamProxyRateLimit,
  invalidateStreamProxyToken,
  proxyStreamFetch,
  resolveStreamProxyToken,
} from "@/lib/stream-proxy";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!checkStreamProxyRateLimit(user.id)) {
    return NextResponse.json({ error: "Limite de requêtes proxy atteinte" }, { status: 429 });
  }

  const { token } = await context.params;
  const targetHref = resolveStreamProxyToken(token, user.id);

  if (!targetHref) {
    logger.warn("Proxy stream: token introuvable ou expiré", { token, userId: user.id });
    return NextResponse.json({ error: "Token proxy invalide ou expiré" }, { status: 404 });
  }

  const contextType = new URL(request.url).searchParams.get("contextType");
  const response = await proxyStreamFetch(user.id, targetHref, { contextType });

  if (response.status === 404) {
    if (contextType === "manifest") {
      invalidateStreamProxyToken(token);
    }
    logger.warn("Proxy stream: token 404 ou segment introuvable", {
      token,
      userId: user.id,
      upstream: targetHref.slice(0, 120),
    });
  } else if (response.status === 403 || response.status === 401) {
    logger.warn("Proxy stream: auth upstream expirée (403/401)", {
      token,
      status: response.status,
      upstream: targetHref.slice(0, 120),
    });
  } else if (response.status >= 400) {
    logger.warn("Proxy stream: erreur fetch par token", {
      token,
      status: response.status,
    });
  }

  return response;
}

export const runtime = "nodejs";
export const maxDuration = 30;
