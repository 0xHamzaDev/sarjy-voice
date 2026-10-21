import { createHash, randomUUID } from "node:crypto";
import { EMBEDDING_DIMENSIONS, MEMORY_PROMPT_MAX } from "@server/config";
import { db } from "@server/db/client";
import { memories, users } from "@server/db/schema";
import {
	clearMemories,
	deleteMemory,
	listMemories,
	memoriesForPrompt,
	readMemorySnapshot,
	recentMemories,
	saveMemory,
} from "@server/memory/memoryStore";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";

const created: string[] = [];
const signal = new AbortController().signal;
const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1);
const slotOf = (text: string) =>
	createHash("sha256").update(text).digest().readUInt16BE(0) %
	EMBEDDING_DIMENSIONS;
const embeddingOf = (text: string) =>
	Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
		index === slotOf(text) ? 1 : 0,
	);
const response = (text: string) =>
	Response.json({ embedding: { values: embeddingOf(text) } });
const textOf = (init?: RequestInit) =>
	z
		.object({
			content: z.object({ parts: z.tuple([z.object({ text: z.string() })]) }),
		})
		.parse(JSON.parse(String(init?.body))).content.parts[0].text;
const embedText = async (_url: unknown, init?: RequestInit) =>
	response(textOf(init));
const embed = vi.fn(embedText);

async function createUser() {
	const id = randomUUID();
	await db.insert(users).values({ id, name: id });
	created.push(id);
	return id;
}

function delayEmbedding() {
	let resolve!: (response: Response) => void;
	embed.mockReturnValueOnce(
		new Promise<Response>((done) => {
			resolve = done;
		}),
	);
	return () => resolve(response("Likes tea"));
}

beforeEach(() => {
	embed.mockReset();
	embed.mockImplementation(embedText);
	vi.stubGlobal("fetch", embed);
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
	if (created.length) await db.delete(users).where(inArray(users.id, created));
	await db.$client.end();
});

test("clearing rejects an earlier embedding without waiting for the network", async () => {
	const userId = await createUser();
	const snapshot = await readMemorySnapshot(userId);
	const release = delayEmbedding();
	const saving = saveMemory(userId, "Likes tea", signal, snapshot.revision);
	expect(embed).toHaveBeenCalledOnce();
	await clearMemories(userId);
	release();
	expect(await saving).toBeNull();
	expect(await readMemorySnapshot(userId)).toEqual({
		revision: snapshot.revision + 1,
		memories: [],
	});
});

test("deleting one fact rejects stale extracted facts and preserves other facts", async () => {
	const userId = await createUser();
	const forgotten = await saveMemory(userId, "Likes tea", signal, 0);
	const retained = await saveMemory(userId, "Lives in Jeddah", signal, 0);
	expect(forgotten).not.toBeNull();
	if (!forgotten) throw new Error("expected saved memory");
	await deleteMemory(userId, forgotten.id);
	expect(await saveMemory(userId, "Likes tea", signal, 0)).toBeNull();
	expect(await readMemorySnapshot(userId)).toEqual({
		revision: 1,
		memories: [retained],
	});
	expect(await saveMemory(userId, "Likes coffee", signal, 1)).not.toBeNull();
});

test("concurrent save and clear leave no fact from the earlier revision", async () => {
	const userId = await createUser();
	await Promise.all([
		saveMemory(userId, "Likes tea", signal, 0),
		clearMemories(userId),
	]);
	expect(await readMemorySnapshot(userId)).toEqual({
		revision: 1,
		memories: [],
	});
});

test("concurrent case and whitespace duplicates return one stored fact", async () => {
	const userId = await createUser();
	const saved = await Promise.all(
		["Likes tea", "  likes tea  ", "LIKES TEA"].map((content) =>
			saveMemory(userId, content, signal, 0),
		),
	);
	expect(new Set(saved.map((memory) => memory?.id)).size).toBe(1);
	expect(await listMemories(userId)).toHaveLength(1);
});

test("a near-identical embedding returns the stored fact instead of a second one", async () => {
	const userId = await createUser();
	const original = await saveMemory(userId, "Likes mint tea", signal, 0);
	embed.mockImplementationOnce(async () => response("Likes mint tea"));
	const rephrased = await saveMemory(userId, "Enjoys tea with mint", signal, 0);
	expect(rephrased).toEqual(original);
	expect(await saveMemory(userId, "Lives in Jeddah", signal, 0)).not.toEqual(
		original,
	);
	expect(await listMemories(userId)).toHaveLength(2);
});

test("deduplication and deletion stay isolated to their user", async () => {
	const first = await createUser();
	const second = await createUser();
	const firstMemory = await saveMemory(first, "Likes tea", signal, 0);
	const secondMemory = await saveMemory(second, "Likes tea", signal, 0);
	expect(firstMemory?.id).not.toBe(secondMemory?.id);
	if (!firstMemory) throw new Error("expected saved memory");
	await deleteMemory(second, firstMemory.id);
	expect(await listMemories(first)).toEqual([firstMemory]);
	expect(await listMemories(second)).toEqual([secondMemory]);
	await clearMemories(first);
	expect(await listMemories(second)).toEqual([secondMemory]);
	expect(await saveMemory(second, "Likes coffee", signal, 1)).not.toBeNull();
});

test("recent memories are newest first and retain the overflow sentinel", async () => {
	const userId = await createUser();
	const count = MEMORY_PROMPT_MAX + 3;
	await db.insert(memories).values(
		Array.from({ length: count }, (_, index) => ({
			userId,
			content: `Fact ${index}`,
			lang: "en" as const,
			embedding,
			createdAt: new Date(index),
		})),
	);
	const recent = await recentMemories(userId);
	expect(recent.map((memory) => memory.content)).toEqual(
		Array.from(
			{ length: MEMORY_PROMPT_MAX + 1 },
			(_, index) => `Fact ${count - index - 1}`,
		),
	);
});

test("cancelling a delayed embedding prevents its insert", async () => {
	const userId = await createUser();
	const controller = new AbortController();
	const release = delayEmbedding();
	const saving = saveMemory(userId, "Likes tea", controller.signal, 0);
	controller.abort();
	const rejected = expect(saving).rejects.toHaveProperty("name", "AbortError");
	release();
	await rejected;
	expect(await listMemories(userId)).toEqual([]);
});

test("past the prompt limit, the most similar facts join the newest ones", async () => {
	const userId = await createUser();
	const count = MEMORY_PROMPT_MAX + 3;
	await db.insert(memories).values(
		Array.from({ length: count }, (_, index) => ({
			userId,
			content: `Fact ${index}`,
			lang: "en" as const,
			embedding: embeddingOf(`Fact ${index}`),
			createdAt: new Date(index),
		})),
	);
	const prompt = await memoriesForPrompt(
		userId,
		"Fact 0",
		signal,
		recentMemories(userId),
	);
	const contents = prompt.map((memory) => memory.content);
	expect(contents).toHaveLength(MEMORY_PROMPT_MAX);
	expect(contents[0]).toBe("Fact 0");
	expect(contents).toContain(`Fact ${count - 1}`);
	expect(new Set(contents).size).toBe(contents.length);
});
