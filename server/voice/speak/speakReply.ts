import { env } from "@server/env";
import { tts } from "@server/vendors/textToSpeech";
import type { TurnContext } from "@server/voice/reply/runTurn";
import type { Lang } from "@shared/protocol";

export async function speakReply(
	sentences: AsyncIterable<string>,
	lang: Lang,
	turnId: string,
	context: TurnContext,
): Promise<void> {
	const { marks, signal, sendJson, sendAudio } = context;
	const streaming = env.PIPELINE === "streaming";
	const buffered: Buffer[] = [];
	for await (const event of tts({ sentences, lang, signal })) {
		if (event.type === "words") {
			if (!signal.aborted)
				sendJson({ type: "words", turnId, words: event.words });
			continue;
		}
		marks.ttsFirstAudio ??= performance.now();
		if (!streaming) {
			buffered.push(event.pcm);
			continue;
		}
		if (!signal.aborted) {
			sendAudio(event.pcm);
			marks.firstChunkSent ??= performance.now();
		}
	}
	marks.ttsDone = performance.now();
	if (buffered.length > 0 && !signal.aborted) {
		marks.firstChunkSent ??= performance.now();
		sendAudio(Buffer.concat(buffered));
	}
}
