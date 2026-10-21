import {
	detectLanguage,
	isCodeSwitched,
} from "@server/voice/listen/detectLanguage";
import { expect, test } from "vitest";

test("detects the dominant language by word count", () => {
	expect(detectLanguage("What's my favorite color?")).toBe("en");
	expect(detectLanguage("وش لوني المفضل؟")).toBe("ar");
	expect(detectLanguage("متى المغرب today?")).toBe("ar");
	expect(detectLanguage("remind me بكرة about the meeting")).toBe("en");
});

test("defaults to Arabic when there are no letters", () => {
	expect(detectLanguage("123 ?")).toBe("ar");
	expect(detectLanguage("")).toBe("ar");
});

test("code-switching needs a real share of the minority language", () => {
	expect(isCodeSwitched("متى صلاة المغرب today?")).toBe(false);
	expect(isCodeSwitched("I want to book موعد بكرة الصبح")).toBe(true);
	expect(isCodeSwitched("What's my favorite color?")).toBe(false);
	expect(isCodeSwitched("")).toBe(false);
});
