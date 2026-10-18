import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "AI_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthenticated(message = "Sign in to continue.") {
    return new ApiError(401, "UNAUTHENTICATED", message);
  }
  static forbidden(message = "You do not have access to this resource.") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(resource: string) {
    return new ApiError(404, "NOT_FOUND", `${resource} not found.`);
  }
  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields are missing or invalid.",
          details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
        }
      },
      { status: 422 }
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Try again shortly.", details: null } },
    { status: 500 }
  );
}

export function assertDb<T>(result: { data: T | null; error: { message: string; code?: string } | null }, context: string): T {
  if (result.error) {
    console.error(`[db] ${context}`, result.error);
    throw new ApiError(500, "INTERNAL_ERROR", `Could not ${context}.`);
  }
  return result.data as T;
}
