import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration suites share one database and assert on global catalog totals,
    // so test files run one after another.
    fileParallelism: false,
  },
});
