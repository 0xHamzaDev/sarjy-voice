import { randomUUID } from "node:crypto";
import { WHISPER_MODEL } from "@server/config";
import { db } from "@server/db/client";
import { turns } from "@server/db/schema";
import { env } from "@server/env";
import { type Memory, memoriesForPrompt } from "@server/memory/memoryStore";
import { cityOf, isFallbackCoords } from "@server/tools/reverseGeocode";
import type { User } from "@server/users/userStore";
import type { ChatMessage } from "@server/vendors/llm";
import { createAsyncQueue } from "@server/voice/asyncQueue";
import {
	detectLanguage,
	isCodeSwitched,
} from "@server/voice/listen/detectLanguage";
import {
	getPhraseAudio,
	LLM_FAILED_TEXT,
} from "@server/voice/speak/fillerAudio";
import { speakReply } from "@server/voice/speak/speakReply";
import { type Marks, toStages } from "@server/voice/turnTimings";
import type { Coords, Lang, ServerMessage } from "@shared/protocol";
import { generateReply, type ReplyResult } from "./generateReply";

export type TurnContext = {
	transcript: string;
	marks: Marks;
	user: User;
	tz: string;
	coords: Coords;
	lang?: Lang;
	turnNumber: number;
	memories: Promise<Memory[]>;
	history: ChatMessage[];
	signal: AbortSignal;
	sendJson(message: ServerMessage): void;
	sendAudio(pcm: Buffer): void;
	onNameSaved(name: string): void;
};

export type CompletedTurn = {
	turnId: string;
	reply: string;
	marks: Marks;
	provider: ReplyResult["provider"];
	lang: Lang;
	cleanupMs: number;
	turnNumber: number;
};

export async function runTurn(
	context: TurnContext,
): Promise<CompletedTurn | null> {
	const { transcript, marks, user, signal, sendJson, sendAudio } = context;
	const turnId = randomUUID();
	const lang = context.lang ?? detectLanguage(transcript);
	const turnLanguage = {
		lang,
		mixed: !context.lang && isCodeSwitched(transcript),
	};
	sendJson({ type: "turn", turnId });

	const [memories, place] = await Promise.all([
		memoriesForPrompt(user.id, transcript, signal, context.memories).catch(
			(error) => {
				if (signal.aborted) return [];
				console.error("memory search failed", error);
				sendJson({ type: "error", code: "memory_failed" });
				return [];
			},
		),
		isFallbackCoords(context.coords) ? null : cityOf(context.coords),
	]);
	if (signal.aborted) return null;
	marks.memoryDone = performance.now();

	const sentences = createAsyncQueue<string>();

	const [replyResult, speechResult] = await Promise.allSettled([
		generateReply(context, {
			turnLanguage,
			memories,
			place,
			sentences,
		}).finally(() => sentences.end()),
		speakReply(sentences, lang, turnId, context),
	]);
	if (signal.aborted) return null;
	if (replyResult.status === "rejected") {
		console.error("llm failed", replyResult.reason);
		sendJson({ type: "error", code: "llm_failed" });
		const apology = await getPhraseAudio(LLM_FAILED_TEXT[lang], lang);
		if (apology && !signal.aborted) sendAudio(apology);
		return null;
	}
	if (!replyResult.value.reply) {
		console.error("llm returned an empty reply");
		sendJson({ type: "error", code: "llm_failed" });
		return null;
	}
	if (speechResult.status === "rejected") {
		console.error("tts failed", speechResult.reason);
		sendJson({ type: "error", code: "tts_failed" });
	}

	const { reply, provider, cleanupMs } = replyResult.value;
	sendJson({ type: "reply", turnId, text: reply });
	const vendors = {
		stt: WHISPER_MODEL,
		llm: provider,
		tts: "elevenlabs",
		pipeline: env.PIPELINE,
	};
	const timings = { marks, ...toStages(marks, null) };
	await db
		.insert(turns)
		.values({
			id: turnId,
			userId: user.id,
			transcript,
			reply,
			lang,
			vendors,
			timings,
		})
		.catch((error) => console.error("turn insert failed", error));
	if (signal.aborted) return null;
	return {
		turnId,
		reply,
		marks,
		provider,
		lang,
		cleanupMs,
		turnNumber: context.turnNumber,
	};
}
