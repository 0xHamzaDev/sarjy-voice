import { createSileroClassify, rechunk } from "@server/voice/listen/silero";
import { expect, test } from "vitest";
import { silence, speech } from "../frames";

test("re-chunks a stream of 320-sample frames into 512-sample windows without dropping or reordering samples", () => {
	let carry: Float32Array = new Float32Array(0);
	const windows: Float32Array[] = [];
	const input: number[] = [];
	for (let f = 0; f < 10; f++) {
		const frame = Float32Array.from({ length: 320 }, (_, i) => f * 320 + i);
		input.push(...frame);
		const chunked = rechunk(carry, frame);
		windows.push(...chunked.windows);
		carry = chunked.carry;
	}
	expect(windows.every((window) => window.length === 512)).toBe(true);
	expect([...windows.flatMap((window) => [...window]), ...carry]).toEqual(
		input,
	);
});

test("Silero gives a low speech probability for pure silence", async () => {
	const classify = createSileroClassify();
	let prob = 0;
	for (const frame of silence(1000)) prob = await classify(frame);
	expect(prob).toBeLessThan(0.1);
});

test("Silero gives a low speech probability for a pure sine tone", async () => {
	const classify = createSileroClassify();
	let prob = 0;
	for (const frame of speech(1000)) prob = await classify(frame);
	expect(prob).toBeLessThan(0.1);
});
