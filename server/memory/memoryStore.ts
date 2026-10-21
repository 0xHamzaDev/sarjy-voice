import {
	EMBEDDING_DIMENSIONS,
	GEMINI_EMBED_URL,
	MEMORY_DUPLICATE_DISTANCE,
	MEMORY_PROMPT_MAX,
	MEMORY_TIMEOUT_MS,
	MEMORY_TOP_K,
} from "@server/config";
import { db } from "@server/db/client";
import { memories, users } from "@server/db/schema";
import { env } from "@server/env";
import { detectLanguage } from "@server/voice/listen/detectLanguage";
import { withTimeout } from "@server/withTimeout";
import {
	and,
	asc,
	cosineDistance,
	desc,
	eq,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";

export type Memory = { id: number; content: string };
export type MemorySnapshot = { revision: number; memories: Memory[] };

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const embeddingResponse = z.object({
	embedding: z.object({ values: z.array(z.number()) }),
});

async function embed(
	text: string,
	taskType: TaskType,
	signal: AbortSignal,
): Promise<number[]> {
	const response = await fetch(GEMINI_EMBED_URL, {
		method: "POST",
		signal: withTimeout(signal, MEMORY_TIMEOUT_MS),
		headers: {
			"content-type": "application/json",
			"x-goog-api-key": env.GEMINI_API_KEY,
		},
		body: JSON.stringify({
			content: { parts: [{ text }] },
			taskType,
			outputDimensionality: EMBEDDING_DIMENSIONS,
		}),
	});
	if (!response.ok)
		throw new Error(
			`gemini embed ${response.status}: ${await response.text()}`,
		);
	return embeddingResponse.parse(await response.json()).embedding.values;
}

const memoryColumns = { id: memories.id, content: memories.content };

export async function saveMemory(
	userId: string,
	content: string,
	signal: AbortSignal,
	expectedRevision: number,
): Promise<Memory | null> {
	signal.throwIfAborted();
	content = content.trim();
	const embedding = await embed(content, "RETRIEVAL_DOCUMENT", signal);
	return db.transaction(async (tx) => {
		const [user] = await tx
			.select({ revision: users.memoryRevision })
			.from(users)
			.where(eq(users.id, userId))
			.for("update");
		signal.throwIfAborted();
		if (!user || user.revision !== expectedRevision) return null;
		const [existing] = await tx
			.select(memoryColumns)
			.from(memories)
			.where(
				and(
					eq(memories.userId, userId),
					or(
						sql`lower(trim(${memories.content})) = lower(${content})`,
						lt(
							cosineDistance(memories.embedding, embedding),
							MEMORY_DUPLICATE_DISTANCE,
						),
					),
				),
			)
			.limit(1);
		signal.throwIfAborted();
		if (existing) return existing;
		const [memory] = await tx
			.insert(memories)
			.values({ userId, content, lang: detectLanguage(content), embedding })
			.returning(memoryColumns);
		signal.throwIfAborted();
		if (!memory) throw new Error("memory insert returned no row");
		return memory;
	});
}

const memoriesOf = (userId: string) =>
	db.select(memoryColumns).from(memories).where(eq(memories.userId, userId));

export async function searchMemories(
	userId: string,
	query: string,
	signal: AbortSignal,
): Promise<Memory[]> {
	const embedding = await embed(query, "RETRIEVAL_QUERY", signal);
	return memoriesOf(userId)
		.orderBy(cosineDistance(memories.embedding, embedding))
		.limit(MEMORY_TOP_K);
}

export const recentMemories = (userId: string): Promise<Memory[]> =>
	memoriesOf(userId)
		.orderBy(desc(memories.createdAt), desc(memories.id))
		.limit(MEMORY_PROMPT_MAX + 1);

export async function readMemorySnapshot(
	userId: string,
): Promise<MemorySnapshot> {
	const [user] = await db
		.select({ revision: users.memoryRevision })
		.from(users)
		.where(eq(users.id, userId));
	if (!user) throw new Error("memory user not found");
	return { revision: user.revision, memories: await recentMemories(userId) };
}

export async function memoriesForPrompt(
	userId: string,
	query: string,
	signal: AbortSignal,
	prefetched: Promise<Memory[]>,
): Promise<Memory[]> {
	const recent = await prefetched;
	if (recent.length <= MEMORY_PROMPT_MAX) return recent;
	const similar = await searchMemories(userId, query, signal);
	const similarIds = new Set(similar.map((memory) => memory.id));
	const newest = recent
		.filter((memory) => !similarIds.has(memory.id))
		.slice(0, MEMORY_PROMPT_MAX - similar.length);
	return [...similar, ...newest];
}

export const listMemories = (userId: string): Promise<Memory[]> =>
	memoriesOf(userId).orderBy(asc(memories.createdAt));

async function forgetMemories(userId: string, match?: SQL) {
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ memoryRevision: sql`${users.memoryRevision} + 1` })
			.where(eq(users.id, userId));
		await tx.delete(memories).where(and(eq(memories.userId, userId), match));
	});
}

export const deleteMemory = (userId: string, id: number) =>
	forgetMemories(userId, eq(memories.id, id));

export const clearMemories = (userId: string) => forgetMemories(userId);
