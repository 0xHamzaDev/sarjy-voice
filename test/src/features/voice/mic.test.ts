import { afterEach, expect, test, vi } from "vitest";
import { levelOf, startMic } from "@/features/voice/mic";

afterEach(() => vi.unstubAllGlobals());

test("silence and empty frames are level 0", () => {
	expect(levelOf(new Int16Array(320))).toBe(0);
	expect(levelOf(new Int16Array(0))).toBe(0);
});

test("full-scale audio is level 1", () => {
	expect(levelOf(new Int16Array(320).fill(0x7fff))).toBeCloseTo(1, 3);
});

test("a -30 dB signal sits halfway and faint hiss stays near the bottom", () => {
	const halfway = Math.round(0x8000 * 10 ** (-30 / 20));
	expect(levelOf(new Int16Array(320).fill(halfway))).toBeCloseTo(0.5, 2);
	const hiss = Math.round(0x8000 * 10 ** (-55 / 20));
	expect(levelOf(new Int16Array(320).fill(hiss))).toBeLessThan(0.1);
});

test.each([
	"context",
	"worklet",
	"connect",
])("releases the microphone when %s initialization fails", async (stage) => {
	const error = new Error(stage);
	const stop = vi.fn();
	const close = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", {
		mediaDevices: {
			getUserMedia: async () => ({ getTracks: () => [{ stop }] }),
		},
	});
	vi.stubGlobal(
		"AudioContext",
		class {
			constructor() {
				if (stage === "context") throw error;
			}
			close = close;
			audioWorklet = {
				addModule: async () => {
					if (stage === "worklet") throw error;
				},
			};
			createMediaStreamSource = () => ({
				connect: () => {
					if (stage === "connect") throw error;
				},
			});
			createAnalyser = () => ({});
		},
	);
	vi.stubGlobal(
		"AudioWorkletNode",
		class {
			port = {};
		},
	);
	await expect(startMic("", vi.fn(), vi.fn())).rejects.toBe(error);
	expect(stop).toHaveBeenCalledOnce();
	expect(close).toHaveBeenCalledTimes(stage === "context" ? 0 : 1);
});
