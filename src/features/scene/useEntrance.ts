import { useCallback, useEffect, useRef, useState } from "react";

const WALK_MS = 1920;
const STEP_MS = 960;
const SIT_MS = 700;
const ARRIVED = "translate(0, 0) scale(1)";
const STANDING = "3.076% 1.953%";
const LEFT_STEP = "50.049% 2.93%";
const PASSING = "99.609% 2.93%";
const RIGHT_STEP = "2.051% 100.391%";
const CROUCHING = "50.83% 99.219%";
const SEATED = "99.463% 98.633%";

export type EntranceStage = "waiting" | "walking" | "sitting" | "seated";

export async function animateEntrance(
	element: HTMLElement,
	signal: AbortSignal,
	onSit: () => void,
) {
	const animations: Animation[] = [];
	const stop = () => {
		for (const animation of animations) animation.cancel();
	};
	signal.addEventListener("abort", stop, { once: true });
	try {
		signal.throwIfAborted();
		const walk = element.animate(
			[STANDING, LEFT_STEP, PASSING, RIGHT_STEP, PASSING, STANDING].map(
				(backgroundPosition) => ({ backgroundPosition, easing: "step-end" }),
			),
			{ duration: STEP_MS, iterations: WALK_MS / STEP_MS, fill: "forwards" },
		);
		const approach = element.animate(
			[
				{ transform: getComputedStyle(element).transform },
				{ transform: ARRIVED },
			],
			{ duration: WALK_MS, fill: "forwards", easing: "linear" },
		);
		animations.push(walk, approach);
		await Promise.all([walk.finished, approach.finished]);
		signal.throwIfAborted();
		onSit();
		const sit = element.animate(
			[
				{ backgroundPosition: STANDING, offset: 0, easing: "step-end" },
				{ backgroundPosition: CROUCHING, offset: 0.2, easing: "step-end" },
				{ backgroundPosition: SEATED, offset: 0.65 },
				{ backgroundPosition: SEATED, offset: 1 },
			],
			{ duration: SIT_MS, fill: "forwards" },
		);
		animations.push(sit);
		await sit.finished;
		signal.throwIfAborted();
		approach.commitStyles();
		sit.commitStyles();
		return true;
	} catch (error) {
		if (signal.aborted) return false;
		throw error;
	} finally {
		signal.removeEventListener("abort", stop);
		stop();
	}
}

export function useEntrance() {
	const ref = useRef<HTMLSpanElement>(null);
	const attempt = useRef<AbortController | null>(null);
	const seated = useRef(false);
	const [stage, setStage] = useState<EntranceStage>("waiting");
	const cancel = useCallback(() => attempt.current?.abort(), []);
	const enter = useCallback(async () => {
		if (attempt.current) return false;
		if (seated.current) return true;
		const controller = new AbortController();
		attempt.current = controller;
		try {
			setStage("walking");
			const complete =
				!ref.current || matchMedia("(prefers-reduced-motion: reduce)").matches
					? true
					: await animateEntrance(ref.current, controller.signal, () =>
							setStage("sitting"),
						);
			seated.current = complete;
			setStage(complete ? "seated" : "waiting");
			return complete;
		} catch (error) {
			setStage("waiting");
			throw error;
		} finally {
			attempt.current = null;
		}
	}, []);

	useEffect(() => {
		const onHidden = () => document.hidden && cancel();
		document.addEventListener("visibilitychange", onHidden);
		window.addEventListener("pagehide", cancel);
		return () => {
			cancel();
			document.removeEventListener("visibilitychange", onHidden);
			window.removeEventListener("pagehide", cancel);
		};
	}, [cancel]);

	return { ref, stage, enter, cancel };
}
