import { NextResponse } from "next/server";
import {
  createSession,
  getSessionUser,
  hashPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const parsed = parseBody(RegisterSchema, await request.json());
    if (parsed.error) return parsed.error;

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });

    await createSession({ id: user.id, email: user.email, name: user.name });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
