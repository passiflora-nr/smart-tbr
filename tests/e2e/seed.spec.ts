import { expect, test } from "@playwright/test";

test.describe("Risk #1: book data survives add", () => {
  test("added book persists on Your TBR after reload", async ({ page }) => {
    const title = `[e2e]-Book-${Date.now()}`;

    try {
      await page.goto("/books/new");
      await page.getByRole("textbox", { name: "Title" }).fill(title);
      await page.getByRole("textbox", { name: "Author" }).fill("Seed Author");
      await page.getByRole("textbox", { name: "Tropes" }).fill("enemies-to-lovers");
      await page.getByRole("textbox", { name: "Tropes" }).press("Enter");
      await expect(page.getByRole("button", { name: "Remove enemies-to-lovers" })).toBeVisible();

      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/books" &&
          response.request().method() === "POST" &&
          response.status() === 201,
      );
      await page.getByRole("button", { name: "Add to TBR" }).click();
      await created;

      await page.getByRole("link", { name: "View your TBR" }).click();
      await page.waitForURL(/\/books\/?$/);
      await expect(page.getByRole("link", { name: `Edit ${title}` })).toBeVisible();

      await page.reload();
      await expect(page.getByRole("link", { name: `Edit ${title}` })).toBeVisible();
    } finally {
      await page.goto("/books");
      const deleteLink = page.getByRole("link", { name: `Delete ${title}` });
      if ((await deleteLink.count()) > 0) {
        await deleteLink.click();
        await page.getByRole("button", { name: `Permanently delete ${title}` }).click();
        await expect(page.getByRole("link", { name: `Edit ${title}` })).toHaveCount(0);
      }
    }
  });
});
