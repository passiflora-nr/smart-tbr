import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const E2E_BASE_URL = "http://127.0.0.1:14567";
export const E2E_TITLE_PREFIX = "[e2e]";

export function visibleBookTitle(page: Page, title: string): Locator {
  return page.getByText(title, { exact: true }).filter({ visible: true });
}

export async function typeFieldsWhenReady(fields: { field: Locator; value: string }[]): Promise<void> {
  await expect(async () => {
    for (const { field, value } of fields) {
      await field.click();
      await field.clear();
      await field.pressSequentially(value);
    }
    for (const { field, value } of fields) {
      await expect(field).toHaveValue(value);
    }
  }).toPass();
}

export async function typeUntilEnabled(field: Locator, value: string, enabledControl: Locator): Promise<void> {
  await expect(async () => {
    await field.click();
    await field.clear();
    await field.pressSequentially(value);
    await expect(field).toHaveValue(value);
    await expect(enabledControl).toBeEnabled();
  }).toPass();
}

function assertE2eTitle(title: string): void {
  if (!title.startsWith(E2E_TITLE_PREFIX)) {
    throw new Error(`E2E book titles must start with "${E2E_TITLE_PREFIX}"`);
  }
}

export function createdBookIdFrom(body: unknown): string {
  if (!isCreatedBookId(body)) {
    throw new Error("Expected POST /api/books to return { book: { id } }");
  }
  return body.book.id;
}

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

export async function createBookViaRequest(
  request: APIRequestContext,
  baseURL: string,
  book: { title: string; author: string; tropes: string[] },
): Promise<{ id: string; title: string }> {
  assertE2eTitle(book.title);
  const origin = new URL(baseURL).origin;
  const response = await request.post("/api/books", {
    data: {
      title: book.title,
      author: book.author,
      tropes: book.tropes,
      description: null,
    },
    headers: { Origin: origin },
  });
  if (response.status() !== 201) {
    throw new Error(`Expected 201 creating book, got status ${response.status()}`);
  }
  const body: unknown = await response.json();
  return { id: createdBookIdFrom(body), title: book.title };
}

export async function deleteBookViaForm(request: APIRequestContext, baseURL: string, bookId: string): Promise<void> {
  const origin = new URL(baseURL).origin;
  const response = await request.post(`/api/books/${bookId}/delete`, {
    form: {},
    headers: { Origin: origin },
    maxRedirects: 0,
  });
  if (response.status() !== 302 && response.status() !== 303) {
    throw new Error(`Cleanup expected a redirect, got status ${response.status()}`);
  }
}
