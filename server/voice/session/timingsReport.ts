import { db } from "@server/db/client";
import { turns } from "@server/db/schema";
import { env } from "@server/env";
import type { CompletedTurn } from "@server/voice/reply/runTurn";
import {
	type ClientTimings,
	formatTiming,
	toStages,
} from "@server/voice/turnTimings";
import type { ServerMessage } from "@shared/protocol";
import { and, eq } from "drizzle-orm";

export function createTimingsReport(
	userId: string,
	sendJson: (message: ServerMessage) => void,
) {
	const completedTurns = new Map<string, CompletedTurn>();
	const playedTurns = new Map<string, ClientTimings>();
	const issuedTurnIds = new Set<string>();

	const finalize = (turnId: string) => {
		const done = completedTurns.get(turnId);
		const client = playedTurns.get(turnId);
		if (!done || !client) return;
		completedTurns.delete(turnId);
		playedTurns.delete(turnId);
		const { stages, ttfaMs } = toStages(done.marks, client);
		if (env.VOICE_DEBUG)
			console.log(
				formatTiming(done.turnNumber, done.marks, done.cleanupMs, ttfaMs),
			);
		sendJson({
			type: "timings",
			timings: {
				turnId,
				stages,
				ttfaMs,
				llmProvider: done.provider,
				pipeline: env.PIPELINE,
			},
		});
		db.update(turns)
			.set({ timings: { marks: done.marks, stages, ttfaMs } })
			.where(and(eq(turns.id, turnId), eq(turns.userId, userId)))
			.catch((error) => console.error("timings update failed", error));
	};

	return {
		issued(turnId: string) {
			issuedTurnIds.add(turnId);
		},
		completed(turn: CompletedTurn) {
			completedTurns.set(turn.turnId, turn);
			finalize(turn.turnId);
		},
		played(turnId: string, timings: ClientTimings) {
			if (!issuedTurnIds.has(turnId)) return;
			playedTurns.set(turnId, timings);
			finalize(turnId);
		},
	};
}
