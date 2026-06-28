import { NextResponse } from "next/server";
import { z } from "zod";

export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): { data: z.infer<T>; error: null } | { data: null; error: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join(", ");
    return {
      data: null,
      error: NextResponse.json({ error: message || "Données invalides" }, { status: 400 }),
    };
  }
  return { data: result.data, error: null };
}

export function parseSearchParams<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams
): { data: z.infer<T>; error: null } | { data: null; error: NextResponse } {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return parseBody(schema, obj);
}
