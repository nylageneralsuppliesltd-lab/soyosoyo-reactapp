import { defineConfig } from "cypress";

export default defineConfig({
  pageLoadTimeout: 120000,
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:5173',
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
  },
});
