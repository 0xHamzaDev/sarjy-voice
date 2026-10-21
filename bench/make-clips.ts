import { mkdir, writeFile } from "node:fs/promises";
import { tts } from "@server/vendors/textToSpeech";
import { MIC_SAMPLE_RATE } from "@shared/protocol";

export const CLIPS = [
	{
		name: "en",
		segments: [{ lang: "en", text: "Hey Anis, what's a good name for a cat?" }],
	},
	{
		name: "ar",
		segments: [{ lang: "ar", text: "هلا أنيس، وش أحسن وقت أروح فيه النادي؟" }],
	},
	{
		name: "mixed",
		segments: [
			{ lang: "ar", text: "ذكرني بكرة" },
			{ lang: "en", text: "remind me about the meeting tomorrow" },
			{ lang: "ar", text: "الساعة عشرة الصبح" },
		],
	},
] as const;

async function* single(text: string) {
	yield text;
}

async function synthesizeSegment(
	text: string,
	lang: "ar" | "en",
): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const event of tts({
		sentences: single(text),
		lang,
		signal: AbortSignal.timeout(20000),
		sampleRate: MIC_SAMPLE_RATE,
	}))
		if (event.type === "audio") chunks.push(event.pcm);
	return Buffer.concat(chunks);
}

await mkdir("bench/clips", { recursive: true });
for (const clip of CLIPS) {
	const parts: Buffer[] = [];
	for (const segment of clip.segments)
		parts.push(await synthesizeSegment(segment.text, segment.lang));
	await writeFile(`bench/clips/${clip.name}.pcm`, Buffer.concat(parts));
	console.log(`wrote bench/clips/${clip.name}.pcm`);
}
