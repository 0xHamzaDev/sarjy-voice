import { soundsFinished } from "@server/voice/listen/endOfTurn";
import { expect, test } from "vitest";

test("a sentence closed by final punctuation sounds finished", () => {
	expect(soundsFinished("What time is Maghrib?")).toBe(true);
	expect(soundsFinished("كم الساعة؟")).toBe(true);
	expect(soundsFinished("تمام.")).toBe(true);
});

test("trailing ellipses, commas and hanging words wait for more speech", () => {
	expect(soundsFinished("I was thinking...")).toBe(false);
	expect(soundsFinished("I was thinking…")).toBe(false);
	expect(soundsFinished("ذكرني بعد المغرب،")).toBe(false);
	expect(soundsFinished("hello there")).toBe(false);
	expect(soundsFinished("Remind me to call my mom and.")).toBe(false);
	expect(soundsFinished("أبغى أروح بس.")).toBe(false);
	expect(soundsFinished("ذكرني إذا.")).toBe(false);
	expect(soundsFinished("?")).toBe(false);
});
