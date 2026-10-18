export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { field: string; message: string }[] | null
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) }
  });

  let payload: { data?: T; error?: { code: string; message: string; details: unknown } } = {};
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError(res.status, "BAD_RESPONSE", "The server sent an unexpected response.", null);
  }

  if (!res.ok || payload.error) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    const err = payload.error ?? { code: "UNKNOWN", message: "Request failed.", details: null };
    throw new ApiClientError(res.status, err.code, err.message, Array.isArray(err.details) ? err.details : null);
  }
  return payload.data as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
