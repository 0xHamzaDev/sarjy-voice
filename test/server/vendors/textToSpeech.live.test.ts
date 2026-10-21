import { mkdir, writeFile } from "node:fs/promises";
import { tts } from "@server/vendors/textToSpeech";
import { pcmToWav } from "@server/vendors/wav";
import { TTS_SAMPLE_RATE, type Word } from "@shared/protocol";
import { expect, test } from "vitest";

async function* from(items: string[]) {
	yield* items;
}

test.skipIf(!process.env.LIVE).each([
	{
		lang: "ar" as const,
		sentences: [
			"هلا والله يا حمزة، كيف حالك اليوم؟",
			"المغرب الساعة ستة وعشر دقايق.",
		],
	},
	{
		lang: "en" as const,
		sentences: [
			"Hello Hamza, how are you today?",
			"The meeting is at six ten.",
		],
	},
])(
	"streams $lang audio with complete word timestamps",
	async ({ lang, sentences }) => {
		const audio: Buffer[] = [];
		const words: Word[] = [];
		const started = performance.now();
		let firstAudioMs = 0;
		for await (const event of tts({
			sentences: from(sentences),
			lang,
			signal: AbortSignal.timeout(15000),
		})) {
			if (event.type === "audio") {
				if (audio.length === 0) firstAudioMs = performance.now() - started;
				audio.push(event.pcm);
			} else words.push(...event.words);
		}
		const pcm = Buffer.concat(audio);
		await mkdir("tmp", { recursive: true });
		await writeFile(`tmp/tts-${lang}.wav`, pcmToWav(pcm, TTS_SAMPLE_RATE));
		console.log(
			`elevenlabs ${lang} first audio: ${Math.round(firstAudioMs)} ms`,
		);
		expect(pcm.length).toBeGreaterThan(0);
		expect(pcm.length % 2).toBe(0);
		expect(words.map((word) => word.text).join(" ")).toBe(sentences.join(" "));
		for (const [i, word] of words.entries()) {
			expect(word.endMs).toBeGreaterThanOrEqual(word.startMs);
			expect(word.startMs).toBeGreaterThanOrEqual(words[i - 1]?.startMs ?? 0);
		}
	},
	20000,
);
