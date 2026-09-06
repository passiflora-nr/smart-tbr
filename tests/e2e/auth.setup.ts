import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const AUTH_FILE = "playwright/.auth/user.json";
const USER_D_EMAIL = "user-d@example.test";
const USER_D_PASSWORD = "password123";

setup("sign in as user D", async ({ page }) => {
  mkdirSync("playwright/.auth", { recursive: true });
  await page.goto("/auth/signin");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // Sign in is a React island: filling before hydration is overwritten.
  await expect(async () => {
    await page.getByLabel("Email").fill(USER_D_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(USER_D_PASSWORD);
    await expect(page.getByLabel("Email")).toHaveValue(USER_D_EMAIL);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(USER_D_PASSWORD);
  }).toPass();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Pick by mood" })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
