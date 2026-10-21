import { useCallback, useEffect, useRef, useState } from "react";
import { type CampSounds, createCampSounds } from "./campSounds";

const FIRST_GESTURES = ["pointerdown", "keydown"] as const;

export function useCampSounds() {
	const campSoundsRef = useRef<CampSounds | null>(null);
	const [soundOn, setSoundOn] = useState(true);
	const [failed, setFailed] = useState(false);

	const fail = useCallback((error: unknown) => {
		console.error("ambience failed", error);
		campSoundsRef.current = null;
		setSoundOn(false);
		setFailed(true);
	}, []);

	const apply = useCallback(
		async (enabled: boolean) => {
			setSoundOn(enabled);
			try {
				campSoundsRef.current ??= createCampSounds(fail);
				await campSoundsRef.current.setEnabled(enabled);
			} catch (error) {
				fail(error);
			}
		},
		[fail],
	);

	useEffect(() => {
		const stopWaiting = () => {
			for (const type of FIRST_GESTURES)
				window.removeEventListener(type, startOnFirstGesture);
		};
		const startOnFirstGesture = () => {
			stopWaiting();
			if (!campSoundsRef.current) void apply(true);
		};
		for (const type of FIRST_GESTURES)
			window.addEventListener(type, startOnFirstGesture);
		return () => {
			stopWaiting();
			campSoundsRef.current
				?.cleanup()
				.catch((error) => console.error("ambience cleanup failed", error));
			campSoundsRef.current = null;
		};
	}, [apply]);

	return { soundOn, failed, toggle: () => apply(!soundOn) };
}
