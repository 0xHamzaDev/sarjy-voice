import {
	type ErrorCode,
	type ServerMessage,
	type Stage,
	stageNames,
	type Timings,
	type ToolResult,
	type Word,
} from "@shared/protocol";

type Line = { id: string; role: "user" | "sarjy"; text: string };

export type VoiceState = {
	connection: "connecting" | "open" | "reconnecting";
	name: string | null;
	lines: Line[];
	live: string;
	timings: Timings | null;
	error: ErrorCode | null;
	micDenied: boolean;
	turnId: string | null;
	thinking: boolean;
	playingSince: number | null;
	words: Word[];
	lastMemoryId: number | null;
	toolResult: ToolResult | null;
};

export type WaterfallData = { rows: [string, number][]; ttfaMs: number | null };

const STAGE_LABELS: Record<Stage, string> = {
	endpointing: "endpoint",
	sttFinalize: "stt",
	memoryLookup: "memory",
	llmFirstToken: "llm",
	firstSentence: "sentence",
	ttsFirstAudio: "tts",
	network: "network",
	playback: "playback",
};

export const waterfallOf = (timings: Timings): WaterfallData => ({
	rows: stageNames.flatMap((stage) => {
		const ms = timings.stages[stage];
		return ms === null ? [] : [[STAGE_LABELS[stage], ms]];
	}),
	ttfaMs: timings.ttfaMs,
});

export type HostState =
	| "idle"
	| "listening"
	| "thinking"
	| "speaking"
	| "error";

export type CallState = "off" | "live" | "muted";

export type CallPhase = "idle" | "connecting" | "preparing" | "ready" | "ended";

export type CallLifecycle =
	| { status: "off"; ended: boolean }
	| { status: "connecting" | "preparing" | "ready"; mic: "live" | "muted" };

export const callState = (lifecycle: CallLifecycle): CallState =>
	lifecycle.status === "off" ? "off" : lifecycle.mic;

export const callPhase = (lifecycle: CallLifecycle): CallPhase => {
	if (lifecycle.status !== "off") return lifecycle.status;
	return lifecycle.ended ? "ended" : "idle";
};

export type CallEvent =
	| "start"
	| "connected"
	| "greeted"
	| "toggleMute"
	| "hangUp"
	| "end";

export const nextLifecycle = (
	lifecycle: CallLifecycle,
	event: CallEvent,
): CallLifecycle => {
	if (event === "start") return { status: "connecting", mic: "live" };
	if (lifecycle.status === "off") return lifecycle;
	switch (event) {
		case "connected":
			return lifecycle.status === "connecting"
				? { ...lifecycle, status: "preparing" }
				: lifecycle;
		case "greeted":
			return lifecycle.status === "preparing"
				? { ...lifecycle, status: "ready" }
				: lifecycle;
		case "toggleMute":
			return { ...lifecycle, mic: lifecycle.mic === "live" ? "muted" : "live" };
		case "hangUp":
			return { status: "off", ended: false };
		case "end":
			return { status: "off", ended: true };
	}
};

export const initialVoiceState: VoiceState = {
	connection: "connecting",
	name: null,
	lines: [],
	live: "",
	timings: null,
	error: null,
	micDenied: false,
	turnId: null,
	thinking: false,
	playingSince: null,
	words: [],
	lastMemoryId: null,
	toolResult: null,
};

export const setPlaying = (
	state: VoiceState,
	playingSince: number | null,
): VoiceState => ({
	...state,
	playingSince,
	thinking: playingSince === null && state.thinking,
});

export const hostState = (state: VoiceState, call: CallState): HostState => {
	if (state.playingSince !== null) return "speaking";
	if (state.thinking) return "thinking";
	if (call === "live") return "listening";
	return state.error || state.micDenied ? "error" : "idle";
};

export const addUserLine = (state: VoiceState, text: string): VoiceState => ({
	...state,
	live: "",
	lines: [
		...state.lines,
		{ id: String(state.lines.length), role: "user", text },
	],
});

export function applyServerMessage(
	state: VoiceState,
	message: ServerMessage,
): VoiceState {
	switch (message.type) {
		case "ready":
			return { ...state, connection: "open", name: message.name, error: null };
		case "name":
			return { ...state, name: message.name };
		case "transcript":
			return message.final
				? addUserLine(state, message.text)
				: { ...state, live: message.text };
		case "turn":
			return {
				...state,
				error: null,
				turnId: message.turnId,
				thinking: true,
				words: [],
				toolResult: null,
			};
		case "words":
			return message.turnId === state.turnId
				? { ...state, words: [...state.words, ...message.words] }
				: state;
		case "tool":
			return { ...state, toolResult: message.result };
		case "memory":
			return { ...state, lastMemoryId: message.memory.id };
		case "stop":
			return { ...state, thinking: false };
		case "reply":
			return {
				...state,
				thinking: false,
				lines: [
					...state.lines,
					{ id: message.turnId, role: "sarjy", text: message.text },
				],
			};
		case "timings":
			return { ...state, timings: message.timings };
		case "error":
			return {
				...state,
				error:
					message.code === "memory_failed"
						? (state.error ?? message.code)
						: message.code,
				thinking: message.code === "memory_failed" && state.thinking,
			};
		default:
			return state;
	}
}
