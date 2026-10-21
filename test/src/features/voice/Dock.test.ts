import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Dock } from "@/features/voice/Dock";

test.each([
	{ call: "off", connecting: false, action: "Talk", end: null },
	{ call: "live", connecting: true, action: "Mute", end: "Cancel call" },
	{ call: "live", connecting: false, action: "Mute", end: "End call" },
	{ call: "muted", connecting: false, action: "Unmute", end: "End call" },
] as const)("call controls stay explicit: $call, connecting=$connecting", ({
	call,
	connecting,
	action,
	end,
}) => {
	const html = renderToStaticMarkup(
		createElement(Dock, {
			lang: "en",
			transcript: "",
			showTranscript: false,
			call,
			hint: connecting ? "Opening microphone…" : "Listening…",
			connecting,
			onMic: vi.fn(),
			onEnd: vi.fn(),
			callDuration: connecting || call === "off" ? null : "0:05",
			note: null,
		}),
	);
	expect(html).toContain(`<span>${action}</span>`);
	const mic = html.match(/<button id="microphone"[^>]*>/)?.[0] ?? "";
	expect(mic.includes("disabled")).toBe(connecting);
	if (call === "off") expect(mic).not.toContain("aria-pressed");
	else expect(mic).toContain(`aria-pressed="${call === "muted"}"`);
	if (end) {
		expect(html).toContain(`<span>${end}</span>`);
		expect(html.match(/<button id="end-call"[^>]*>/)?.[0]).not.toContain(
			"disabled",
		);
	} else expect(html).not.toContain('id="end-call"');
	expect(html.includes('id="call-timer"')).toBe(!connecting && call !== "off");
});
