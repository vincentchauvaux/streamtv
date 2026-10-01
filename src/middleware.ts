import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-site navigations / some clients omit Origin (ex. same-origin GET→POST form rare)
    const referer = request.headers.get("referer");
    if (!referer) return true;
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cron : exiger Authorization partout (même avant la route)
  if (pathname.startsWith("/api/cron")) {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  // CSRF léger : Origin/Referer pour mutations API (hors cron Bearer)
  if (
    MUTATING.has(request.method) &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/cron") &&
    !isSameOrigin(request)
  ) {
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
