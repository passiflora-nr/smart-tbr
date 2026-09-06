import { expect, test } from "@playwright/test";

test("signed-in home shows Pick by mood", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Pick by mood" })).toBeVisible();
});
