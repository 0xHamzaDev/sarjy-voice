import { createAsyncQueue } from "@server/voice/asyncQueue";
import { expect, test } from "vitest";

test("delivers items pushed before and after the consumer starts, then ends", async () => {
	const queue = createAsyncQueue<string>();
	queue.push("a");
	const consumed = (async () => {
		const items: string[] = [];
		for await (const item of queue) items.push(item);
		return items;
	})();
	await Promise.resolve();
	queue.push("b");
	queue.push("c");
	queue.end();
	expect(await consumed).toEqual(["a", "b", "c"]);
});

test("an ended empty queue finishes immediately", async () => {
	const queue = createAsyncQueue<number>();
	queue.end();
	const items: number[] = [];
	for await (const item of queue) items.push(item);
	expect(items).toEqual([]);
});
