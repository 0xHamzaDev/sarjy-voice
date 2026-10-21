import { charsToWords } from "@server/vendors/textToSpeech";
import { pcmToWav } from "@server/vendors/wav";
import { expect, test } from "vitest";

test("wraps PCM16 mono in a valid WAV header", () => {
	const wav = pcmToWav(Buffer.alloc(100), 24000);
	expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
	expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
	expect(wav.readUInt32LE(24)).toBe(24000);
	expect(wav.readUInt32LE(40)).toBe(100);
	expect(wav.length).toBe(144);
});

test("ElevenLabs character timings become word timings", () => {
	expect(
		charsToWords({
			chars: ["ه", "ل", "ا", " ", "ي", "ا", " "],
			charStartTimesMs: [0, 80, 190, 250, 300, 360, 420],
			charDurationsMs: [80, 110, 60, 50, 60, 60, 30],
		}),
	).toEqual([
		{ text: "هلا", startMs: 0, endMs: 250 },
		{ text: "يا", startMs: 300, endMs: 420 },
	]);
});
