import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  checkStreamProxyRateLimit,
  proxyStreamFetch,
  shouldUseProxyUrlFallback,
  streamProxyLimits,
  validateStreamUrl,
} from "@/lib/stream-proxy";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!checkStreamProxyRateLimit(user.id)) {
    return NextResponse.json({ error: "Limite de requêtes proxy atteinte" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Paramètre url requis" }, { status: 400 });
  }

  if (!shouldUseProxyUrlFallback(rawUrl)) {
    return NextResponse.json(
      {
        error:
          "URL trop longue pour le mode query string — utilisez POST /api/stream/proxy/register puis GET /api/stream/proxy/:token",
      },
      { status: 414 }
    );
  }

  const validation = validateStreamUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const contextType = searchParams.get("contextType");
  const response = await proxyStreamFetch(user.id, validation.url.href, { contextType });

  if (response.status >= 400 && response.status !== 404) {
    logger.warn("Proxy stream: erreur fetch query url", {
      url: validation.url.href,
      status: response.status,
    });
  }

  return response;
}

export const runtime = "nodejs";
export const maxDuration = 30;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "X-Stream-Proxy-Max-Url": String(streamProxyLimits.maxUrlLength),
      "X-Stream-Proxy-Fallback-Max-Url": String(streamProxyLimits.proxyUrlFallbackMaxLength),
    },
  });
}
