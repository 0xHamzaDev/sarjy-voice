import { on, once } from "node:events";
import {
	ELEVENLABS_MODEL,
	ELEVENLABS_URL,
	ELEVENLABS_VOICE_ID,
	ELEVENLABS_VOICE_SETTINGS,
} from "@server/config";
import { env } from "@server/env";
import { endsSentence } from "@server/voice/reply/sentenceChunker";
import { type Lang, TTS_SAMPLE_RATE, type Word } from "@shared/protocol";
import WebSocket from "ws";
import { z } from "zod";

type TtsEvent =
	| { type: "audio"; pcm: Buffer }
	| { type: "words"; words: Word[] };

const TTS_TIMEOUT_MS = 15_000;
const TTS_CONNECT_TIMEOUT_MS = 10_000;
const TTS_INACTIVITY_TIMEOUT_SECONDS = 180;

const alignment = z.object({
	chars: z.array(z.string()),
	charStartTimesMs: z.array(z.number()),
	charDurationsMs: z.array(z.number()),
});

const elevenLabsMessage = z.object({
	audio: z.string().nullish(),
	isFinal: z.boolean().nullish(),
	alignment: alignment.nullish(),
	error: z.string().nullish(),
	message: z.string().nullish(),
});

export function charsToWords(
	{ chars, charStartTimesMs, charDurationsMs }: z.infer<typeof alignment>,
	previous?: Word,
): Word[] {
	let current: Word | null = previous ? { ...previous } : null;
	const words: Word[] = current ? [current] : [];
	chars.forEach((char, i) => {
		const startMs = charStartTimesMs[i] ?? 0;
		const endMs = startMs + (charDurationsMs[i] ?? 0);
		if (/\s/.test(char)) {
			current = null;
			return;
		}
		if (current) {
			current.text += char;
			current.endMs = endMs;
			return;
		}
		current = { text: char, startMs, endMs };
		words.push(current);
	});
	return words;
}

export async function* tts({
	sentences,
	lang,
	signal: parentSignal,
	sampleRate = TTS_SAMPLE_RATE,
}: {
	sentences: AsyncIterable<string>;
	lang: Lang;
	signal: AbortSignal;
	sampleRate?: number;
}): AsyncGenerator<TtsEvent> {
	const deadline = new AbortController();
	const signal = AbortSignal.any([parentSignal, deadline.signal]);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	signal.throwIfAborted();
	const url = new URL(`${ELEVENLABS_URL}/${ELEVENLABS_VOICE_ID}/stream-input`);
	url.searchParams.set("model_id", ELEVENLABS_MODEL);
	url.searchParams.set("output_format", `pcm_${sampleRate}`);
	url.searchParams.set("language_code", lang);
	url.searchParams.set("sync_alignment", "true");
	url.searchParams.set(
		"inactivity_timeout",
		String(TTS_INACTIVITY_TIMEOUT_SECONDS),
	);
	const socket = new WebSocket(url, {
		headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
		handshakeTimeout: TTS_CONNECT_TIMEOUT_MS,
	});
	const closed = new AbortController();
	socket.once("close", () => closed.abort());
	socket.on("error", (error) => closed.abort(error));
	const combined = AbortSignal.any([signal, closed.signal]);
	let finished = false;
	let receivedAudio = false;
	let pendingWord: Word | undefined;
	let oddByte = Buffer.alloc(0);
	const stop = () => socket.close();
	combined.addEventListener("abort", stop, { once: true });
	try {
		await once(socket, "open", { signal: combined });
		combined.throwIfAborted();
		const messages = on(socket, "message", { signal: combined });
		socket.send(
			JSON.stringify({ text: " ", voice_settings: ELEVENLABS_VOICE_SETTINGS }),
		);
		let feedError: unknown;
		void (async () => {
			try {
				for await (const text of sentences) {
					if (finished || combined.aborted) return;
					timeout ??= setTimeout(() => deadline.abort(), TTS_TIMEOUT_MS);
					socket.send(
						JSON.stringify({ text: `${text} `, flush: endsSentence(text) }),
					);
				}
				if (finished || combined.aborted) return;
				timeout ??= setTimeout(() => deadline.abort(), TTS_TIMEOUT_MS);
				socket.send(JSON.stringify({ text: "" }));
			} catch (error) {
				if (finished || combined.aborted) return;
				feedError = error;
				stop();
			}
		})();

		try {
			for await (const [data] of messages) {
				combined.throwIfAborted();
				const message = elevenLabsMessage.parse(JSON.parse(String(data)));
				const failure = message.error ?? message.message;
				if (failure) throw new Error(`elevenlabs: ${failure}`);
				if (message.alignment?.chars.length) {
					const words = charsToWords(message.alignment, pendingWord);
					pendingWord = /\s$/.test(message.alignment.chars.at(-1) ?? "")
						? undefined
						: words.pop();
					if (words.length) yield { type: "words", words };
				}
				if (message.audio) {
					const bytes = Buffer.concat([
						oddByte,
						Buffer.from(message.audio, "base64"),
					]);
					const evenLength = bytes.length - (bytes.length % 2);
					oddByte = bytes.subarray(evenLength);
					if (evenLength > 0) {
						receivedAudio = true;
						yield { type: "audio", pcm: bytes.subarray(0, evenLength) };
					}
				}
				if (message.isFinal) {
					finished = true;
					if (!receivedAudio) throw new Error("tts returned no audio");
					if (pendingWord) yield { type: "words", words: [pendingWord] };
					break;
				}
			}
		} catch (error) {
			if (signal.aborted) throw error;
			if (feedError) throw feedError;
			if (closed.signal.aborted)
				throw new Error("elevenlabs closed unexpectedly", {
					cause: closed.signal.reason,
				});
			throw error;
		}
	} finally {
		clearTimeout(timeout);
		finished = true;
		combined.removeEventListener("abort", stop);
		closed.abort();
		stop();
	}
}
