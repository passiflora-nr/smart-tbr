import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, createBookViaRequest, deleteBookViaForm, typeUntilEnabled, visibleBookTitle } from "./support";

test.describe("Save changes", () => {
  test("'Save changes' replaces the old title with the new title on Your TBR", async ({ page }) => {
    const runId = `${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;
    const oldTitle = `[e2e] Before save ${runId}`;
    const newTitle = `[e2e] After save ${runId}`;

    // Seed a book, then open its edit page by URL.
    const { id } = await createBookViaRequest(page.request, E2E_BASE_URL, {
      title: oldTitle,
      author: `Edit Author ${runId}`,
      tropes: [`e2e-edit-${runId}`],
    });

    try {
      await page.goto(`/books/${id}/edit`);
      await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
      await expect(page.getByRole("button", { name: `Remove e2e-edit-${runId}` })).toBeVisible();

      // Change the title until 'Save' is enabled, then save.
      await typeUntilEnabled(
        page.getByRole("textbox", { name: "Title" }),
        newTitle,
        page.getByRole("button", { name: "Save changes" }),
      );

      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL((url) => url.pathname === "/books", { timeout: 15_000 });

      // Your TBR should show the new title only.
      await expect(visibleBookTitle(page, newTitle)).toBeVisible();
      await expect(visibleBookTitle(page, oldTitle)).not.toBeVisible();
    } finally {
      // Remove the leftover book so Your TBR stays clean.
      await deleteBookViaForm(page.request, E2E_BASE_URL, id);
    }
  });
});
