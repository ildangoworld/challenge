import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (process.env.CI ? undefined : "/usr/bin/chromium"),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `PORT=3101 DB_PATH=/tmp/pace-browser-${Date.now()}.sqlite node server.js`,
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
