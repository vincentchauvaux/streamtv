import { NextResponse } from "next/server";
import {
  createSession,
  getSessionUser,
  hashPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { RegisterSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";

const AUTH_MAX = 5;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = checkRateLimit(
      `auth:register:${ip}`,
      AUTH_MAX,
      AUTH_WINDOW_MS
    );
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

    const parsed = parseBody(RegisterSchema, await request.json());
    if (parsed.error) return parsed.error;

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });

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

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
