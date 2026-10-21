import { FILLER_TIMEOUT_MS } from "@server/config";
import { tts } from "@server/vendors/textToSpeech";
import type { Lang } from "@shared/protocol";

export const FILLER_TEXT: Record<Lang, string> = {
	ar: "لحظة…",
	en: "One moment.",
};
export const MISSED_SPEECH_TEXT: Record<Lang, string> = {
	ar: "عذرًا، ما سمعتك زين، ممكن تعيد؟",
	en: "Sorry, I didn't catch that — could you say it again?",
};
export const LLM_FAILED_TEXT: Record<Lang, string> = {
	ar: "عذرًا، صار عندي خلل بسيط، ممكن تعيد سؤالك؟",
	en: "Sorry, I ran into a problem there, could you ask again?",
};
const cache = new Map<string, Promise<Buffer | null> | Buffer>();

async function* single(text: string) {
	yield text;
}

async function synthesize(text: string, lang: Lang): Promise<Buffer | null> {
	try {
		const chunks: Buffer[] = [];
		for await (const event of tts({
			sentences: single(text),
			lang,
			signal: AbortSignal.timeout(FILLER_TIMEOUT_MS),
		}))
			if (event.type === "audio") chunks.push(event.pcm);
		const audio = Buffer.concat(chunks);
		cache.set(text, audio);
		return audio;
	} catch (error) {
		console.error("phrase synthesis failed", error);
		cache.delete(text);
		return null;
	}
}

export function getPhraseAudio(
	text: string,
	lang: Lang,
): Promise<Buffer | null> {
	const cached = cache.get(text) ?? synthesize(text, lang);
	cache.set(text, cached);
	return Promise.resolve(cached);
}

export function getReadyPhraseAudio(text: string): Buffer | null {
	const cached = cache.get(text);
	return Buffer.isBuffer(cached) ? cached : null;
}
