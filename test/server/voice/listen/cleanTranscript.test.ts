import {
	cleanTranscript,
	foldArabic,
	tidyPunctuation,
} from "@server/voice/listen/cleanTranscript";
import { expect, test } from "vitest";

const confident = (text: string) =>
	cleanTranscript({ text, avgLogprobs: [-0.2] });

test("keeps real Arabic, English and mixed speech", () => {
	expect(confident(" I want to study بس ما عندي motivation أبدا. ")).toBe(
		"I want to study بس ما عندي motivation أبدا.",
	);
	expect(confident("سرجي، وش الجو في الرياض today؟")).toBe(
		"سرجي، وش الجو في الرياض today؟",
	);
	expect(confident("Maghrib")).toBe("Maghrib");
});

test("tidies spacing, doubled punctuation and repeated sentences", () => {
	expect(tidyPunctuation("ذكرني بكرة . Remind me..")).toBe(
		"ذكرني بكرة. Remind me.",
	);
	expect(tidyPunctuation("Yes. Yes.")).toBe("Yes.");
	expect(tidyPunctuation("hi,there")).toBe("hi, there");
});

test.each([
	"What time is Maghrib in Riyadh today?",
	"Hey Sarjy, what time is Maghrib in Riyadh today?",
	"هلا سرجي، ذكرني بعد صلاة المغرب today، okay؟ نعم، تمام.",
])("keeps confident speech that overlaps the recognition prompt: %s", (text) => {
	expect(confident(text)).toBe(text);
});

test.each([
	"27",
	"٢٧",
	"7:30",
	"٧:٣٠",
	"3.14",
	"٣.١٤",
	"٣٫١٤",
	".5",
	"-.5",
	"My version is 2.3.4",
	"It costs .5 riyals.",
])("preserves numeric meaning and decimal punctuation: %s", (text) => {
	expect(confident(text)).toBe(text);
});

test("drops silence hallucinations and junk", () => {
	expect(confident("ترجمة نانسي قنقر")).toBeNull();
	expect(confident("Thanks for watching!")).toBeNull();
	expect(confident("نعم، ذكرني بعد المغرب")).toBe("نعم، ذكرني بعد المغرب");
	expect(confident(" . ")).toBeNull();
	expect(confident("")).toBeNull();
});

test("drops text Whisper itself had no confidence in", () => {
	expect(cleanTranscript({ text: "بيجرح.", avgLogprobs: [-1.56] })).toBeNull();
});

test("folds Arabic alef variants, diacritics and tatweel but keeps letters", () => {
	expect(foldArabic("إيمان أحمد آمنة")).toBe("ايمان احمد امنه");
	expect(foldArabic("حَمْزَة")).toBe("حمزه");
	expect(foldArabic("مـــرحبا يحيى")).toBe("مرحبا يحيي");
});
