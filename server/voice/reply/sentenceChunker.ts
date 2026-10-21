import { MAX_CHUNK_CHARS, MIN_CHUNK_CHARS } from "@server/config";

const BREAKS = new Set([".", "!", "?", "؟", "،", ",", "؛", ";"]);
const SENTENCE_ENDS = new Set([".", "!", "?", "؟"]);

export const endsSentence = (chunk: string) =>
	SENTENCE_ENDS.has(chunk.at(-1) ?? "");

const isInitial = (text: string, dot: number) =>
	/[A-Za-z]/.test(text[dot - 1] ?? "") && !/\p{L}/u.test(text[dot - 2] ?? "");

function findCut(text: string): number {
	for (let i = MIN_CHUNK_CHARS - 1; i < text.length; i++) {
		const char = text[i];
		if (char === "\n") return i + 1;
		const next = text[i + 1] ?? "";
		if (char === "." && isInitial(text, i)) continue;
		if (char && BREAKS.has(char) && /\s/.test(next)) return i + 1;
		if (char && SENTENCE_ENDS.has(char) && /\p{L}/u.test(next)) return i + 1;
	}
	if (text.length > MAX_CHUNK_CHARS) {
		const space = text.lastIndexOf(" ", MAX_CHUNK_CHARS);
		return space > 0 ? space + 1 : MAX_CHUNK_CHARS;
	}
	return 0;
}

export function createSentenceChunker() {
	let buffer = "";
	return {
		push(text: string): string[] {
			buffer += text;
			const chunks: string[] = [];
			for (let cut = findCut(buffer); cut > 0; cut = findCut(buffer)) {
				chunks.push(buffer.slice(0, cut).trim());
				buffer = buffer.slice(cut);
			}
			return chunks.filter(Boolean);
		},
		flush(): string[] {
			const rest = buffer.trim();
			buffer = "";
			return rest ? [rest] : [];
		},
	};
}
