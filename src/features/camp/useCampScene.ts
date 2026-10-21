import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { View } from "@/features/devPreview/previewStates";
import { placeStars } from "@/features/memories/starSlots";
import type { Scene } from "@/features/scene/createScene";
import { phaseClock } from "@/features/sky/localClock";
import { type Phase, type SkyTimes, skyPhase } from "@/features/sky/skyPhase";
import { useClock } from "@/features/sky/useClock";

export function useCampScene(times: SkyTimes | null, view: View) {
	const now = useClock();
	const [phaseOverride, setPhaseOverride] = useState<Phase | null>(null);
	const [pose, setPose] = useState<"gesture" | "coffee">("coffee");
	const sceneRef = useRef<Scene | null>(null);
	const stars = useMemo(() => placeStars(view.memories), [view.memories]);

	useEffect(() => {
		if (view.state === "speaking")
			setPose((current) => (current === "gesture" ? "coffee" : "gesture"));
	}, [view.state]);

	const onNewStar = useCallback(
		(point: { x: number; y: number }) => sceneRef.current?.formMemory(point),
		[],
	);

	return {
		now,
		phase: phaseOverride ?? skyPhase(times, phaseClock(now)),
		setPhaseOverride,
		pose,
		sceneRef,
		stars,
		onNewStar,
	};
}
