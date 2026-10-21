import { transcribe } from "@server/vendors/speechToText";
import { tts } from "@server/vendors/textToSpeech";
import {
	cleanTranscript,
	whisperPrompt,
} from "@server/voice/listen/cleanTranscript";
import { MIC_SAMPLE_RATE } from "@shared/protocol";
import { expect, test } from "vitest";

async function* from(items: string[]) {
	yield* items;
}

async function synthesize(text: string, signal: AbortSignal): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const event of tts({
		sentences: from([text]),
		lang: "ar",
		signal,
		sampleRate: MIC_SAMPLE_RATE,
	}))
		if (event.type === "audio") chunks.push(event.pcm);
	return Buffer.concat(chunks);
}

test.skipIf(!process.env.LIVE).each([
	["ar", "وش الجو في الرياض الليلة؟", ["الرياض"]],
	["en", "What time is Maghrib prayer today?", ["Maghrib", "today"]],
	["ar", "I want to study بس ما عندي motivation أبداً", ["study", "motivation"]],
] as const)(
	"Whisper transcribes %s speech: %s",
	async (language, text, expected) => {
		const signal = AbortSignal.timeout(30000);
		const prompt = whisperPrompt([]);
		const result = await transcribe(await synthesize(text, signal), {
			language,
			prompt,
			signal,
		});
		const cleaned = cleanTranscript(result);
		for (const word of expected) expect(cleaned).toContain(word);
	},
);

test.skipIf(!process.env.LIVE)(
	"silence never becomes a transcript",
	async () => {
		const signal = AbortSignal.timeout(30000);
		const prompt = whisperPrompt([]);
		const result = await transcribe(Buffer.alloc(MIC_SAMPLE_RATE * 2 * 2), {
			language: "ar",
			prompt,
			signal,
		});
		expect(cleanTranscript(result)).toBeNull();
	},
);
