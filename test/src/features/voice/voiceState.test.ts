import { expect, test } from "vitest";
import { sceneState } from "@/features/scene/sceneState";
import {
	addUserLine,
	applyServerMessage,
	callPhase,
	callState,
	hostState,
	initialVoiceState,
	nextLifecycle,
	setPlaying,
	waterfallOf,
} from "@/features/voice/voiceState";

test("ready opens the connection and stores the name", () => {
	const state = applyServerMessage(initialVoiceState, {
		type: "ready",
		name: "حمزة",
	});
	expect(state.connection).toBe("open");
	expect(state.name).toBe("حمزة");
});

test("a saved name updates the display without resetting call or error state", () => {
	const state = applyServerMessage(initialVoiceState, {
		type: "error",
		code: "tts_failed",
	});
	expect(applyServerMessage(state, { type: "name", name: "أبو علي" })).toEqual({
		...state,
		name: "أبو علي",
	});
});

test("partial transcripts update the live line; final ones become user lines", () => {
	const partial = applyServerMessage(initialVoiceState, {
		type: "transcript",
		text: "وش لو",
		final: false,
	});
	expect(partial.live).toBe("وش لو");
	const final = applyServerMessage(partial, {
		type: "transcript",
		text: "وش لوني المفضل؟",
		final: true,
	});
	expect(final.live).toBe("");
	expect(final.lines.at(-1)).toMatchObject({
		role: "user",
		text: "وش لوني المفضل؟",
	});
});

test("background memory failures preserve an active turn", () => {
	const active = applyServerMessage(initialVoiceState, {
		type: "turn",
		turnId: "t1",
	});
	const failed = applyServerMessage(active, {
		type: "error",
		code: "memory_failed",
	});
	expect(failed.error).toBe("memory_failed");
	expect(failed.thinking).toBe(true);
	expect(failed.turnId).toBe("t1");
});

test("background memory failures preserve the visible reply when speech failed", () => {
	const turn = applyServerMessage(initialVoiceState, {
		type: "turn",
		turnId: "t1",
	});
	const failed = applyServerMessage(turn, {
		type: "error",
		code: "tts_failed",
	});
	const reply = applyServerMessage(failed, {
		type: "reply",
		turnId: "t1",
		text: "Here is your answer",
	});
	const memoryFailed = applyServerMessage(reply, {
		type: "error",
		code: "memory_failed",
	});
	expect(memoryFailed.error).toBe("tts_failed");
	expect(sceneState(memoryFailed, "live", 0, [], null).reply?.text).toBe(
		"Here is your answer",
	);
});

test("replies become Sarjy lines and a new turn clears the error", () => {
	const errored = applyServerMessage(initialVoiceState, {
		type: "error",
		code: "tts_failed",
	});
	expect(errored.error).toBe("tts_failed");
	const turn = applyServerMessage(errored, { type: "turn", turnId: "t1" });
	expect(turn.error).toBeNull();
	const reply = applyServerMessage(turn, {
		type: "reply",
		turnId: "t1",
		text: "أزرق",
	});
	expect(reply.lines.at(-1)).toEqual({ id: "t1", role: "sarjy", text: "أزرق" });
});

test("typed text is added as a user line", () => {
	expect(addUserLine(initialVoiceState, "hello").lines).toEqual([
		{ id: "0", role: "user", text: "hello" },
	]);
});

test("host state moves through thinking, speaking and back", () => {
	const turn = applyServerMessage(initialVoiceState, {
		type: "turn",
		turnId: "t1",
	});
	expect(hostState(turn, "live")).toBe("thinking");
	const speaking = setPlaying(turn, 5);
	expect(speaking.thinking).toBe(false);
	expect(hostState(speaking, "live")).toBe("speaking");
	expect(hostState(setPlaying(speaking, null), "live")).toBe("listening");
	expect(hostState(setPlaying(speaking, null), "off")).toBe("idle");
	const failed = applyServerMessage(turn, {
		type: "error",
		code: "llm_failed",
	});
	expect(hostState(failed, "off")).toBe("error");
});

test("a live call listens, a muted one rests, speaking still wins", () => {
	expect(hostState(initialVoiceState, "live")).toBe("listening");
	expect(hostState(initialVoiceState, "muted")).toBe("idle");
	expect(hostState(setPlaying(initialVoiceState, 5), "muted")).toBe("speaking");
});

test("a greeting turn adds a Sarjy line and no user line", () => {
	const greeted = applyServerMessage(
		applyServerMessage(initialVoiceState, { type: "turn", turnId: "g1" }),
		{ type: "reply", turnId: "g1", text: "هلا حمزة، أنا سرجي" },
	);
	expect(greeted.lines).toEqual([
		{ id: "g1", role: "sarjy", text: "هلا حمزة، أنا سرجي" },
	]);
});

test("words accumulate for the current turn only", () => {
	const turn = applyServerMessage(initialVoiceState, {
		type: "turn",
		turnId: "t1",
	});
	const word = { text: "هلا", startMs: 0, endMs: 200 };
	const first = applyServerMessage(turn, {
		type: "words",
		turnId: "t1",
		words: [word],
	});
	const second = applyServerMessage(first, {
		type: "words",
		turnId: "t1",
		words: [{ ...word, startMs: 300, endMs: 500 }],
	});
	expect(second.words).toHaveLength(2);
	const stale = applyServerMessage(second, {
		type: "words",
		turnId: "old",
		words: [word],
	});
	expect(stale.words).toHaveLength(2);
});

test("timings become waterfall rows without missing stages", () => {
	const data = waterfallOf({
		turnId: "t1",
		stages: {
			endpointing: 300,
			sttFinalize: 100,
			memoryLookup: null,
			llmFirstToken: 400,
			firstSentence: null,
			ttsFirstAudio: 150,
			network: 20,
			playback: 30,
		},
		ttfaMs: 1000,
		llmProvider: "groq",
		pipeline: "streaming",
	});
	expect(data.rows.map(([name]) => name)).toEqual([
		"endpoint",
		"stt",
		"llm",
		"tts",
		"network",
		"playback",
	]);
	expect(data.ttfaMs).toBe(1000);
});

test("call lifecycle moves through connecting, preparing, ready and ended", () => {
	const idle = { status: "off", ended: false } as const;
	const connecting = nextLifecycle(idle, "start");
	const preparing = nextLifecycle(connecting, "connected");
	const ready = nextLifecycle(preparing, "greeted");
	const muted = nextLifecycle(ready, "toggleMute");
	const ended = nextLifecycle(muted, "end");
	expect(
		[idle, connecting, preparing, ready, muted, ended].map(callPhase),
	).toEqual(["idle", "connecting", "preparing", "ready", "ready", "ended"]);
	expect([idle, connecting, muted].map(callState)).toEqual([
		"off",
		"live",
		"muted",
	]);
	expect(nextLifecycle(connecting, "greeted")).toBe(connecting);
	expect(nextLifecycle(ended, "hangUp")).toBe(ended);
	expect(callPhase(nextLifecycle(ready, "hangUp"))).toBe("idle");
});

test("a tool result shows for its turn and clears on the next one", () => {
	const weather = {
		city: "Riyadh",
		cityAr: "الرياض",
		temperature: 39,
		feelsLike: 35,
		condition: "Clear skies",
		conditionAr: "سماء صافية",
		windKmh: 10,
		humidity: 8,
		hours: [{ time: "20:00", temperature: 38 }],
		air: null,
	};
	const shown = applyServerMessage(initialVoiceState, {
		type: "tool",
		result: { kind: "weather", weather },
	});
	expect(shown.toolResult).toEqual({ kind: "weather", weather });
	expect(
		applyServerMessage(shown, { type: "turn", turnId: "t2" }).toolResult,
	).toBeNull();
});
