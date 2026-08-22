import type { APIRoute } from "astro";
import { ACCOUNT_DELETE_CONFIRMATION_FIELD, accountDeleteConfirmationSchema } from "@/lib/account-schema";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";

export const POST: APIRoute = async (context) => {
  const setHomeNotice = (noticeCode: "account_deleted" | "account_delete_unknown") => {
    context.cookies.set("home_flash_notice", noticeCode, {
      path: "/",
      maxAge: 30,
      sameSite: "lax",
      httpOnly: true,
    });
  };

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData().catch(() => new FormData());
  const confirmationResult = accountDeleteConfirmationSchema.safeParse(form.get(ACCOUNT_DELETE_CONFIRMATION_FIELD));
  if (!confirmationResult.success) {
    return context.redirect("/account?error=confirm_mismatch");
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("account delete failed: service-role client unavailable");
    return context.redirect("/account?error=delete_failed");
  }

  const userId = user.id;
  try {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("account delete failed", deleteError);
      return context.redirect("/account?error=delete_failed");
    }
  } catch (error) {
    console.error("account delete threw", error);
    try {
      const { error: lookupError } = await admin.auth.admin.getUserById(userId);
      if (lookupError?.code === "user_not_found") {
        // The delete completed, but its response was lost. Continue through the success path.
      } else if (lookupError) {
        console.error("account delete outcome check failed", lookupError);
        setHomeNotice("account_delete_unknown");
        return context.redirect("/");
      } else {
        return context.redirect("/account?error=delete_failed");
      }
    } catch (lookupError) {
      console.error("account delete outcome check threw", lookupError);
      setHomeNotice("account_delete_unknown");
      return context.redirect("/");
    }
  }

  try {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      console.error("account delete signOut failed", signOutError);
    }
  } catch (error) {
    console.error("account delete signOut threw", error);
  }

  setHomeNotice("account_deleted");
  return context.redirect("/");
};
