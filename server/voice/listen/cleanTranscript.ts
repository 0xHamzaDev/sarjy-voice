import { WHISPER_MIN_AVG_LOGPROB, WHISPER_PROMPT } from "@server/config";
import type { Transcription } from "@server/vendors/speechToText";

const PHANTOM_PHRASES = [
	"ترجمة نانسي قنقر",
	"اشتركوا في القناة",
	"شكرا للمشاهدة",
	"شكرا على المشاهدة",
	"thank you for watching",
	"thanks for watching",
	"please subscribe",
	"subtitles by the amara org community",
];

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_ALEF_VARIANTS = /[أإآ]/g;

export const foldArabic = (text: string) =>
	text
		.replace(ARABIC_MARKS, "")
		.replace(ARABIC_ALEF_VARIANTS, "ا")
		.replaceAll("ة", "ه")
		.replaceAll("ى", "ي");

const normalize = (text: string) =>
	foldArabic(text.toLowerCase())
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

const NORMALIZED_PHANTOMS = new Set(PHANTOM_PHRASES.map(normalize));

export const whisperPrompt = (names: string[]) =>
	[WHISPER_PROMPT, ...names].join(" ");

export function tidyPunctuation(text: string): string {
	const spaced = text
		.replace(/\s+/g, " ")
		.replace(/\s+([,!?؟،؛]|\.(?!\p{N}))/gu, "$1")
		.replace(/([.,!?؟،؛])\1+/g, "$1")
		.replace(/([.!?؟،؛,])(?=\p{L})/gu, "$1 ")
		.replace(/^(?:[\s,!?؟،؛]|\.(?!\p{N}))+/u, "")
		.trim();
	const sentences = spaced.match(/(?:[^.!?؟]|\.(?=\p{N}))+[.!?؟]*/gu) ?? [];
	return sentences
		.map((sentence) => sentence.trim())
		.filter(
			(sentence, i, all) =>
				i === 0 || normalize(sentence) !== normalize(all[i - 1] ?? ""),
		)
		.join(" ");
}

export function cleanTranscript({
	text,
	avgLogprobs,
}: Pick<Transcription, "text" | "avgLogprobs">): string | null {
	if (
		avgLogprobs.length > 0 &&
		avgLogprobs.every((logprob) => logprob < WHISPER_MIN_AVG_LOGPROB)
	)
		return null;
	const tidy = tidyPunctuation(text);
	const key = normalize(tidy);
	if (!key || NORMALIZED_PHANTOMS.has(key)) return null;
	return tidy;
}
