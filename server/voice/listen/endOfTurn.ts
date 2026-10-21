import { foldArabic } from "./cleanTranscript";

const HANGING_WORDS = new Set(
	"و او بس لكن يعني اللي الي عشان لان اذا لو في من علي مع ثم and or but so because if the a an to of in with um uh like".split(
		" ",
	),
);

const FINAL_PUNCTUATION = /(?<![.…])[.!?؟]$/;
const LAST_WORD = /[\p{L}\p{N}]+(?=[^\p{L}\p{N}]*$)/u;

export function soundsFinished(text: string): boolean {
	const trimmed = text.trim();
	if (!FINAL_PUNCTUATION.test(trimmed)) return false;
	const lastWord = foldArabic(trimmed.toLowerCase()).match(LAST_WORD)?.[0];
	return lastWord !== undefined && !HANGING_WORDS.has(lastWord);
}
