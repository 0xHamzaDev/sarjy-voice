import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createAppServer } from "@server/app";
import { SERVER_RESTART_CLOSE_CODE } from "@server/config";
import { db } from "@server/db/client";
import { users } from "@server/db/schema";
import { createUser } from "@server/users/userStore";
import { restartVoiceSessions } from "@server/voice/session/voiceSession";
import { MISSED_SPEECH_TEXT } from "@server/voice/speak/fillerAudio";
import {
	SESSION_ENDED_CLOSE_CODE,
	type ServerMessage,
	TTS_SAMPLE_RATE,
} from "@shared/protocol";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import WebSocket from "ws";
import { energyClassify, silence, speech } from "../frames";

const mocks = vi.hoisted(() => ({
	signals: [] as AbortSignal[],
	chatCalls: 0,
	sttCalls: 0,
	sttPrompts: [] as string[],
	failStt: false,
	failLlm: false,
	transcripts: ["hi there"],
	wordDelayMs: 0,
	slowPhrase: "",
	releasePhrase: Promise.resolve(),
	reply: "Hello there, nice to meet you. How are you doing today my friend?",
	pcmBytes: 480,
	messages: [] as { role: string; content: unknown }[][],
	snapshot: { revision: 0, memories: [] as { id: number; content: string }[] },
	snapshotReads: 0,
	extractMemories: vi.fn(async (_utterance: string) => [] as string[]),
	saveMemory: vi.fn(
		async (
			_id: string,
			content: string,
			_signal: AbortSignal,
			_revision: number,
		): Promise<{ id: number; content: string } | null> => ({ id: 1, content }),
	),
}));

vi.mock("@server/voice/listen/silero", () => ({
	createSileroClassify: () => energyClassify,
}));

vi.mock("@server/vendors/speechToText", () => ({
	transcribe: async (_pcm: Buffer, { prompt }: { prompt: string }) => {
		mocks.sttPrompts.push(prompt);
		const text = mocks.transcripts[mocks.sttCalls % mocks.transcripts.length];
		mocks.sttCalls++;
		if (mocks.failStt) throw new Error("stt down");
		return { text, language: "english", avgLogprobs: [-0.2] };
	},
}));

vi.mock("@server/config", async (importOriginal) => ({
	...(await importOriginal<typeof import("@server/config")>()),
	CALL_IDLE_MS: 300,
}));

vi.mock("@server/vendors/llm", () => ({
	chat: async function* ({
		signal,
		messages,
	}: {
		signal: AbortSignal;
		messages: { role: string; content: unknown }[];
	}) {
		mocks.chatCalls++;
		mocks.messages.push([...messages]);
		mocks.signals.push(signal);
		if (mocks.failLlm) throw new Error("llm down");
		if (messages.at(-1)?.content === "Call me Hamza") {
			yield {
				type: "tool_calls",
				calls: [
					{
						id: "save-name",
						name: "remember_name",
						arguments: '{"name":"Hamza"}',
					},
				],
			};
			return;
		}
		for (const word of mocks.reply.split(" ")) {
			await new Promise((resolve) => setTimeout(resolve, mocks.wordDelayMs));
			signal.throwIfAborted();
			yield { type: "text", text: `${word} ` };
		}
	},
}));

vi.mock("@server/vendors/textToSpeech", () => ({
	tts: async function* ({
		sentences,
		signal,
	}: {
		sentences: AsyncIterable<string>;
		signal: AbortSignal;
	}) {
		mocks.signals.push(signal);
		for await (const sentence of sentences) {
			if (sentence === mocks.slowPhrase) await mocks.releasePhrase;
			signal.throwIfAborted();
			yield { type: "audio", pcm: Buffer.alloc(mocks.pcmBytes) };
			yield {
				type: "words",
				words: [{ text: sentence, startMs: 0, endMs: 100 }],
			};
		}
	},
}));

vi.mock("@server/memory/memoryStore", () => ({
	memoriesForPrompt: async (
		_id: string,
		_query: string,
		_signal: AbortSignal,
		prefetched: Promise<unknown[]>,
	) => prefetched,
	readMemorySnapshot: async () => {
		mocks.snapshotReads++;
		return mocks.snapshot;
	},
	saveMemory: mocks.saveMemory,
}));

vi.mock("@server/memory/extractMemories", () => ({
	extractMemories: mocks.extractMemories,
}));

const server = createAppServer(null);
let url = "";
let userId = "";
const unhandled: unknown[] = [];

beforeAll(async () => {
	process.on("unhandledRejection", (reason) => unhandled.push(reason));
	server.listen(0);
	await once(server, "listening");
	url = `ws://localhost:${(server.address() as AddressInfo).port}/voice`;
	userId = (await createUser("Session")).id;
});

afterAll(async () => {
	server.close();
	await db.delete(users).where(eq(users.id, userId));
	await db.$client.end();
});

const connect = async (id = userId) => {
	const socket = new WebSocket(url, { headers: { cookie: `sid=${id}` } });
	const json: ServerMessage[] = [];
	let audioFrames = 0;
	socket.on("message", (data, isBinary) => {
		if (isBinary) audioFrames++;
		else json.push(JSON.parse(String(data)));
	});
	await once(socket, "open");
	return { socket, json, audio: () => audioFrames };
};

const call = (socket: WebSocket, action: string, lang?: string) =>
	socket.send(JSON.stringify({ type: "call", action, lang }));

const speak = (socket: WebSocket, speechMs = 800) => {
	for (const frame of [...speech(speechMs), ...silence(1200)])
		socket.send(frame);
};

const waitFor = async (check: () => boolean, timeoutMs = 3000) => {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > timeoutMs) throw new Error("timed out waiting");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};

test("a text turn streams audio, sends the reply, and reports timings after playback", async () => {
	mocks.wordDelayMs = 0;
	const { socket, json, audio } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "hello" }));
	await waitFor(() => json.some((m) => m.type === "reply"));
	expect(audio()).toBeGreaterThan(0);
	const turnMessage = json.find((m) => m.type === "turn");
	if (turnMessage?.type !== "turn") throw new Error("no turn message");
	socket.send(
		JSON.stringify({
			type: "played",
			turnId: turnMessage.turnId,
			playbackMs: 12,
			rttMs: 60,
		}),
	);
	await waitFor(() => json.some((m) => m.type === "timings"));
	const timings = json.find((m) => m.type === "timings");
	expect(timings?.type === "timings" && timings.timings.ttfaMs).toBeGreaterThan(
		0,
	);
	socket.close();
});

test("silence or noise only never calls the LLM", async () => {
	const before = mocks.chatCalls;
	const calls = mocks.sttCalls;
	const { socket, json } = await connect();
	call(socket, "unmute");
	for (const frame of silence(2000)) socket.send(frame);
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(mocks.sttCalls).toBe(calls);
	expect(mocks.chatCalls).toBe(before);
	expect(json.some((m) => m.type === "turn")).toBe(false);
	socket.close();
});

test("speaking during a reply stops it and no more audio arrives", async () => {
	mocks.wordDelayMs = 40;
	const { socket, json, audio } = await connect();
	call(socket, "unmute");
	speak(socket);
	await waitFor(() => audio() > 0);
	for (const frame of speech(400)) socket.send(frame);
	await waitFor(() => json.some((m) => m.type === "stop"));
	const framesAtStop = audio();
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(audio()).toBe(framesAtStop);
	expect(mocks.signals.at(-1)?.aborted).toBe(true);
	socket.close();
});

test("a spoken turn reuses the memory read started at the pause", async () => {
	const { socket, json } = await connect();
	call(socket, "unmute");
	const reads = mocks.snapshotReads;
	speak(socket);
	await waitFor(() => json.some((m) => m.type === "reply"));
	expect(mocks.snapshotReads - reads).toBe(1);
	socket.close();
});

test("a second utterance before Sarjy speaks is merged with the first", async () => {
	mocks.wordDelayMs = 100;
	mocks.transcripts = ["remind me tomorrow", "about the meeting"];
	const calls = mocks.sttCalls;
	mocks.sttCalls = 0;
	const { socket, json } = await connect();
	call(socket, "unmute");
	speak(socket);
	await waitFor(() => json.some((m) => m.type === "turn"));
	speak(socket);
	await waitFor(() => json.some((m) => m.type === "reply"), 6000);
	const lastPrompt = mocks.messages.at(-1) ?? [];
	expect(lastPrompt.at(-1)?.content).toBe(
		"remind me tomorrow about the meeting",
	);
	mocks.transcripts = ["hi there"];
	mocks.sttCalls = calls;
	socket.close();
});

test("closing the socket mid-turn cancels vendors without unhandled rejections", async () => {
	mocks.wordDelayMs = 40;
	const { socket, audio } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "tell me a story" }));
	await waitFor(() => audio() > 0);
	socket.close();
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(mocks.signals.at(-1)?.aborted).toBe(true);
	expect(unhandled).toEqual([]);
});

test("ending a call cancels its reply and a later call can greet normally", async () => {
	mocks.wordDelayMs = 40;
	const { socket, json, audio } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "tell me a story" }));
	await waitFor(() => audio() > 0);
	call(socket, "end");
	await waitFor(() => json.some((message) => message.type === "stop"));
	const stoppedAt = audio();
	await sleep(300);
	expect(audio()).toBe(stoppedAt);
	expect(mocks.signals.at(-1)?.aborted).toBe(true);
	expect(json.some((message) => message.type === "reply")).toBe(false);
	mocks.wordDelayMs = 0;
	call(socket, "start", "en");
	await waitFor(() => json.some((message) => message.type === "reply"));
	expect(audio()).toBeGreaterThan(stoppedAt);
	expect(
		mocks.messages
			.at(-1)
			?.some((message) => message.content === "tell me a story"),
	).toBe(false);
	socket.close();
});

test("more than 10 turns in a minute is rate limited", async () => {
	mocks.wordDelayMs = 0;
	const { socket, json } = await connect();
	for (let i = 0; i < 11; i++)
		socket.send(JSON.stringify({ type: "text", text: `turn ${i}` }));
	await waitFor(() =>
		json.some((m) => m.type === "error" && m.code === "rate_limited"),
	);
	socket.close();
});

test("speaking while the reply is still estimated to be playing stops it, even after generation finished", async () => {
	mocks.wordDelayMs = 0;
	mocks.pcmBytes = TTS_SAMPLE_RATE * 2 * 5;
	const { socket, json } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "hello" }));
	await waitFor(() => json.some((m) => m.type === "reply"));
	await new Promise((resolve) => setTimeout(resolve, 300));
	call(socket, "unmute");
	for (const frame of speech(400)) socket.send(frame);
	await waitFor(() => json.some((m) => m.type === "stop"));
	mocks.pcmBytes = 480;
	socket.close();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hasError = (json: ServerMessage[], code: string) =>
	json.filter((m) => m.type === "error" && m.code === code).length;

test("a new socket for the same user ends the older one with the no-reconnect code", async () => {
	const first = await connect();
	const closed = once(first.socket, "close");
	const second = await connect();
	const [code] = await closed;
	expect(code).toBe(SESSION_ENDED_CLOSE_CODE);
	expect(hasError(first.json, "session_expired")).toBe(1);
	expect(second.socket.readyState).toBe(WebSocket.OPEN);
	second.socket.close();
});

test("a replaced session cancels its turn before the old socket finishes closing", async () => {
	mocks.wordDelayMs = 40;
	const first = await connect();
	first.socket.send(JSON.stringify({ type: "text", text: "tell me a story" }));
	await waitFor(() => first.audio() > 0);
	const turnSignal = mocks.signals.at(-1);
	first.socket.pause();
	const second = await connect();
	await waitFor(() => turnSignal?.aborted === true);
	const closed = once(first.socket, "close");
	first.socket.resume();
	await closed;
	second.socket.close();
});

test("a server restart cancels live turns and closes with a reconnect code", async () => {
	mocks.wordDelayMs = 40;
	const live = await connect();
	live.socket.send(JSON.stringify({ type: "text", text: "tell me a story" }));
	await waitFor(() => live.audio() > 0);
	const turnSignal = mocks.signals.at(-1);
	const closed = once(live.socket, "close");
	restartVoiceSessions();
	expect(turnSignal?.aborted).toBe(true);
	const [code] = await closed;
	expect(code).toBe(SERVER_RESTART_CLOSE_CODE);
	expect(hasError(live.json, "session_expired")).toBe(0);
});

test("an STT failure says so and the call keeps listening", async () => {
	mocks.failStt = true;
	const { socket, json } = await connect();
	call(socket, "unmute");
	speak(socket);
	await waitFor(() => hasError(json, "stt_failed") === 1);
	mocks.failStt = false;
	speak(socket);
	await waitFor(() => json.some((m) => m.type === "turn"));
	socket.close();
});

test("a missed-speech apology that resolves while a reply is playing stays silent", async () => {
	mocks.wordDelayMs = 0;
	mocks.slowPhrase = MISSED_SPEECH_TEXT.en;
	let release: () => void = () => {};
	mocks.releasePhrase = new Promise((resolve) => {
		release = resolve;
	});
	const { socket, json, audio } = await connect();
	call(socket, "start", "en");
	await waitFor(() => json.some((m) => m.type === "reply"));
	mocks.failStt = true;
	speak(socket);
	await waitFor(() => hasError(json, "stt_failed") === 1);
	mocks.failStt = false;
	mocks.pcmBytes = TTS_SAMPLE_RATE * 2 * 5;
	socket.send(JSON.stringify({ type: "text", text: "hello" }));
	await waitFor(() => json.filter((m) => m.type === "reply").length === 2);
	const reply = json.filter((m) => m.type === "reply").at(-1);
	socket.send(
		JSON.stringify({
			type: "played",
			turnId: reply?.type === "reply" ? reply.turnId : "",
			playbackMs: 1,
			rttMs: 1,
		}),
	);
	await waitFor(() => json.some((m) => m.type === "timings"));
	const framesAfterReply = audio();
	release();
	await sleep(200);
	expect(audio()).toBe(framesAfterReply);
	mocks.pcmBytes = 480;
	mocks.slowPhrase = "";
	socket.close();
});

test("a quiet call is ended by the server with mic_idle", async () => {
	const { socket, json } = await connect();
	call(socket, "unmute");
	await waitFor(() => hasError(json, "mic_idle") === 1);
	socket.close();
});

test("frames outside a live call are ignored, muting drops speech", async () => {
	const { socket } = await connect();
	const calls = mocks.sttCalls;
	speak(socket);
	await sleep(50);
	call(socket, "unmute");
	call(socket, "mute");
	speak(socket);
	await sleep(50);
	expect(mocks.sttCalls).toBe(calls);
	call(socket, "unmute");
	speak(socket);
	await waitFor(() => mocks.sttCalls === calls + 1);
	call(socket, "end");
	socket.close();
});

test("every call starts with a greeting in the UI language and keeps only replies in history", async () => {
	mocks.wordDelayMs = 0;
	const { socket, json } = await connect();
	call(socket, "start", "en");
	await waitFor(() => json.some((m) => m.type === "reply"));
	expect(json.some((m) => m.type === "transcript")).toBe(false);
	const greetingMessages = mocks.messages.at(-1) ?? [];
	expect(json).toContainEqual({ type: "ready", name: "Session" });
	expect(greetingMessages[0]?.content).toContain(
		'"preferredName":"Session","memories":[]',
	);
	expect(greetingMessages.at(-2)?.content).toBe(
		"Detected speech language for this turn: English.",
	);
	const greeting = json.find((m) => m.type === "turn");
	socket.send(
		JSON.stringify({
			type: "played",
			turnId: greeting?.type === "turn" ? greeting.turnId : "",
			playbackMs: 1,
			rttMs: 1,
		}),
	);
	await waitFor(() => json.some((m) => m.type === "timings"));
	call(socket, "end");
	call(socket, "start", "en");
	await waitFor(() => json.filter((m) => m.type === "reply").length === 2);
	expect(mocks.messages.at(-1)?.[0]?.content).toContain(
		'"preferredName":"Session","memories":[]',
	);
	await sleep(1500);
	socket.send(JSON.stringify({ type: "text", text: "how are you" }));
	await waitFor(() => json.filter((m) => m.type === "reply").length === 3);
	const roles = mocks.messages.at(-1)?.map((m) => m.role);
	expect(roles).toEqual(["system", "assistant", "assistant", "system", "user"]);
	expect(json.filter((m) => m.type === "turn")).toHaveLength(3);
	expect(mocks.messages.at(-1)?.at(-1)?.content).toBe("how are you");
	socket.close();
});

test("a saved name follows subsequent speech, greetings, and reconnects", async () => {
	mocks.wordDelayMs = 0;
	const user = await createUser("Previous Name");
	let socket: WebSocket | undefined;
	try {
		const first = await connect(user.id);
		socket = first.socket;
		socket.send(JSON.stringify({ type: "text", text: "Call me Hamza" }));
		await waitFor(() => first.json.some((message) => message.type === "reply"));
		expect(first.json).toContainEqual({ type: "name", name: "Hamza" });
		expect(mocks.messages.at(-1)?.[0]?.content).toContain(
			'"preferredName":"Hamza"',
		);
		expect(mocks.messages.at(-1)).toContainEqual({
			role: "tool",
			tool_call_id: "save-name",
			content: JSON.stringify({ saved: true, name: "Hamza" }),
		});
		const sttCalls = mocks.sttCalls;
		call(socket, "unmute");
		speak(socket);
		await waitFor(
			() =>
				first.json.filter((message) => message.type === "reply").length === 2,
		);
		expect(mocks.sttCalls).toBeGreaterThan(sttCalls);
		expect(mocks.sttPrompts.at(-1)).toContain("Hamza");
		expect(mocks.sttPrompts.at(-1)).not.toContain("Previous Name");
		expect(mocks.messages.at(-1)?.[0]?.content).toContain(
			'"preferredName":"Hamza"',
		);
		call(socket, "end");
		call(socket, "start", "en");
		await waitFor(
			() =>
				first.json.filter((message) => message.type === "reply").length === 3,
		);
		expect(mocks.messages.at(-1)?.[0]?.content).toContain(
			'"preferredName":"Hamza"',
		);
		const closed = once(socket, "close");
		socket.close();
		await closed;
		const second = await connect(user.id);
		socket = second.socket;
		await waitFor(() =>
			second.json.some((message) => message.type === "ready"),
		);
		expect(second.json).toContainEqual({ type: "ready", name: "Hamza" });
		call(socket, "start", "en");
		await waitFor(() =>
			second.json.some((message) => message.type === "reply"),
		);
		expect(mocks.messages.at(-1)?.[0]?.content).toContain(
			'"preferredName":"Hamza"',
		);
	} finally {
		if (socket && socket.readyState !== WebSocket.CLOSED) {
			const closed = once(socket, "close");
			socket.close();
			await closed;
		}
		await db.delete(users).where(eq(users.id, user.id));
	}
});

test("a rambling reply is cut to the first three sentences", async () => {
	const full = mocks.reply;
	mocks.reply =
		"One is here. Two is here. Three is here. Four should not be spoken. Five neither.";
	const { socket, json } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "tell me a lot" }));
	await waitFor(() => json.some((m) => m.type === "reply"));
	const reply = json.find((m) => m.type === "reply");
	expect(reply?.type === "reply" && reply.text).toBe(
		"One is here. Two is here. Three is here.",
	);
	mocks.reply = full;
	socket.close();
});

test("numeric speech keeps the language of an English call", async () => {
	mocks.wordDelayMs = 0;
	const transcripts = mocks.transcripts;
	mocks.transcripts = ["27"];
	const { socket, json } = await connect();
	try {
		call(socket, "start", "en");
		await waitFor(() => json.some((message) => message.type === "reply"));
		await sleep(150);
		speak(socket);
		await waitFor(
			() => json.filter((message) => message.type === "reply").length === 2,
		);
		const prompt = mocks.messages.at(-1);
		expect(prompt?.at(-1)?.content).toBe("27");
		expect(prompt?.at(-2)?.content).toBe(
			"Detected speech language for this turn: English.",
		);
	} finally {
		mocks.transcripts = transcripts;
		socket.close();
	}
});

test("a tool call written as text is never spoken", async () => {
	const full = mocks.reply;
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.reply =
		'Let me check that. <function=weather>{"city": "Riyadh"}</function> More words.';
	const { socket, json } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "weather?" }));
	await waitFor(() => json.some((m) => m.type === "reply"));
	const reply = json.find((m) => m.type === "reply");
	expect(reply?.type === "reply" && reply.text).toBe("Let me check that.");
	mocks.reply = full;
	spy.mockRestore();
	socket.close();
});

test("an LLM failure apologises out loud and the next turn still works", async () => {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.wordDelayMs = 0;
	mocks.failLlm = true;
	const { socket, json, audio } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "hello" }));
	await waitFor(() => hasError(json, "llm_failed") === 1);
	await waitFor(() => audio() > 0);
	mocks.failLlm = false;
	socket.send(JSON.stringify({ type: "text", text: "hello again" }));
	await waitFor(() => json.some((m) => m.type === "reply"));
	spy.mockRestore();
	socket.close();
});

test("deleting memories refreshes the next prompt and clears stale conversation history", async () => {
	mocks.snapshot = {
		revision: 0,
		memories: [{ id: 1, content: "Likes secret tea" }],
	};
	const { socket, json } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "old conversation" }));
	await waitFor(() =>
		mocks.extractMemories.mock.calls.some(
			([utterance]) => utterance === "old conversation",
		),
	);
	expect(JSON.stringify(mocks.messages.at(-1))).toContain("Likes secret tea");
	mocks.snapshot = { revision: 1, memories: [] };
	socket.send(JSON.stringify({ type: "text", text: "what do you know?" }));
	await waitFor(
		() => json.filter((message) => message.type === "reply").length === 2,
	);
	await waitFor(() =>
		mocks.extractMemories.mock.calls.some(
			([utterance]) => utterance === "what do you know?",
		),
	);
	const prompt = JSON.stringify(mocks.messages.at(-1));
	expect(prompt).not.toContain("Likes secret tea");
	expect(prompt).not.toContain("old conversation");
	socket.close();
	mocks.snapshot = { revision: 0, memories: [] };
});

test("background saves retain the revision captured before extraction and skip invalidated facts", async () => {
	let finishExtraction: (facts: string[]) => void = () => {};
	mocks.extractMemories.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishExtraction = resolve;
			}),
	);
	mocks.saveMemory.mockResolvedValueOnce(null);
	const savesBefore = mocks.saveMemory.mock.calls.length;
	mocks.snapshot = { revision: 3, memories: [] };
	const { socket, json } = await connect();
	socket.send(
		JSON.stringify({ type: "text", text: "remember my tea preference" }),
	);
	await waitFor(() =>
		mocks.extractMemories.mock.calls.some(
			([utterance]) => utterance === "remember my tea preference",
		),
	);
	mocks.snapshot = { revision: 4, memories: [] };
	finishExtraction(["Likes tea"]);
	await waitFor(() => mocks.saveMemory.mock.calls.length > savesBefore);
	expect(mocks.saveMemory.mock.calls.at(-1)?.[3]).toBe(3);
	expect(json.some((message) => message.type === "memory")).toBe(false);
	socket.close();
	mocks.snapshot = { revision: 0, memories: [] };
});

test("failed background memory persistence reports an error without losing the reply", async () => {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.extractMemories.mockResolvedValueOnce(["Likes tea"]);
	mocks.saveMemory.mockRejectedValueOnce(new Error("embedding unavailable"));
	const { socket, json } = await connect();
	socket.send(JSON.stringify({ type: "text", text: "I like tea" }));
	await waitFor(() => hasError(json, "memory_failed") === 1);
	expect(json.some((message) => message.type === "reply")).toBe(true);
	expect(json.some((message) => message.type === "memory")).toBe(false);
	socket.close();
	spy.mockRestore();
});
