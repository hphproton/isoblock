import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 120000,
    globalSetup: ["tests/helpers/globalSetup.ts"],
    // Test files run one after another: the frame-time test must not compete with other browsers.
    fileParallelism: false,
  },
});
