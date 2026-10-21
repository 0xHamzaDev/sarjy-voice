import { useEffect, useState } from "react";
import type { CallPhase } from "./voiceState";

const TICK_MS = 250;

export function useCallTimer(phase: CallPhase) {
	const [elapsedMs, setElapsedMs] = useState(0);

	useEffect(() => {
		if (phase !== "ready") {
			setElapsedMs(0);
			return;
		}
		const startedAt = Date.now();
		const id = window.setInterval(
			() => setElapsedMs(Date.now() - startedAt),
			TICK_MS,
		);
		return () => window.clearInterval(id);
	}, [phase]);

	return elapsedMs;
}
