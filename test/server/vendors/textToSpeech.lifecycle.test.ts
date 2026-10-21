import type { EventEmitter } from "node:events";
import {
	ELEVENLABS_MODEL,
	ELEVENLABS_VOICE_ID,
	ELEVENLABS_VOICE_SETTINGS,
} from "@server/config";
import { tts } from "@server/vendors/textToSpeech";
import { createAsyncQueue } from "@server/voice/asyncQueue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type Socket = EventEmitter & {
	url: URL;
	readyState: number;
	sent: Record<string, unknown>[];
	close(): void;
};

const mocks = vi.hoisted(() => ({ sockets: [] as Socket[], autoOpen: true }));

vi.mock("ws", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		default: class extends EventEmitter {
			readyState = 0;
			idleTimer: ReturnType<typeof setTimeout> | undefined;
			sent: Record<string, unknown>[] = [];
			constructor(
				public url: URL,
				options: { handshakeTimeout: number },
			) {
				super();
				mocks.sockets.push(this);
				if (!mocks.autoOpen)
					setTimeout(() => {
						if (this.readyState !== 0) return;
						this.emit("error", new Error("handshake timed out"));
						this.close();
					}, options.handshakeTimeout);
				queueMicrotask(() => {
					if (this.readyState !== 0 || !mocks.autoOpen) return;
					this.readyState = 1;
					this.resetIdle();
					this.emit("open");
				});
			}
			send(raw: string) {
				if (this.readyState !== 1) throw new Error("socket is closed");
				this.sent.push(JSON.parse(raw));
				this.resetIdle();
			}
			resetIdle() {
				clearTimeout(this.idleTimer);
				this.idleTimer = setTimeout(
					() => this.close(),
					Number(this.url.searchParams.get("inactivity_timeout") ?? 20) * 1000,
				);
			}
			close() {
				clearTimeout(this.idleTimer);
				this.readyState = 3;
				this.emit("close");
			}
		},
	};
});

beforeEach(() => {
	mocks.autoOpen = true;
});

afterEach(() => {
	for (const socket of mocks.sockets.splice(0)) socket.close();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const connected = async () => {
	await vi.waitFor(() =>
		expect(mocks.sockets[0]?.sent.length).toBeGreaterThan(0),
	);
	const socket = mocks.sockets[0];
	if (!socket) throw new Error("no socket");
	return socket;
};

test.each([
	true,
	false,
])("silence reaches the deadline with connection open=%s", async (open) => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	mocks.autoOpen = open;
	const sentences = createAsyncQueue<string>();
	sentences.push("hello");
	sentences.end();
	const signal = new AbortController().signal;
	const stream = tts({ sentences, lang: "en", signal });
	const first = expect(stream.next()).rejects.toThrow();
	await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
	if (open) await connected();
	await vi.advanceTimersByTimeAsync(open ? 15_000 : 10_000);
	await first;
	expect(signal.aborted).toBe(false);
	expect(mocks.sockets[0]?.readyState).toBe(3);
	expect(mocks.sockets[0]?.listenerCount("message")).toBe(0);
});

test.each([
	"ar",
	"en",
] as const)("uses the configured Saudi voice and PCM for %s", async (lang) => {
	const sentences = createAsyncQueue<string>();
	sentences.push(lang === "ar" ? "هلا والله!" : "Hello!");
	sentences.end();
	const stream = tts({
		sentences,
		lang,
		sampleRate: 16000,
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	expect(socket.url.pathname).toBe(
		`/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input`,
	);
	expect(Object.fromEntries(socket.url.searchParams)).toEqual({
		model_id: ELEVENLABS_MODEL,
		output_format: "pcm_16000",
		language_code: lang,
		sync_alignment: "true",
		inactivity_timeout: "180",
	});
	expect(socket.sent[0]).toEqual({
		text: " ",
		voice_settings: ELEVENLABS_VOICE_SETTINGS,
	});
	expect(socket.sent[1]).toEqual({
		text: lang === "ar" ? "هلا والله! " : "Hello! ",
		flush: true,
	});
	socket.emit("message", JSON.stringify({ audio: "AQI=", isFinal: true }));
	await expect(first).resolves.toMatchObject({
		value: { type: "audio", pcm: Buffer.from([1, 2]) },
	});
	await expect(stream.next()).resolves.toMatchObject({ done: true });
});

test("waits for late LLM text before starting its synthesis deadline", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const sentences = createAsyncQueue<string>();
	const stream = tts({
		sentences,
		lang: "en",
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	await vi.advanceTimersByTimeAsync(30_000);
	expect(socket.readyState).toBe(1);
	sentences.push("late answer");
	sentences.end();
	await vi.advanceTimersByTimeAsync(0);
	socket.emit("message", JSON.stringify({ audio: "AQI=", isFinal: true }));
	await expect(first).resolves.toMatchObject({ value: { type: "audio" } });
	await expect(stream.next()).resolves.toMatchObject({ done: true });
	expect(vi.getTimerCount()).toBe(0);
});

test.each([
	true,
	false,
])("abort stops late sentences and final flush with queued text=%s", async (queued) => {
	const sentences = createAsyncQueue<string>();
	if (queued) sentences.push("first");
	const controller = new AbortController();
	const stream = tts({ sentences, lang: "en", signal: controller.signal });
	const first = stream.next();
	const socket = await connected();
	controller.abort();
	await expect(first).rejects.toThrow();
	const before = socket.sent.length;
	if (queued) sentences.push("late");
	sentences.end();
	await new Promise(setImmediate);
	expect(socket.sent).toHaveLength(before);
	expect(socket.listenerCount("message")).toBe(0);
});

test("completion stops a feeder still waiting for text", async () => {
	const sentences = createAsyncQueue<string>();
	sentences.push("first");
	const stream = tts({
		sentences,
		lang: "en",
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	socket.emit("message", JSON.stringify({ audio: "AQI=", isFinal: true }));
	await expect(first).resolves.toMatchObject({ value: { type: "audio" } });
	await expect(stream.next()).resolves.toMatchObject({ done: true });
	const before = socket.sent.length;
	sentences.push("late");
	sentences.end();
	await new Promise(setImmediate);
	expect(socket.sent).toHaveLength(before);
});

test("completion without audio raises an error", async () => {
	const sentences = createAsyncQueue<string>();
	sentences.end();
	const stream = tts({
		sentences,
		lang: "ar",
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	socket.emit("message", JSON.stringify({ audio: "", isFinal: true }));
	await expect(first).rejects.toThrow("tts returned no audio");
});

test("sentence source failures reach the caller without detached rejections", async () => {
	async function* broken() {
		yield "hello";
		throw new Error("sentence source failed");
	}
	const stream = tts({
		sentences: broken(),
		lang: "en",
		signal: new AbortController().signal,
	});
	await expect(stream.next()).rejects.toThrow("sentence source failed");
	expect(mocks.sockets[0]?.listenerCount("message")).toBe(0);
});

test("joins split Arabic words across alignment messages and flushes the final word", async () => {
	const sentences = createAsyncQueue<string>();
	sentences.push("هلا والله! حيّاك");
	sentences.end();
	const stream = tts({
		sentences,
		lang: "ar",
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	for (const [text, start] of [
		["هلا والل", 0],
		["ه! حيّاك", 800],
	] as const) {
		const chars = [...text];
		socket.emit(
			"message",
			JSON.stringify({
				audio: "AQI=",
				alignment: {
					chars,
					charStartTimesMs: chars.map((_, i) => start + i * 100),
					charDurationsMs: chars.map(() => 100),
				},
			}),
		);
	}
	socket.emit("message", JSON.stringify({ isFinal: true }));
	expect(await first).toMatchObject({
		value: { type: "words", words: [{ text: "هلا", startMs: 0, endMs: 300 }] },
	});
	const words = [];
	for await (const event of stream)
		if (event.type === "words") words.push(...event.words);
	expect(words).toEqual([
		{ text: "والله!", startMs: 400, endMs: 1000 },
		{ text: "حيّاك", startMs: 1100, endMs: 1600 },
	]);
});

test("odd-length audio chunks are re-aligned to whole 16-bit samples", async () => {
	const sentences = createAsyncQueue<string>();
	sentences.push("hello");
	sentences.end();
	const stream = tts({
		sentences,
		lang: "en",
		signal: new AbortController().signal,
	});
	const first = stream.next();
	const socket = await connected();
	for (const bytes of [[1, 2, 3], [4], [5, 6, 7], [8]])
		socket.emit(
			"message",
			JSON.stringify({ audio: Buffer.from(bytes).toString("base64") }),
		);
	socket.emit("message", JSON.stringify({ isFinal: true }));
	const chunks = [(await first).value];
	for await (const event of stream) chunks.push(event);
	const pcm = chunks.flatMap((event) =>
		event?.type === "audio" ? [event.pcm] : [],
	);
	expect(pcm.every((chunk) => chunk.length % 2 === 0)).toBe(true);
	expect([...Buffer.concat(pcm)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});
