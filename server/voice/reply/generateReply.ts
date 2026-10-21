import {
	LLM_TIMEOUT_MS,
	MAX_SPOKEN_SENTENCES,
	MAX_TOOL_ROUNDS,
	TOOL_CALL_LEAK_MARKER,
} from "@server/config";
import { env } from "@server/env";
import type { Memory } from "@server/memory/memoryStore";
import { runTool, toolDefinitions } from "@server/tools/toolRegistry";
import { type ChatMessage, chat, type ToolCall } from "@server/vendors/llm";
import {
	FILLER_TEXT,
	getPhraseAudio,
	getReadyPhraseAudio,
} from "@server/voice/speak/fillerAudio";
import { speakable, stripMarkup } from "@server/voice/speak/speakable";
import { debugLog } from "@server/voice/voiceDebug";
import { withTimeout } from "@server/withTimeout";
import type { City } from "@shared/protocol";
import { currentTimeReply } from "./currentTime";
import type { TurnContext } from "./runTurn";
import { createSentenceChunker, endsSentence } from "./sentenceChunker";
import {
	buildSystemPrompt,
	languageDirective,
	languageNote,
	type TurnLanguage,
} from "./systemPrompt";

export type ReplyResult = {
	reply: string;
	provider: "groq" | "local";
	cleanupMs: number;
};

export async function generateReply(
	context: TurnContext,
	turn: {
		turnLanguage: TurnLanguage;
		memories: Memory[];
		place: City | null;
		sentences: { push(sentence: string): void };
	},
): Promise<ReplyResult> {
	const { transcript, marks, user, tz, signal, sendJson, sendAudio } = context;
	const { turnLanguage, memories, sentences } = turn;
	const { lang } = turnLanguage;
	const streaming = env.PIPELINE === "streaming";

	const memoryTexts = memories.map((memory) => memory.content);
	const systemPrompt = (name: string): ChatMessage => ({
		role: "system",
		content: buildSystemPrompt({
			name,
			memories: memoryTexts,
			now: new Date(),
			tz,
			place: turn.place,
		}),
	});

	const messages: ChatMessage[] = [
		systemPrompt(user.name),
		...context.history,
		{ role: "system", content: languageNote(turnLanguage) },
		{ role: "user", content: transcript },
	];
	marks.promptReady = performance.now();

	const spoken: string[] = [];
	let sentencesSpoken = 0;
	const ttsInput: string[] = [];
	let cleanupMs = 0;
	let leakedToolCall = false;
	const emit = (chunk: string) => {
		if (leakedToolCall) return;
		if (sentencesSpoken >= MAX_SPOKEN_SENTENCES) return;
		const cleanupStart = performance.now();
		const [raw = "", ...leak] = chunk.split(TOOL_CALL_LEAK_MARKER);
		leakedToolCall = leak.length > 0;
		if (leakedToolCall) console.error("llm wrote a tool call as text");
		const sentence = stripMarkup(raw);
		const ttsText = speakable(sentence);
		cleanupMs += performance.now() - cleanupStart;
		if (!sentence.trim()) return;
		spoken.push(sentence);
		if (endsSentence(sentence)) sentencesSpoken++;
		ttsInput.push(ttsText);
		marks.firstSentence ??= performance.now();
		marks.ttsRequest ??= performance.now();
		sentences.push(ttsText);
	};

	const currentTime = currentTimeReply(transcript, lang, tz, new Date());
	if (currentTime) {
		emit(currentTime);
		return { reply: spoken.join(" "), provider: "local", cleanupMs };
	}

	let chunker = createSentenceChunker();
	let reply = "";
	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		marks.llmRequest ??= performance.now();
		let calls: ToolCall[] = [];
		let raw = "";
		debugLog("PROMPT", context.turnNumber, JSON.stringify(messages, null, 2));
		for await (const event of chat({
			messages,
			tools: round < MAX_TOOL_ROUNDS - 1 ? toolDefinitions : [],
			signal: withTimeout(signal, LLM_TIMEOUT_MS),
		})) {
			if (event.type === "tool_calls") calls = event.calls;
			else {
				marks.llmFirstToken ??= performance.now();
				raw += event.text;
				if (streaming) chunker.push(event.text).forEach(emit);
			}
		}
		debugLog(
			"RESULT",
			context.turnNumber,
			calls.length > 0 ? `${raw}\n${JSON.stringify(calls)}` : raw,
		);
		marks.llmDone = performance.now();
		if (calls.length === 0) {
			reply = raw;
			break;
		}
		chunker = createSentenceChunker();
		if (env.FILLER && marks.firstChunkSent === undefined && !signal.aborted) {
			const filler = getReadyPhraseAudio(FILLER_TEXT[lang]);
			if (filler) {
				sendAudio(filler);
				marks.firstChunkSent = performance.now();
			} else void getPhraseAudio(FILLER_TEXT[lang], lang);
		}
		messages.push({
			role: "assistant",
			content: null,
			tool_calls: calls.map((call) => ({
				id: call.id,
				type: "function" as const,
				function: { name: call.name, arguments: call.arguments },
			})),
		});
		for (const call of calls) {
			const content = await runTool(call, {
				...context,
				onResult: (result) => sendJson({ type: "tool", result }),
				onNameSaved: (name) => {
					context.onNameSaved(name);
					messages[0] = systemPrompt(name);
				},
			});
			messages.push({ role: "tool", tool_call_id: call.id, content });
		}
		messages.push({
			role: "system",
			content: languageDirective(turnLanguage),
		});
	}
	if (!streaming) chunker.push(reply).forEach(emit);
	chunker.flush().forEach(emit);
	debugLog("TTS INPUT", context.turnNumber, ttsInput.join("\n"));
	return { reply: spoken.join(" "), provider: "groq", cleanupMs };
}
