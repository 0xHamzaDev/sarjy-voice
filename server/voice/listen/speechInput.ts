import { CALL_IDLE_MS } from "@server/config";
import { type Transcription, transcribe } from "@server/vendors/speechToText";
import type { Marks } from "@server/voice/turnTimings";
import type { ErrorCode, Lang } from "@shared/protocol";
import { cleanTranscript, whisperPrompt } from "./cleanTranscript";
import { soundsFinished } from "./endOfTurn";
import { createSileroClassify } from "./silero";
import { createVad, type VadEvent } from "./vad";

export type Endpoint = { text: string; language: string | null; marks: Marks };

const isArabicOrEnglish = (language: string | null) =>
	language?.toLowerCase() === "arabic" || language?.toLowerCase() === "english";

type SpeechInputHandlers = {
	signal: AbortSignal;
	vocab?: string[];
	language(): Lang;
	onSpeech(): void;
	onPause(): void;
	onEndpoint(endpoint: Endpoint): void;
	onMissedSpeech(signal: AbortSignal): void;
	onError(code: ErrorCode): void;
	busyUntil(): number;
};

export function createSpeechInput({
	signal,
	vocab = [],
	language,
	onSpeech,
	onPause,
	onEndpoint,
	onMissedSpeech,
	onError,
	busyUntil,
}: SpeechInputHandlers) {
	let capture: {
		controller: AbortController;
		vad: ReturnType<typeof createVad>;
	} | null = null;
	let lastSpeechAt = 0;
	let idleTimer: NodeJS.Timeout | undefined;
	let pending = Promise.resolve();
	let frames = Promise.resolve();

	const transcribeUtterance = async (
		pcm: Buffer,
		signal: AbortSignal,
	): Promise<Transcription> => {
		const prompt = whisperPrompt(vocab);
		const result = await transcribe(pcm, { prompt, signal });
		signal.throwIfAborted();
		return isArabicOrEnglish(result.language)
			? result
			: transcribe(pcm, { language: language(), prompt, signal });
	};

	let speculation: { bytes: number; result: Promise<Transcription> } | null =
		null;

	const speculate = (pcm: Buffer, signal: AbortSignal) => {
		const result = transcribeUtterance(pcm, signal);
		speculation = { bytes: pcm.length, result };
		result.then(
			({ text }) => {
				if (!soundsFinished(text)) return;
				frames = frames.then(() => {
					if (!capture || signal.aborted || speculation?.result !== result)
						return;
					handle(capture.vad.commit(), performance.now(), signal);
				});
			},
			() => {},
		);
	};

	const claim = (pcm: Buffer, signal: AbortSignal): Promise<Transcription> => {
		const reusable = speculation?.bytes === pcm.length && speculation.result;
		speculation = null;
		return reusable
			? reusable.catch(() => {
					signal.throwIfAborted();
					return transcribeUtterance(pcm, signal);
				})
			: transcribeUtterance(pcm, signal);
	};

	const recognize = async (
		utterance: Extract<VadEvent, { type: "end" }>,
		sttEnd: number,
		previous: Promise<void>,
		signal: AbortSignal,
	) => {
		const transcription = claim(utterance.pcm, signal);
		const sttRequest = performance.now();
		try {
			const [, result] = await Promise.all([previous, transcription]);
			const text = cleanTranscript(result);
			if (!text || signal.aborted) return;
			onEndpoint({
				text,
				language: result.language,
				marks: {
					speechEnd: utterance.speechEndAt,
					sttEnd,
					sttRequest,
					transcriptFinal: performance.now(),
				},
			});
		} catch (error) {
			await previous;
			if (signal.aborted) return;
			console.error("stt failed", error);
			onMissedSpeech(signal);
		}
	};

	const handle = (events: VadEvent[], now: number, signal: AbortSignal) => {
		for (const event of events) {
			if (signal.aborted) return;
			lastSpeechAt = Date.now();
			if (event.type === "speech") onSpeech();
			else if (event.type === "pause") {
				onPause();
				speculate(event.pcm, signal);
			} else pending = recognize(event, now, pending, signal);
		}
	};

	const stop = () => {
		capture?.controller.abort();
		capture = null;
		clearTimeout(idleTimer);
		speculation = null;
		frames = Promise.resolve();
		pending = Promise.resolve();
	};

	const watchIdle = (delayMs: number) => {
		idleTimer = setTimeout(() => {
			const quietSince = Math.max(lastSpeechAt, busyUntil());
			const remainingMs = quietSince + CALL_IDLE_MS - Date.now();
			if (remainingMs > 0) return watchIdle(remainingMs);
			stop();
			onError("mic_idle");
		}, delayMs);
	};

	signal.addEventListener("abort", stop, { once: true });

	return {
		start() {
			if (capture || signal.aborted) return;
			capture = {
				controller: new AbortController(),
				vad: createVad(createSileroClassify()),
			};
			lastSpeechAt = Date.now();
			watchIdle(CALL_IDLE_MS);
		},
		stop,
		write(pcm: Buffer) {
			if (!capture) return;
			const { controller, vad } = capture;
			const signal = controller.signal;
			const now = performance.now();
			frames = frames.then(async () => {
				if (signal.aborted) return;
				try {
					const events = await vad.push(pcm, now, busyUntil() > Date.now());
					handle(events, now, signal);
				} catch (error) {
					if (signal.aborted) return;
					console.error("vad failed", error);
					stop();
					onError("stt_failed");
				}
			});
		},
	};
}
