import type { sceneState } from "@/features/scene/sceneState";
import { formatCallDuration } from "@/features/voice/callDisplay";
import { useCallTimer } from "@/features/voice/useCallTimer";
import type { useVoice } from "@/features/voice/useVoice";
import type { StringKey } from "@/i18n/strings";
import {
	campCallStatus,
	campErrorKey,
	isEntering,
	retryKindFor,
} from "./campView";
import type { useCallControl } from "./useCallControl";

export function useCampStatus(
	t: (key: StringKey) => string,
	voice: ReturnType<typeof useVoice>,
	scene: ReturnType<typeof sceneState>,
	{
		entrance,
		onMic,
	}: Pick<ReturnType<typeof useCallControl>, "entrance" | "onMic">,
	soundFailed: boolean,
) {
	const elapsed = useCallTimer(voice.phase);
	const entering = isEntering(entrance);
	const { state } = scene.view;
	const errorKey = campErrorKey(scene.errorKey, voice.connectFailed);
	const retryKind = retryKindFor(voice.connectFailed, errorKey);
	const retries = {
		mic: onMic,
		resend: () => scene.lastUserText && voice.sendText(scene.lastUserText),
		reload: () => location.reload(),
	};
	return {
		hostLabel: entering
			? t("cancel")
			: voice.call !== "off" && scene.busy
				? t("interrupt")
				: t(scene.hintKey),
		hint: campCallStatus(
			t,
			voice.state.connection,
			voice.phase,
			entrance,
			voice.call,
			state,
		),
		callDuration:
			voice.phase === "ready" && !entering ? formatCallDuration(elapsed) : null,
		announcer: t(soundFailed ? "soundError" : entering ? entrance : state),
		errorKey,
		onRetry: retryKind ? retries[retryKind] : null,
	};
}
