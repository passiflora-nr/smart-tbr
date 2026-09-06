/**
 * /10x-e2e seed exemplar — copy these patterns, not CSS or Edit-link checks.
 * `npm run test:e2e` skips this file (`--grep-invert @seed`). To run it:
 * `npx playwright test tests/e2e/seed.spec.ts --project=chromium`
 */
import { expect, test, type Page } from "@playwright/test";

function isCreatedBookId(body: unknown): body is { book: { id: string } } {
  return (
    typeof body === "object" &&
    body !== null &&
    "book" in body &&
    typeof body.book === "object" &&
    body.book !== null &&
    "id" in body.book &&
    typeof body.book.id === "string"
  );
}

async function deleteBookViaForm(page: Page, bookId: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`/api/books/${bookId}/delete`, {
    form: {},
    headers: { Origin: origin },
    maxRedirects: 0,
  });
  if (response.status() !== 302 && response.status() !== 303) {
    throw new Error(`Seed cleanup expected a redirect, got status ${response.status()}`);
  }
}

test("added book title persists on Your TBR after reload", { tag: "@seed" }, async ({ page }) => {
  const title = `[e2e] Seed ${Date.now()}`;
  let bookId: string | undefined;

  try {
    await page.goto("/books/new");
    await expect(page.getByRole("button", { name: "Add to TBR" })).toBeVisible();
    // Tropes commit only after the React island hydrates — wait for the chip first.
    await expect(async () => {
      await page.getByRole("textbox", { name: "Tropes" }).fill("enemies-to-lovers");
      await page.getByRole("textbox", { name: "Tropes" }).press("Enter");
      await expect(page.getByRole("button", { name: "Remove enemies-to-lovers" })).toBeVisible();
    }).toPass();
    await page.getByRole("textbox", { name: "Title" }).fill(title);
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);
    await page.getByRole("textbox", { name: "Author" }).fill("Seed Author");
    await expect(page.getByRole("textbox", { name: "Author" })).toHaveValue("Seed Author");

    const created = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/books" &&
        response.request().method() === "POST" &&
        response.status() === 201,
    );
    await page.getByRole("button", { name: "Add to TBR" }).click();
    const createResponse = await created;
    const body: unknown = await createResponse.json();
    if (!isCreatedBookId(body)) {
      throw new Error("Expected POST /api/books to return a book id");
    }
    bookId = body.book.id;

    await page.getByRole("link", { name: "View your TBR" }).click();
    await page.waitForURL((url) => url.pathname === "/books");
    await expect(page.getByRole("paragraph").filter({ hasText: title })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("paragraph").filter({ hasText: title })).toBeVisible();
  } finally {
    if (bookId) {
      await deleteBookViaForm(page, bookId);
    }
  }
});
