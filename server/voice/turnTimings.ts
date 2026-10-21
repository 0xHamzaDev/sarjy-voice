import type { Stage } from "@shared/protocol";

type Mark =
	| "speechEnd"
	| "sttEnd"
	| "sttRequest"
	| "transcriptFinal"
	| "memoryDone"
	| "promptReady"
	| "llmRequest"
	| "llmFirstToken"
	| "llmDone"
	| "firstSentence"
	| "ttsRequest"
	| "ttsFirstAudio"
	| "ttsDone"
	| "firstChunkSent";

export type Marks = Partial<Record<Mark, number>>;

export type ClientTimings = { rttMs: number; playbackMs: number };

const between = (marks: Marks, from: Mark, to: Mark): number | null => {
	const start = marks[from];
	const end = marks[to];
	return start === undefined || end === undefined
		? null
		: Math.round(end - start);
};

export function formatTiming(
	turn: number,
	marks: Marks,
	cleanupMs: number,
	e2eMs: number | null,
): string {
	const fields: [string, number | null][] = [
		["vad", between(marks, "speechEnd", "sttEnd")],
		["stt", between(marks, "sttRequest", "transcriptFinal")],
		["prompt", between(marks, "transcriptFinal", "promptReady")],
		["llm_first", between(marks, "llmRequest", "llmFirstToken")],
		["llm_total", between(marks, "llmRequest", "llmDone")],
		["cleanup", Math.round(cleanupMs)],
		["tts_first", between(marks, "ttsRequest", "ttsFirstAudio")],
		["tts_total", between(marks, "ttsRequest", "ttsDone")],
		["e2e", e2eMs],
	];
	return [
		`[TIMING] turn ${turn}`,
		...fields.map(([name, ms]) => `${name} ${ms ?? "–"}`),
	].join(" | ");
}

export function toStages(marks: Marks, client: ClientTimings | null) {
	const network = client ? Math.round(client.rttMs / 2) : null;
	const playback = client ? Math.round(client.playbackMs) : null;
	const stages: Record<Stage, number | null> = {
		endpointing: between(marks, "speechEnd", "sttEnd"),
		sttFinalize: between(marks, "sttEnd", "transcriptFinal"),
		memoryLookup: between(marks, "transcriptFinal", "memoryDone"),
		llmFirstToken: between(marks, "llmRequest", "llmFirstToken"),
		firstSentence: between(marks, "llmFirstToken", "firstSentence"),
		ttsFirstAudio: between(marks, "ttsRequest", "ttsFirstAudio"),
		network,
		playback,
	};
	const serverMs = between(marks, "speechEnd", "firstChunkSent");
	const ttfaMs =
		serverMs === null || network === null || playback === null
			? null
			: serverMs + network + playback;
	return { stages, serverMs, ttfaMs };
}
