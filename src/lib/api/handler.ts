import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "./auth";
import { ApiError, errorResponse } from "./errors";
import type { SessionUser } from "@/lib/domain/types";
import type { UserRole } from "@/lib/domain/constants";

type Params = Record<string, string>;

interface Context<P extends Params> {
  req: NextRequest;
  params: P;
  user: SessionUser;
}

interface Options {
  roles?: UserRole[];
  status?: number;
}

export function route<P extends Params = Params>(
  handler: (ctx: Context<P>) => Promise<unknown>,
  options: Options = {}
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const user = await authenticate(req);
      if (options.roles && !options.roles.includes(user.role)) throw ApiError.forbidden();
      const params = context?.params ? await context.params : ({} as P);
      const result = await handler({ req, params, user });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null }, { status: options.status ?? 200 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON.");
  }
}

export async function readOptionalJson(req: NextRequest): Promise<unknown> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON.");
  }
}
