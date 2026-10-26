import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4173)

// Viewports x color schemes. Add or remove entries to widen/narrow the matrix.
const viewports = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
]
const schemes = ['dark', 'light'] as const

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The PWA service worker would cache across tests and hide CSP behaviour.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: viewports.flatMap((v) =>
    schemes.map((scheme) => ({
      name: `${v.name}-${scheme}`,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: v.width, height: v.height },
        colorScheme: scheme,
        // Optional: point at a pre-installed Chromium when the bundled revision is absent.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    })),
  ),
  // Production build served with the exact vercel.json headers (strict CSP).
  webServer: {
    command: `node scripts/e2e-build.mjs && PORT=${PORT} node scripts/csp-preview.mjs dist-e2e`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
