import { expect, test } from "vitest";
import { PREVIEW_START } from "@/features/devPreview/previewStates";
import { sceneState } from "@/features/scene/sceneState";
import {
	applyServerMessage,
	initialVoiceState,
	setPlaying,
} from "@/features/voice/voiceState";

const turn = applyServerMessage(initialVoiceState, {
	type: "turn",
	turnId: "t1",
});

test("speaking shows the current turn's reply and offers interrupt", () => {
	const replied = applyServerMessage(setPlaying(turn, 10), {
		type: "reply",
		turnId: "t1",
		text: "أهلاً",
	});
	const scene = sceneState(replied, "off", 0, [], null);
	expect(scene.view.state).toBe("speaking");
	expect(scene.hintKey).toBe("interrupt");
	expect(scene.reply).toEqual({ words: [], startedAt: 10, text: "أهلاً" });
});

test("a failed voice keeps the reply on screen as text", () => {
	const failed = applyServerMessage(
		applyServerMessage(turn, { type: "error", code: "tts_failed" }),
		{ type: "reply", turnId: "t1", text: "مكتوب" },
	);
	const scene = sceneState(failed, "off", 0, [], null);
	expect(scene.view.state).toBe("error");
	expect(scene.errorKey).toBe("tts_failed");
	expect(scene.reply?.text).toBe("مكتوب");
});

test("a preview replaces the live view and its error", () => {
	const scene = sceneState(
		{ ...initialVoiceState, micDenied: true },
		"off",
		0,
		[],
		{ ...PREVIEW_START, state: "error" },
	);
	expect(scene.errorKey).toBe("preview");
	expect(scene.view.memories).toHaveLength(6);
	expect(
		sceneState({ ...initialVoiceState, micDenied: true }, "off", 0, [], null)
			.errorKey,
	).toBe("mic_denied");
});

test("the hint follows the call: connect, start, mute, unmute", () => {
	const open = applyServerMessage(initialVoiceState, {
		type: "ready",
		name: "Hamza",
	});
	expect(sceneState(initialVoiceState, "off", 0, [], null).hintKey).toBe(
		"connecting",
	);
	expect(sceneState(open, "off", 0, [], null).hintKey).toBe("micIdle");
	expect(sceneState(open, "live", 0, [], null).hintKey).toBe("micActive");
	expect(sceneState(open, "muted", 0, [], null).hintKey).toBe("micMuted");
});

test("in a call the mic hint describes muting, even while Sarjy speaks", () => {
	const speaking = setPlaying(turn, 10);
	expect(sceneState(speaking, "live", 0, [], null).hintKey).toBe("micActive");
	expect(sceneState(speaking, "muted", 0, [], null).hintKey).toBe("micMuted");
});
