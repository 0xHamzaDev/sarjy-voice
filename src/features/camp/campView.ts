import type { EntranceStage } from "@/features/scene/useEntrance";
import type {
	CallPhase,
	CallState,
	VoiceState,
} from "@/features/voice/voiceState";
import {
	ERRORS,
	type ErrorKey,
	type Retry,
	type StringKey,
} from "@/i18n/strings";

export const isEntering = (
	entrance: EntranceStage,
): entrance is "walking" | "sitting" =>
	entrance === "walking" || entrance === "sitting";

export function campCallStatus(
	t: (key: StringKey) => string,
	connection: VoiceState["connection"],
	callPhase: CallPhase,
	entrance: EntranceStage,
	call: CallState,
	state: StringKey,
): string {
	if (connection !== "open") return t(connection);
	if (callPhase === "connecting") return t("openingMic");
	if (isEntering(entrance)) return t(entrance);
	if (callPhase === "preparing") return t("preparing");
	if (call === "muted") return t("muted");
	if (call === "live") return t(state);
	return t(callPhase === "ended" ? "callEnded" : "idle");
}

export function isDockDisabled(
	connection: VoiceState["connection"],
	callPhase: CallPhase,
	entering: boolean,
): boolean {
	return (
		connection !== "open" ||
		entering ||
		callPhase === "connecting" ||
		callPhase === "preparing"
	);
}

export function campErrorKey(
	sceneErrorKey: ErrorKey | null,
	connectFailed: boolean,
): ErrorKey | null {
	return sceneErrorKey ?? (connectFailed ? "connect_failed" : null);
}

export function retryKindFor(
	connectFailed: boolean,
	errorKey: ErrorKey | null,
): Retry {
	if (connectFailed) return "mic";
	return errorKey ? ERRORS[errorKey][2] : null;
}
