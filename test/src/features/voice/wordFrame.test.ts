import { expect, test } from "vitest";
import { wordFrame } from "@/features/voice/wordFrame";

test("word boundaries preserve supplied timestamps and six-word pages", () => {
	const words = Array.from({ length: 8 }, (_, i) => ({
		text: `${i}`,
		startMs: 100 + i * 500,
		endMs: 500 + i * 500,
	}));
	expect(wordFrame(words, 99).activeIndex).toBe(-1);
	expect(wordFrame(words, 100).activeIndex).toBe(0);
	expect(wordFrame(words, 499).activeIndex).toBe(0);
	expect(wordFrame(words, 500).activeIndex).toBe(-1);
	expect(wordFrame(words, 600).activeIndex).toBe(1);
	expect(wordFrame(words, 3099).pageWords).toEqual(words.slice(0, 6));
	expect(wordFrame(words, 3100).pageWords).toEqual(words.slice(6));
	expect(wordFrame(words, 3100).activeIndex).toBe(0);
	expect(wordFrame([], 0)).toEqual({ pageWords: [], activeIndex: -1 });
});
