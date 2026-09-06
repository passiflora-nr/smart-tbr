import { defineConfig, devices } from "@playwright/test";

const AUTH_STATE = "playwright/.auth/user.json";
/** Set PLAYWRIGHT_SKIP_WEBKIT=1 on CI to quarantine Linux WebKit noise. Local WebKit still runs. */
const skipWebKitOnCi = Boolean(process.env.CI) && process.env.PLAYWRIGHT_SKIP_WEBKIT === "1";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:14567",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    ...(skipWebKitOnCi
      ? []
      : [
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"], storageState: AUTH_STATE },
            dependencies: ["setup"],
          },
        ]),
  ],
});
