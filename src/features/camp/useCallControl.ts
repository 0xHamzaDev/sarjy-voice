import type { Lang } from "@shared/protocol";
import { useCallback, useEffect, useRef } from "react";
import { useEntrance } from "@/features/scene/useEntrance";
import type { useVoice } from "@/features/voice/useVoice";
import { isDockDisabled, isEntering } from "./campView";

export function useCallControl(
	voice: ReturnType<typeof useVoice>,
	lang: Lang,
	busy: boolean,
	leave: () => void,
) {
	const {
		ref: arrivalRef,
		stage: entrance,
		enter,
		cancel: cancelEntrance,
	} = useEntrance();
	const entering = isEntering(entrance);
	const dockDisabled = isDockDisabled(
		voice.state.connection,
		voice.phase,
		entering,
	);
	const { interrupt, call, startCall, toggleMute, endCall } = voice;
	const entranceCall = useRef<symbol | null>(null);

	const stopCall = useCallback(() => {
		entranceCall.current = null;
		cancelEntrance();
		endCall();
	}, [cancelEntrance, endCall]);

	const hangUp = useCallback(() => {
		leave();
		interrupt();
		stopCall();
	}, [leave, interrupt, stopCall]);

	useEffect(() => {
		if (call !== "off") return;
		entranceCall.current = null;
		cancelEntrance();
	}, [call, cancelEntrance]);

	const onMic = () => {
		leave();
		if (dockDisabled) return;
		if (call !== "off") return toggleMute();
		if (busy) interrupt();
		if (entranceCall.current) return;
		const attempt = Symbol();
		entranceCall.current = attempt;
		void startCall(lang, enter()).finally(() => {
			if (entranceCall.current !== attempt) return;
			entranceCall.current = null;
			cancelEntrance();
		});
	};

	const onHost = () => {
		if (entering) return stopCall();
		if (call === "off" || !busy) return onMic();
		leave();
		interrupt();
	};

	return {
		arrivalRef,
		entrance,
		entering,
		dockDisabled,
		onMic,
		onHost,
		stopCall,
		hangUp,
	};
}
