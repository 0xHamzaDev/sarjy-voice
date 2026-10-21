import { afterEach, expect, test, vi } from "vitest";
import { exitIntro } from "@/features/welcome/introTransition";

function intro(reduced = false) {
	const motion = {
		matches: reduced,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	};
	vi.stubGlobal("matchMedia", () => motion);
	const style = { visibility: "visible" };
	const visibilityOnCancel: string[] = [];
	const makeAnimation = () => {
		let finish!: () => void;
		let reject!: (error: Error) => void;
		const finished = new Promise<void>((resolve, fail) => {
			finish = resolve;
			reject = fail;
		});
		return {
			finish,
			finished,
			cancel: vi.fn(() => {
				visibilityOnCancel.push(style.visibility);
				reject(new DOMException("Cancelled", "AbortError"));
			}),
		};
	};
	const flight = makeAnimation();
	const animations = [flight];
	const animate = vi.fn(() => {
		const animation = makeAnimation();
		animations.push(animation);
		return animation;
	});
	const element = {
		style,
		getAnimations: () => [flight],
		querySelector: () => ({ animate }),
	} as unknown as HTMLElement;
	return { element, animations, animate, visibilityOnCancel, motion };
}

afterEach(() => vi.unstubAllGlobals());

test.each([
	0, 2,
])("waits for animation %i, then hides before cancelling", async (last) => {
	const { element, animations, visibilityOnCancel } = intro();
	const finished = vi.fn();
	const result = exitIntro(element, new AbortController().signal);
	void result.then(finished);
	for (const [index, animation] of animations.entries()) {
		if (index !== last) animation.finish();
	}
	await Promise.resolve();
	await Promise.resolve();
	expect(finished).not.toHaveBeenCalled();
	expect(element.style.visibility).toBe("visible");
	animations[last]?.finish();
	expect(await result).toBe(true);
	expect(element.style.visibility).toBe("hidden");
	expect(visibilityOnCancel).toEqual(["hidden", "hidden", "hidden"]);
});

test("aborting cancels the exit without hiding the overlay", async () => {
	const { element, animations, visibilityOnCancel, motion } = intro();
	const controller = new AbortController();
	const result = exitIntro(element, controller.signal);
	controller.abort();
	expect(await result).toBe(false);
	expect(element.style.visibility).toBe("visible");
	expect(
		animations.every((animation) => animation.cancel.mock.calls.length > 0),
	).toBe(true);
	expect(
		visibilityOnCancel.every((visibility) => visibility === "visible"),
	).toBe(true);
	expect(motion.removeEventListener).toHaveBeenCalledWith(
		"change",
		motion.addEventListener.mock.calls[0]?.[1],
	);
});

test("reduced motion uses short fades without translation", async () => {
	const { element, animations, animate } = intro(true);
	const result = exitIntro(element, new AbortController().signal);
	expect(animate).toHaveBeenCalledTimes(2);
	for (const call of animate.mock.calls) {
		expect(call).toEqual([
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "none" },
			],
			{
				duration: 120,
				fill: "forwards",
				easing: expect.any(String),
			},
		]);
	}
	for (const animation of animations) animation.finish();
	expect(await result).toBe(true);
});
