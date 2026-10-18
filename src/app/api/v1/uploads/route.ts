import { randomUUID } from "node:crypto";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET, ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "@/lib/domain/constants";

export const POST = route(
  async ({ req, user }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw ApiError.badRequest("Send the file as multipart/form-data in a field named 'file'.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw ApiError.badRequest("Attach a file in the 'file' field.");
    if (file.size > ATTACHMENT_MAX_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Files must be 5 MB or smaller.");
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload a PNG, JPG, WEBP or PDF file.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${user.authorId}/${randomUUID()}-${safeName}`;
    const { error } = await db()
      .storage.from(ATTACHMENT_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error("[uploads] storage error", error.message);
      throw new ApiError(502, "INTERNAL_ERROR", "The file could not be stored. You can still submit the ticket without it.");
    }
    return { path, name: file.name.slice(0, 200), size: file.size, type: file.type };
  },
  { roles: ["author"], status: 201 }
);
