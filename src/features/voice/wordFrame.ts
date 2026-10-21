import type { Word } from "@shared/protocol";

const CAPTION_PAGE_WORDS = 6;

export function wordFrame(words: Word[], elapsedMs: number) {
	const wordIndex = words.reduce(
		(found, word, index) => (word.startMs <= elapsedMs ? index : found),
		0,
	);
	const pageStart =
		Math.floor(wordIndex / CAPTION_PAGE_WORDS) * CAPTION_PAGE_WORDS;
	const pageWords = words.slice(pageStart, pageStart + CAPTION_PAGE_WORDS);
	return {
		pageWords,
		activeIndex: pageWords.findIndex(
			(word) => elapsedMs >= word.startMs && elapsedMs < word.endMs,
		),
	};
}
