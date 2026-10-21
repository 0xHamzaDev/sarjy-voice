import type { View } from "@/features/devPreview/previewStates";
import type { Memory } from "@/features/memories/starSlots";
import {
	type CallState,
	hostState,
	type VoiceState,
	waterfallOf,
} from "@/features/voice/voiceState";
import type { ErrorKey, StringKey } from "@/i18n/strings";

export function sceneState(
	voice: VoiceState,
	call: CallState,
	level: number,
	memories: Memory[],
	preview: View | null,
) {
	const host = hostState(voice, call);
	const lastUser = voice.lines.filter((line) => line.role === "user").at(-1);
	const lastReply = voice.lines.filter((line) => line.role === "sarjy").at(-1);
	const replyText = lastReply?.id === voice.turnId ? lastReply.text : "";
	const view: View = preview ?? {
		state: host,
		level,
		transcript:
			host === "listening" ? voice.live : voice.live || lastUser?.text || "",
		words: voice.words,
		startedAt: voice.playingSince,
		memories,
		newId: voice.lastMemoryId,
		referencedId: null,
		timings: voice.timings && waterfallOf(voice.timings),
	};
	const { state } = view;
	const busy = host === "thinking" || host === "speaking";
	const liveError: ErrorKey | null = voice.micDenied
		? "mic_denied"
		: voice.error;
	const hintKey: StringKey =
		call === "live" || (preview && state === "listening")
			? "micActive"
			: call === "muted"
				? "micMuted"
				: state === "thinking" || state === "speaking"
					? "interrupt"
					: !preview && voice.connection !== "open"
						? "connecting"
						: "micIdle";
	const textReply =
		!preview && voice.error === "tts_failed" && replyText
			? { words: [], startedAt: null, text: replyText }
			: null;
	const errorKey: ErrorKey | null = preview
		? state === "error"
			? "preview"
			: null
		: liveError;
	return {
		view,
		busy,
		hintKey,
		active: state !== "idle" && state !== "error",
		errorKey,
		lastUserText: lastUser?.text ?? null,
		reply:
			state === "speaking"
				? {
						words: view.words,
						startedAt: view.startedAt,
						text: preview ? "" : replyText,
					}
				: textReply,
	};
}
