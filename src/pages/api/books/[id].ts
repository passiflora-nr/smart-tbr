import type { APIRoute } from "astro";
import { z } from "zod";
import { bookIdSchema, bookSchema, type BookMutationError, type BookMutationSuccess } from "@/lib/book-schema";
import { createClient } from "@/lib/supabase";

function jsonResponse(body: BookMutationSuccess | BookMutationError, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PUT: APIRoute = async (context) => {
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

  const idResult = bookIdSchema.safeParse(context.params.id);
  if (!idResult.success) {
    return jsonResponse({ error: "Book not found" }, 404);
  }
  const id = idResult.data;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const result = bookSchema.safeParse(body);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    return jsonResponse(
      {
        error: "Validation failed",
        fieldErrors: Object.fromEntries(
          Object.entries(fieldErrors).map(([field, messages]) => [field, messages.slice(0, 1)]),
        ),
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
    .neq("id", id)
    .limit(1);

  if (lookupError) {
    console.error("books duplicate lookup failed", lookupError);
    return jsonResponse({ error: "Failed to save book" }, 500);
  }

  const duplicate = existing.length > 0;

  const { data: book, error: updateError } = await supabase
    .from("books")
    .update({ title, author, tropes, description })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error("books update failed", updateError);
    return jsonResponse({ error: "Failed to save book" }, 500);
  }

  if (!book) {
    return jsonResponse({ error: "Book not found" }, 404);
  }

  return jsonResponse({ book, duplicate }, 200);
};
