import {
	VAD_BARGE_IN_MS,
	VAD_HANGOVER_MS,
	VAD_SHORT_HANGOVER_MS,
} from "@server/config";
import { createVad, frameDb, type VadEvent } from "@server/voice/listen/vad";
import { expect, test } from "vitest";
import { energyClassify, silence, speech } from "../frames";

const run = async (frames: Buffer[], busy = false) => {
	const vad = createVad(energyClassify);
	const events: (VadEvent & { at: number })[] = [];
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i];
		if (!frame) continue;
		for (const event of await vad.push(frame, i * 20, busy))
			events.push({ ...event, at: i * 20 });
	}
	return events;
};

test("measures loudness in dBFS", () => {
	expect(frameDb(silence(20)[0] ?? Buffer.alloc(0))).toBe(-100);
	expect(frameDb(speech(20)[0] ?? Buffer.alloc(0))).toBeGreaterThan(-20);
});

test("a spoken sentence gives one confirmed utterance that ends after the hangover", async () => {
	const events = await run([
		...silence(500),
		...speech(1500),
		...silence(1500),
	]);
	expect(events.map((event) => event.type)).toEqual(["speech", "pause", "end"]);
	const [, pause, end] = events;
	if (pause?.type !== "pause" || end?.type !== "end") throw new Error("no end");
	expect(pause.pcm.equals(end.pcm)).toBe(true);
	expect(end.at - end.speechEndAt).toBeGreaterThanOrEqual(VAD_HANGOVER_MS);
	expect(end.at - end.speechEndAt).toBeLessThan(VAD_HANGOVER_MS + 60);
	expect(end.pcm.length / 32).toBeGreaterThan(1500);
});

test("a short word waits longer so a pause after it does not cut the sentence", async () => {
	const events = await run([
		...speech(400),
		...silence(VAD_HANGOVER_MS + 100),
		...speech(1200),
		...silence(1500),
	]);
	expect(events.filter((event) => event.type === "end")).toHaveLength(1);
	expect(VAD_SHORT_HANGOVER_MS).toBeGreaterThan(VAD_HANGOVER_MS + 100);
});

test("a 700ms thinking pause inside a long sentence does not cut it off", async () => {
	const events = await run([
		...speech(1200),
		...silence(700),
		...speech(800),
		...silence(1500),
	]);
	expect(events.filter((event) => event.type === "end")).toHaveLength(1);
});

test("a short word is confirmed instead of missed", async () => {
	const events = await run([...speech(150), ...silence(1500)]);
	expect(events.map((event) => event.type)).toEqual(["speech", "pause", "end"]);
});

test("clicks shorter than the confirm window never become utterances", async () => {
	expect(await run([...speech(100), ...silence(2000)])).toEqual([]);
	expect(await run(silence(3000))).toEqual([]);
});

test("during playback, speech must clear the barge-in threshold to confirm", async () => {
	const echo = await run([...speech(300), ...silence(1500)], true);
	expect(echo).toEqual([]);
	expect(VAD_BARGE_IN_MS).toBeGreaterThan(300);

	const real = await run([...speech(500), ...silence(1500)], true);
	expect(real.map((event) => event.type)).toEqual(["speech", "pause", "end"]);
});
