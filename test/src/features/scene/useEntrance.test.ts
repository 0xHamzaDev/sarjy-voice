import { afterEach, expect, test, vi } from "vitest";
import { animateEntrance } from "@/features/scene/useEntrance";

function scene() {
	vi.stubGlobal("getComputedStyle", () => ({ transform: "none" }));
	const animations: {
		finish: () => void;
		finished: Promise<void>;
		cancel: ReturnType<typeof vi.fn>;
	}[] = [];
	const animate = vi.fn(() => {
		let finish!: () => void;
		let reject!: (error: Error) => void;
		const finished = new Promise<void>((resolve, fail) => {
			finish = resolve;
			reject = fail;
		});
		const animation = {
			finish,
			finished,
			commitStyles: vi.fn(),
			cancel: vi.fn(() => reject(new DOMException("Cancelled", "AbortError"))),
		};
		animations.push(animation);
		return animation;
	});
	return {
		element: { animate } as unknown as HTMLElement,
		animations,
		animate,
	};
}

afterEach(() => vi.unstubAllGlobals());

test("waits for the walk and the sit before releasing the call", async () => {
	const { element, animations } = scene();
	const onSit = vi.fn();
	const finished = vi.fn();
	const result = animateEntrance(element, new AbortController().signal, onSit);
	void result.then(finished);
	expect(onSit).not.toHaveBeenCalled();
	for (const animation of animations) animation.finish();
	await Promise.resolve();
	await Promise.resolve();
	expect(onSit).toHaveBeenCalledOnce();
	expect(finished).not.toHaveBeenCalled();
	animations[2]?.finish();
	expect(await result).toBe(true);
	expect(
		animations.every((animation) => animation.cancel.mock.calls.length === 1),
	).toBe(true);
});

test.each([
	"walking",
	"sitting",
])("cancelling while %s never releases the call", async (stage) => {
	const { element, animations } = scene();
	const controller = new AbortController();
	const onSit = vi.fn();
	const result = animateEntrance(element, controller.signal, onSit);
	if (stage === "sitting") {
		for (const animation of animations) animation.finish();
		await Promise.resolve();
		await Promise.resolve();
	}
	controller.abort();
	expect(await result).toBe(false);
	if (stage === "walking") expect(onSit).not.toHaveBeenCalled();
});
