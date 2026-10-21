import { afterEach, expect, test, vi } from "vitest";
import { createCampSounds } from "@/features/sounds/campSounds";

afterEach(() => vi.unstubAllGlobals());

const node = () => {
	const value = {
		gain: { value: 0 },
		frequency: { value: 0 },
		Q: { value: 0 },
		connect: () => value,
		disconnect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
	};
	return value;
};

test("a failure after tab visibility changes reaches the caller", async () => {
	let onVisibility = () => {};
	const doc = {
		hidden: false,
		addEventListener: (_: string, listener: () => void) => {
			onVisibility = listener;
		},
		removeEventListener: vi.fn(),
	};
	const failure = new Error("suspend failed");
	const context = {
		state: "running",
		sampleRate: 1,
		destination: node(),
		createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
		createBufferSource: node,
		createBiquadFilter: node,
		createGain: node,
		createOscillator: node,
		resume: vi.fn().mockResolvedValue(undefined),
		suspend: vi.fn().mockRejectedValue(failure),
		close: vi.fn().mockResolvedValue(undefined),
	};
	vi.stubGlobal("document", doc);
	vi.stubGlobal(
		"AudioContext",
		vi.fn(function AudioContext() {
			return context;
		}),
	);
	const onError = vi.fn();
	const sounds = createCampSounds(onError);
	await sounds.setEnabled(true);
	doc.hidden = true;
	onVisibility();
	await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
	expect(context.close).toHaveBeenCalledOnce();
	await expect(sounds.setEnabled(true)).rejects.toThrow();
});
