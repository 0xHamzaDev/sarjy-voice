import { afterEach, expect, test, vi } from "vitest";
import {
	createPreviewPlayer,
	PREVIEW_START,
	type View,
} from "@/features/devPreview/previewStates";

afterEach(() => {
	vi.useRealTimers();
});

test("full preview follows the sandbox timeline and dispose stops it", () => {
	vi.useFakeTimers();
	let view: View = PREVIEW_START;
	const previewPlayer = createPreviewPlayer((patch) => {
		view = { ...view, ...patch };
	});
	previewPlayer.play("en", "Hamza");
	expect(view.state).toBe("listening");
	vi.advanceTimersByTime(2400);
	expect(view.state).toBe("thinking");
	expect(view.transcript).toBe("Remember that my favorite color is blue");
	vi.advanceTimersByTime(1000);
	expect(view.state).toBe("speaking");
	expect(view.timings?.ttfaMs).toBe(1057);
	expect(view.words.some((word) => word.text === "Hamza.")).toBe(true);
	vi.advanceTimersByTime(7200);
	expect(view.state).toBe("memory-learned");
	expect(view.newId).toBe(7);
	expect(view.memories).toHaveLength(7);
	vi.advanceTimersByTime(2000);
	expect(view.state).toBe("idle");
	previewPlayer.show("listening", "ar", "حمزة");
	previewPlayer.dispose();
	vi.advanceTimersByTime(5000);
	expect(view.transcript).toBe("");
	expect(vi.getTimerCount()).toBe(0);
});
