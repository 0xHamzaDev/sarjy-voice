import type { Timings } from "@shared/protocol";
import { expect, test } from "vitest";
import { percentile, summarize } from "../../bench/stats";

test("nearest-rank percentiles", () => {
	const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
	expect(percentile(values, 50)).toBe(5);
	expect(percentile(values, 95)).toBe(10);
	expect(percentile([42], 95)).toBe(42);
	expect(percentile([], 50)).toBeNull();
});

test("summarize skips null stages", () => {
	const run = (ttfaMs: number | null, llm: number | null): Timings => ({
		turnId: "t",
		ttfaMs,
		llmProvider: "groq",
		pipeline: "streaming",
		stages: {
			endpointing: 300,
			sttFinalize: 0,
			memoryLookup: 100,
			llmFirstToken: llm,
			firstSentence: 150,
			ttsFirstAudio: 90,
			network: 40,
			playback: 0,
		},
	});
	const summary = summarize([run(900, 200), run(1100, null), run(1000, 300)]);
	expect(summary.ttfa).toEqual({ p50: 1000, p95: 1100 });
	expect(summary.llmFirstToken).toEqual({ p50: 200, p95: 300 });
});
