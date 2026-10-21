import { toStages } from "@server/voice/turnTimings";
import { expect, test } from "vitest";

const marks = {
	speechEnd: 1000,
	sttEnd: 1300,
	transcriptFinal: 1310,
	memoryDone: 1450,
	llmRequest: 1450,
	llmFirstToken: 1700,
	firstSentence: 1900,
	ttsRequest: 1900,
	ttsFirstAudio: 2000,
	firstChunkSent: 2002,
};

test("computes stage durations and TTFA", () => {
	const result = toStages(marks, { rttMs: 80, playbackMs: 15 });
	expect(result.stages).toEqual({
		endpointing: 300,
		sttFinalize: 10,
		memoryLookup: 140,
		llmFirstToken: 250,
		firstSentence: 200,
		ttsFirstAudio: 100,
		network: 40,
		playback: 15,
	});
	expect(result.serverMs).toBe(1002);
	expect(result.ttfaMs).toBe(1057);
});

test("missing marks and client data become null", () => {
	const result = toStages({ speechEnd: 1000, firstChunkSent: 2000 }, null);
	expect(result.stages.memoryLookup).toBeNull();
	expect(result.stages.network).toBeNull();
	expect(result.serverMs).toBe(1000);
	expect(result.ttfaMs).toBeNull();
});
