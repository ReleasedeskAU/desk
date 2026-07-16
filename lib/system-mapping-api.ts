import { NextResponse } from "next/server";
import type { z } from "zod";
import { logger } from "@/lib/logger";
import { zodErrorResponse } from "@/lib/api-errors";
import { systemMappingIdSchema } from "@/lib/validation/system-mapping";

type ParseResult<T> = { data: T; error: null } | { data: null; error: NextResponse };

/** Validates a redesign route identifier before database access. */
export function parseSystemMappingId(id: string): ParseResult<string> {
  const parsed = systemMappingIdSchema.safeParse(id);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: null, error: zodErrorResponse(parsed.error) };
}

/**
 * Parses a JSON request with a strict route schema.
 * Malformed JSON and validation failures return safe 400 responses.
 */
export async function parseSystemMappingBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { data: null, error: zodErrorResponse(parsed.error) };
  }
  return { data: parsed.data, error: null };
}

/**
 * Converts database failures to generic client errors and logs only non-PII metadata.
 */
export function systemMappingErrorResponse(error: unknown, label: string): NextResponse {
  const metadata: { name: string; code?: string } =
    error && typeof error === "object"
      ? {
          name: "name" in error ? String(error.name) : "UnknownError",
          code: "code" in error ? String(error.code) : undefined,
        }
      : { name: "UnknownError" };
  logger.error(label, metadata);

  if (metadata.code === "P2002") {
    return NextResponse.json({ error: "A record with that unique value already exists" }, { status: 409 });
  }
  if (metadata.code === "P2025") {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Unable to process system mapping request" }, { status: 500 });
}
