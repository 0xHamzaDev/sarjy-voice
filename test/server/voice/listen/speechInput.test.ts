import {
	CALL_IDLE_MS,
	VAD_BARGE_IN_MS,
	VAD_MAX_UTTERANCE_MS,
} from "@server/config";
import {
	createSpeechInput,
	type Endpoint,
} from "@server/voice/listen/speechInput";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { energyClassify, silence, speech } from "../frames";

const mocks = vi.hoisted(() => ({
	calls: [] as { language: string | undefined; bytes: number }[],
	reply: { text: "hello there", language: "English", avgLogprobs: [-0.2] },
	autoLanguage: "english",
	fail: false,
	wait: null as Promise<void> | null,
	classifyWait: null as Promise<void> | null,
	signals: [] as AbortSignal[],
}));

vi.mock("@server/vendors/speechToText", () => ({
	transcribe: async (
		pcm: Buffer,
		{ language, signal }: { language?: string; signal: AbortSignal },
	) => {
		mocks.calls.push({ language, bytes: pcm.length });
		mocks.signals.push(signal);
		if (mocks.fail) throw new Error("whisper down");
		const result = language
			? mocks.reply
			: { ...mocks.reply, language: mocks.autoLanguage };
		await mocks.wait;
		return result;
	},
}));

vi.mock("@server/voice/listen/silero", () => ({
	createSileroClassify: () => async (frame: Buffer) => {
		await mocks.classifyWait;
		return energyClassify(frame);
	},
}));

let session = new AbortController();
let errors: string[] = [];
let busyUntil = 0;
let missed = 0;
let bargeIns = 0;
let pauses = 0;
let endpoints: Endpoint[] = [];

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const create = () =>
	createSpeechInput({
		signal: session.signal,
		language: () => "ar",
		onSpeech: () => bargeIns++,
		onPause: () => pauses++,
		onEndpoint: (endpoint) => endpoints.push(endpoint),
		onMissedSpeech: () => missed++,
		onError: (code) => errors.push(code),
		busyUntil: () => busyUntil,
	});

const say = async (
	stt: ReturnType<typeof create>,
	speechMs: number,
	quietMs = 1200,
) => {
	for (const frame of [...speech(speechMs), ...silence(quietMs)])
		stt.write(frame);
	await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
	vi.useFakeTimers();
	session = new AbortController();
	errors = [];
	busyUntil = 0;
	missed = 0;
	bargeIns = 0;
	pauses = 0;
	endpoints = [];
	mocks.calls = [];
	mocks.autoLanguage = "english";
	mocks.reply = {
		text: "hello there",
		language: "English",
		avgLogprobs: [-0.2],
	};
	mocks.fail = false;
	mocks.wait = null;
	mocks.classifyWait = null;
	mocks.signals = [];
});

afterEach(async () => {
	session.abort();
	await vi.runOnlyPendingTimersAsync();
	vi.useRealTimers();
});

test("one utterance is sent to Whisper once, letting it auto-detect the language", async () => {
	const stt = create();
	stt.start();
	await say(stt, 800);
	expect(bargeIns).toBe(1);
	expect(mocks.calls).toHaveLength(1);
	expect(mocks.calls[0]?.language).toBeUndefined();
	expect(endpoints.map((endpoint) => endpoint.text)).toEqual(["hello there"]);
	const marks = endpoints[0]?.marks;
	expect(marks?.speechEnd).toBeLessThanOrEqual(marks?.sttEnd ?? 0);
	expect(marks?.sttRequest).toBeLessThanOrEqual(marks?.transcriptFinal ?? 0);
});

test("a pause that turns out mid-sentence discards the early transcript", async () => {
	const stt = create();
	stt.start();
	for (const frame of [...speech(1200), ...silence(400), ...speech(800)])
		stt.write(frame);
	await say(stt, 0);
	expect(mocks.calls).toHaveLength(2);
	expect(mocks.calls[1]?.bytes).toBeGreaterThan(mocks.calls[0]?.bytes ?? 0);
	expect(endpoints).toHaveLength(1);
});

test("a pause whose transcript sounds finished ends the turn before the hangover", async () => {
	mocks.reply = { ...mocks.reply, text: "What time is Maghrib?" };
	const stt = create();
	stt.start();
	await say(stt, 800, 400);
	expect(pauses).toBe(1);
	expect(mocks.calls).toHaveLength(1);
	expect(endpoints.map((endpoint) => endpoint.text)).toEqual([
		"What time is Maghrib?",
	]);
	await say(stt, 0, 800);
	expect(endpoints).toHaveLength(1);
});

test("an unfinished-sounding pause still waits for the hangover", async () => {
	const stt = create();
	stt.start();
	await say(stt, 800, 400);
	expect(endpoints).toHaveLength(0);
	await say(stt, 0, 800);
	expect(endpoints).toHaveLength(1);
	expect(mocks.calls).toHaveLength(1);
});

test("a detected language outside ar/en retries once forced to the call language", async () => {
	mocks.autoLanguage = "french";
	const stt = create();
	stt.start();
	await say(stt, 800);
	expect(mocks.calls).toHaveLength(2);
	expect(mocks.calls[0]?.language).toBeUndefined();
	expect(mocks.calls[1]?.language).toBe("ar");
	expect(endpoints).toHaveLength(1);
});

test("silence, clicks and frames outside a call never reach Whisper", async () => {
	const stt = create();
	await say(stt, 800);
	stt.start();
	for (const frame of silence(3000)) stt.write(frame);
	await say(stt, 100);
	expect(mocks.calls).toHaveLength(0);
	expect(bargeIns).toBe(0);
});

test("a hallucinated transcript is dropped before the LLM", async () => {
	mocks.reply = {
		text: "ترجمة نانسي قنقر",
		language: "arabic",
		avgLogprobs: [-0.2],
	};
	const stt = create();
	stt.start();
	await say(stt, 800);
	expect(mocks.calls).toHaveLength(1);
	expect(endpoints).toEqual([]);
	mocks.reply = {
		text: "hello there",
		language: "english",
		avgLogprobs: [-0.2],
	};
});

test("a Whisper failure is reported as missed speech and the call keeps listening", async () => {
	mocks.fail = true;
	const stt = create();
	stt.start();
	await say(stt, 800);
	expect(mocks.calls).toHaveLength(2);
	expect(missed).toBe(1);
	mocks.fail = false;
	await say(stt, 800);
	expect(endpoints).toHaveLength(1);
});

test("a failed speculative request gets one final attempt when the utterance ends", async () => {
	mocks.fail = true;
	const stt = create();
	stt.start();
	await say(stt, 800, 400);
	expect(mocks.calls).toHaveLength(1);
	expect(missed).toBe(0);
	mocks.fail = false;
	await say(stt, 0, 800);
	expect(mocks.calls).toHaveLength(2);
	expect(endpoints.map((endpoint) => endpoint.text)).toEqual(["hello there"]);
	expect(missed).toBe(0);
});

test("a failed final request without speculation is not retried", async () => {
	mocks.fail = true;
	const stt = create();
	stt.start();
	await say(stt, VAD_MAX_UTTERANCE_MS, 0);
	expect(mocks.calls).toHaveLength(1);
	expect(missed).toBe(1);
	expect(endpoints).toEqual([]);
});

test("during playback, only speech past the barge-in threshold interrupts", async () => {
	const stt = create();
	stt.start();
	busyUntil = Date.now() + CALL_IDLE_MS;
	await say(stt, VAD_BARGE_IN_MS - 100);
	expect(bargeIns).toBe(0);
	expect(mocks.calls).toHaveLength(0);
	await say(stt, VAD_BARGE_IN_MS + 100);
	expect(bargeIns).toBe(1);
	expect(mocks.calls).toHaveLength(1);
});

test("muting drops the utterance in progress", async () => {
	const stt = create();
	stt.start();
	for (const frame of speech(600)) stt.write(frame);
	stt.stop();
	stt.start();
	for (const frame of silence(1200)) stt.write(frame);
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.calls).toHaveLength(0);
	expect(bargeIns).toBe(0);
});

test.each([
	"resolve",
	"reject",
] as const)("stopping discards a delayed transcription that later %ss", async (completion) => {
	const delayed = deferred();
	mocks.wait = delayed.promise;
	const stt = create();
	stt.start();
	await say(stt, 800);
	stt.stop();
	expect(mocks.signals[0]?.aborted).toBe(true);
	if (completion === "resolve") delayed.resolve();
	else delayed.reject(new Error("request cancelled"));
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.calls).toHaveLength(1);
	expect(endpoints).toEqual([]);
	expect(missed).toBe(0);
	expect(errors).toEqual([]);
});

test("restarting does not wait for an old transcription or retry its language", async () => {
	const delayed = deferred();
	mocks.wait = delayed.promise;
	mocks.autoLanguage = "french";
	const stt = create();
	stt.start();
	await say(stt, 800);
	stt.stop();
	mocks.wait = null;
	mocks.autoLanguage = "english";
	stt.start();
	await say(stt, 800);
	expect(endpoints).toHaveLength(1);
	expect(mocks.calls).toHaveLength(2);
	delayed.resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(endpoints).toHaveLength(1);
	expect(mocks.calls).toHaveLength(2);
	expect(missed).toBe(0);
});

test.each([
	"resolve",
	"reject",
] as const)("restarting isolates delayed frame classification (%s) and queued frames", async (completion) => {
	const delayed = deferred();
	const stt = create();
	stt.start();
	await say(stt, 100, 0);
	mocks.classifyWait = delayed.promise;
	await say(stt, 800);
	stt.stop();
	mocks.classifyWait = null;
	stt.start();
	await say(stt, 800);
	expect(endpoints).toHaveLength(1);
	expect(bargeIns).toBe(1);
	if (completion === "resolve") delayed.resolve();
	else delayed.reject(new Error("classification failed"));
	await vi.advanceTimersByTimeAsync(0);
	expect(endpoints).toHaveLength(1);
	expect(bargeIns).toBe(1);
	expect(mocks.calls).toHaveLength(1);
	expect(errors).toEqual([]);
});

test("a queued transcription rejection is handled and discarded after stopping", async () => {
	const delayed = deferred();
	mocks.wait = delayed.promise;
	const stt = create();
	stt.start();
	await say(stt, 800);
	mocks.wait = null;
	mocks.fail = true;
	await say(stt, VAD_MAX_UTTERANCE_MS, 0);
	expect(mocks.calls).toHaveLength(2);
	expect(missed).toBe(0);
	stt.stop();
	delayed.resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(endpoints).toEqual([]);
	expect(missed).toBe(0);
});

test("a quiet minute ends the call with mic_idle, speech pushes it back", async () => {
	const stt = create();
	stt.start();
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS / 2);
	await say(stt, 400, 0);
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS / 2 + 1);
	expect(errors).toEqual([]);
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS / 2);
	expect(errors).toEqual(["mic_idle"]);
});

test("a turn in progress or playback holds off the idle end", async () => {
	const stt = create();
	stt.start();
	busyUntil = Date.now() + CALL_IDLE_MS;
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS * 1.5);
	expect(errors).toEqual([]);
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS / 2 + 1);
	expect(errors).toEqual(["mic_idle"]);
});

test("a muted call never times out", async () => {
	const stt = create();
	stt.start();
	stt.stop();
	await vi.advanceTimersByTimeAsync(CALL_IDLE_MS * 3);
	expect(errors).toEqual([]);
});
