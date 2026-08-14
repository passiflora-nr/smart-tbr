import type { APIRoute } from "astro";
import { bookIdSchema } from "@/lib/book-schema";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/books?error=delete_failed");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return context.redirect("/auth/signin");
  }

  const idResult = bookIdSchema.safeParse(context.params.id);
  if (!idResult.success) {
    return context.redirect("/books?error=not_found");
  }
  const id = idResult.data;

  const { data, error: deleteError } = await supabase
    .from("books")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select();

  if (deleteError) {
    console.error("books delete failed", deleteError);
    return context.redirect("/books?error=delete_failed");
  }

  if (data.length === 0) {
    return context.redirect("/books?error=not_found");
  }

  return context.redirect("/books?notice=deleted");
};
