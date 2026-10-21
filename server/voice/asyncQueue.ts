export function createAsyncQueue<T>() {
	const items: T[] = [];
	let wake: (() => void) | null = null;
	let ended = false;
	return {
		push(item: T) {
			items.push(item);
			wake?.();
		},
		end() {
			ended = true;
			wake?.();
		},
		async *[Symbol.asyncIterator](): AsyncGenerator<T> {
			while (true) {
				const next = items.shift();
				if (next !== undefined) {
					yield next;
					continue;
				}
				if (ended) return;
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
				wake = null;
			}
		},
	};
}
