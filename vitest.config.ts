import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		env: loadEnv("test", process.cwd(), ""),
		testTimeout: 15_000,
		hookTimeout: 15_000,
		include: ["test/**/*.test.ts"],
	},
});
