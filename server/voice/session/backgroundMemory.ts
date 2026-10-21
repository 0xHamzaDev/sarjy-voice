import { MEMORY_BACKGROUND_TIMEOUT_MS } from "@server/config";
import { extractMemories } from "@server/memory/extractMemories";
import { type MemorySnapshot, saveMemory } from "@server/memory/memoryStore";
import type { ServerMessage } from "@shared/protocol";

export async function extractAndSaveMemories(
	userId: string,
	utterance: string,
	snapshot: MemorySnapshot,
	sendJson: (message: ServerMessage) => void,
): Promise<void> {
	const signal = AbortSignal.timeout(MEMORY_BACKGROUND_TIMEOUT_MS);
	try {
		const facts = await extractMemories(
			utterance,
			snapshot.memories.map((memory) => memory.content),
			signal,
		);
		for (const fact of facts) {
			const memory = await saveMemory(userId, fact, signal, snapshot.revision);
			if (memory) sendJson({ type: "memory", memory });
		}
	} catch (error) {
		console.error("memory extraction failed", error);
		sendJson({ type: "error", code: "memory_failed" });
	}
}
