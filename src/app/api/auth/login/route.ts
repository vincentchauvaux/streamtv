import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { LoginSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";

const AUTH_MAX = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = checkRateLimit(`auth:login:${ip}`, AUTH_MAX, AUTH_WINDOW_MS);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const parsed = parseBody(LoginSchema, await request.json());
    if (parsed.error) return parsed.error;

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (
      !user ||
      !(await verifyPassword(parsed.data.password, user.passwordHash))
    ) {
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect" },
        { status: 401 }
      );
    }

    await createSession({ id: user.id, email: user.email, name: user.name });
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
