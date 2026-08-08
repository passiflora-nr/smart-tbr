import type { APIRoute } from "astro";
import { z } from "zod";
import { bookSchema, type CreateBookError, type CreateBookSuccess } from "@/lib/book-schema";
import { createClient } from "@/lib/supabase";

function jsonResponse(body: CreateBookSuccess | CreateBookError, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const result = bookSchema.safeParse(body);
  if (!result.success) {
    return jsonResponse(
      {
        error: "Validation failed",
        fieldErrors: z.flattenError(result.error).fieldErrors,
      },
      400,
    );
  }

  const { title, author, tropes, description } = result.data;

  const { data: existing, error: lookupError } = await supabase
    .from("books")
    .select("id")
    .eq("user_id", user.id)
    .eq("title", title)
    .eq("author", author)
    .limit(1);

  if (lookupError) {
    return jsonResponse({ error: "Failed to save book" }, 500);
  }

  const duplicate = existing.length > 0;

  const { data: book, error: insertError } = await supabase
    .from("books")
    .insert({
      title,
      author,
      tropes,
      description,
      user_id: user.id,
    })
    .select()
    .single();

  if (insertError) {
    return jsonResponse({ error: "Failed to save book" }, 500);
  }

  return jsonResponse({ book, duplicate }, 201);
};
