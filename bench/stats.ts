import { type Stage, stageNames, type Timings } from "@shared/protocol";

type Summary = { p50: number | null; p95: number | null };

export function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[index] ?? null;
}

const summaryOf = (values: (number | null)[]): Summary => {
	const present = values.filter((value): value is number => value !== null);
	return { p50: percentile(present, 50), p95: percentile(present, 95) };
};

export function summarize(runs: Timings[]): Record<Stage | "ttfa", Summary> {
	const stages = Object.fromEntries(
		stageNames.map((stage) => [
			stage,
			summaryOf(runs.map((run) => run.stages[stage])),
		]),
	) as Record<Stage, Summary>;
	return { ...stages, ttfa: summaryOf(runs.map((run) => run.ttfaMs)) };
}
