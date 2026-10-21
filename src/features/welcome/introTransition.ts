export const INTRO_EXIT_MS = 1600;
const REDUCED_EXIT_MS = 120;
const SCREEN_EXIT_MS = 520;
const VEIL_EXIT_MS = 1100;
const EXIT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export async function exitIntro(element: HTMLElement, signal: AbortSignal) {
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	const animations = element.getAnimations({ subtree: true });
	const stop = () => {
		for (const animation of animations) animation.cancel();
	};
	const finish = () => {
		if (reduced.matches) for (const animation of animations) animation.finish();
	};
	signal.addEventListener("abort", stop, { once: true });
	reduced.addEventListener("change", finish);
	try {
		signal.throwIfAborted();
		for (const [selector, duration, transform] of [
			[".intro-screen", SCREEN_EXIT_MS, "translateY(-3vh) scale(1.04)"],
			[".intro-veil", VEIL_EXIT_MS, "none"],
		] as const) {
			const part = element.querySelector<HTMLElement>(selector);
			if (!part) continue;
			animations.push(
				part.animate(
					[
						{ opacity: 1, transform: "none" },
						{ opacity: 0, transform: reduced.matches ? "none" : transform },
					],
					{
						duration: reduced.matches ? REDUCED_EXIT_MS : duration,
						fill: "forwards",
						easing: EXIT_EASING,
					},
				),
			);
		}
		await Promise.all(animations.map((animation) => animation.finished));
		signal.throwIfAborted();
		element.style.visibility = "hidden";
		return true;
	} catch (error) {
		if (signal.aborted) return false;
		throw error;
	} finally {
		signal.removeEventListener("abort", stop);
		reduced.removeEventListener("change", finish);
		stop();
	}
}
