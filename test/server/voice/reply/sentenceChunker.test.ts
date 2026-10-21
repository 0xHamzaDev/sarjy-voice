import { MAX_CHUNK_CHARS } from "@server/config";
import {
	createSentenceChunker,
	endsSentence,
} from "@server/voice/reply/sentenceChunker";
import { expect, test } from "vitest";

const streamed = (text: string) => {
	const chunker = createSentenceChunker();
	const out = [...text].flatMap((char) => chunker.push(char));
	return [...out, ...chunker.flush()];
};

test("splits English sentences as they stream", () => {
	expect(streamed("Hello there. The weather is nice today! Bye")).toEqual([
		"Hello there.",
		"The weather is nice today!",
		"Bye",
	]);
});

test("splits Arabic on ؟ and does not split a short clause at ،", () => {
	expect(streamed("أهلاً حمزة، كيف حالك؟ المغرب الساعة ستة")).toEqual([
		"أهلاً حمزة، كيف حالك؟",
		"المغرب الساعة ستة",
	]);
});

test("does not split decimals", () => {
	expect(streamed("The temperature is 3.5 degrees warmer. Nice")).toEqual([
		"The temperature is 3.5 degrees warmer.",
		"Nice",
	]);
});

test("force-flushes long unpunctuated text at a word boundary", () => {
	const chunks = streamed("word ".repeat(100));
	expect(chunks.length).toBeGreaterThan(1);
	for (const chunk of chunks)
		expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
	expect(chunks.join(" ")).toBe("word ".repeat(100).trim());
});

test("flush on empty returns nothing", () => {
	expect(createSentenceChunker().flush()).toEqual([]);
});

test("splits sentences the model glued together without a space", () => {
	const chunker = createSentenceChunker();
	expect(chunker.push("يالله، شد حيلك!يومك زين ولا؟الحين كله تمام")).toEqual([
		"يالله، شد حيلك!",
		"يومك زين ولا؟",
	]);
	expect(chunker.flush()).toEqual(["الحين كله تمام"]);
});

test("does not split inside a.m., p.m. or initials", () => {
	expect(
		streamed("Fajr is at 4:27 a.m. and Asr at 3:09 p.m. today. Bye"),
	).toEqual(["Fajr is at 4:27 a.m. and Asr at 3:09 p.m. today.", "Bye"]);
});

test("knows which chunks end a sentence", () => {
	expect(endsSentence("تمام.")).toBe(true);
	expect(endsSentence("وش علومك؟")).toBe(true);
	expect(endsSentence("يالله،")).toBe(false);
});
