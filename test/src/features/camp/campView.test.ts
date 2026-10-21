import { expect, test } from "vitest";
import {
	campCallStatus,
	campErrorKey,
	isDockDisabled,
	retryKindFor,
} from "@/features/camp/campView";
import { translate } from "@/i18n/strings";

const t = translate("en");

test("callStatus reflects a dropped connection before anything else", () => {
	expect(
		campCallStatus(t, "reconnecting", "idle", "waiting", "off", "idle"),
	).toBe(t("reconnecting"));
});

test("callStatus shows the entrance line while the host is walking over", () => {
	expect(campCallStatus(t, "open", "ready", "walking", "live", "idle")).toBe(
		t("walking"),
	);
});

test("callStatus shows the live host state once seated and on a call", () => {
	expect(
		campCallStatus(t, "open", "ready", "seated", "live", "listening"),
	).toBe(t("listening"));
});

test("callStatus falls back to idle or ended when the call is off", () => {
	expect(campCallStatus(t, "open", "idle", "seated", "off", "idle")).toBe(
		t("idle"),
	);
	expect(campCallStatus(t, "open", "ended", "seated", "off", "idle")).toBe(
		t("callEnded"),
	);
});

test("dock disables while the entrance animation or handshake is in progress", () => {
	expect(isDockDisabled("open", "idle", true)).toBe(true);
	expect(isDockDisabled("open", "connecting", false)).toBe(true);
	expect(isDockDisabled("open", "preparing", false)).toBe(true);
	expect(isDockDisabled("reconnecting", "idle", false)).toBe(true);
	expect(isDockDisabled("open", "idle", false)).toBe(false);
});

test("errorKey prefers the scene error over a connect failure", () => {
	expect(campErrorKey("mic_denied", true)).toBe("mic_denied");
	expect(campErrorKey(null, true)).toBe("connect_failed");
	expect(campErrorKey(null, false)).toBeNull();
});

test("retryKind prefers reopening the mic after a connect failure", () => {
	expect(retryKindFor(true, "tts_failed")).toBe("mic");
	expect(retryKindFor(false, "llm_failed")).toBe("resend");
	expect(retryKindFor(false, null)).toBeNull();
});
