import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, deleteBookViaForm, tryCreatedBookId, typeFieldsWhenReady, visibleBookTitle } from "./support";

test.describe("Critical-path island hops", () => {
  test("added book title is on 'Your TBR' and in mood results after 'Find my next read'", async ({ page }) => {
    const runId = `${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;
    const title = `[e2e] Journey ${runId}`;
    const author = `Journey Author ${runId}`;
    const uniqueTrope = `e2e-mood-${runId}`;
    let bookId: string | undefined;

    try {
      // Open Add a book from home.
      await page.goto("/");
      await page.getByRole("link", { name: "Add a book" }).click();
      await page.waitForURL((url) => url.pathname === "/books/new");
      await expect(page.getByRole("button", { name: "Add to TBR" })).toBeVisible();

      // Fill title, author, and trope once the form keeps the values.
      const titleField = page.getByRole("textbox", { name: "Title" });
      const tropesField = page.getByRole("textbox", { name: "Tropes" });

      await typeFieldsWhenReady([
        { field: titleField, value: title },
        { field: page.getByRole("textbox", { name: "Author" }), value: author },
        { field: tropesField, value: uniqueTrope },
      ]);

      // Commit the trope, then add the book.
      await tropesField.press("Enter");
      await expect(page.getByRole("button", { name: `Remove ${uniqueTrope}` })).toBeVisible();
      await expect(titleField).toHaveValue(title);

      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/books" &&
          response.request().method() === "POST" &&
          response.status() === 201,
      );

      await page.getByRole("button", { name: "Add to TBR" }).click();
      const createResponse = await created;
      const body: unknown = await createResponse.json();
      bookId = tryCreatedBookId(body);
      if (!bookId) {
        throw new Error("Expected POST /api/books to return { book: { id } }");
      }

      // The book should appear on 'Your TBR' after this hop (add stay on this page).
      await page.getByRole("link", { name: "View your TBR" }).click();
      await page.waitForURL((url) => url.pathname === "/books", { timeout: 15_000 });
      await expect(visibleBookTitle(page, title)).toBeVisible();

      // Same title should appear in mood results for that trope.
      await page.getByRole("link", { name: "Pick by mood" }).click();
      await page.waitForURL((url) => url.pathname === "/mood");

      await page.getByText("Tropes", { exact: true }).click();
      await expect(page.getByRole("checkbox", { name: uniqueTrope })).toBeVisible();
      await page.getByRole("checkbox", { name: uniqueTrope }).check();
      await page.getByRole("button", { name: "Find my next read" }).click();

      await page.waitForURL((url) => url.pathname === "/mood" && url.searchParams.has("submitted"));
      await expect(visibleBookTitle(page, title)).toBeVisible();
    } finally {
      // Remove the leftover book so 'Your TBR' stays clean.
      if (bookId) {
        await deleteBookViaForm(page.request, E2E_BASE_URL, bookId);
      }
    }
  });
});
