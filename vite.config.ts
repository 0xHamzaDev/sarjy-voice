import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [tanstackStart(), viteReact()],
	server: {
		proxy: {
			"/voice": { target: "ws://localhost:8787", ws: true },
		},
	},
});

export default config;
