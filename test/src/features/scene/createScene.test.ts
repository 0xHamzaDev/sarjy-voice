import { afterEach, expect, test, vi } from "vitest";
import { createScene } from "@/features/scene/createScene";
import type { Phase } from "@/features/sky/skyPhase";

afterEach(() => {
	vi.unstubAllGlobals();
});

type Listener = (event: Partial<PointerEvent>) => void;

test("desert renders every palette and respects motion and pointer preferences", () => {
	const events: Record<string, Listener> = {};
	const translations: number[][] = [];
	const trailHeads: number[][] = [];
	const flames: number[][] = [];
	let scheduled = 0;
	let cancelled = 0;
	let painted = 0;
	let motionChanged = () => {};
	let nextFrame: ((time: number) => void) | null = null;
	let time = 0;
	const reduced = {
		matches: true,
		addEventListener: (_: string, callback: () => void) => {
			motionChanged = callback;
		},
	};
	vi.stubGlobal("innerWidth", 1440);
	vi.stubGlobal("innerHeight", 900);
	vi.stubGlobal("matchMedia", () => reduced);
	vi.stubGlobal("addEventListener", (name: string, callback: Listener) => {
		events[name] = callback;
	});
	vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
		nextFrame = callback;
		return ++scheduled;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {
		cancelled++;
		nextFrame = null;
	});
	const target: Record<string, unknown> = {};
	const context = new Proxy(target, {
		get: (_, key: string) =>
			target[key] ??
			((...values: number[]) => {
				expect(values.every(Number.isFinite)).toBe(true);
				if (key === "translate") translations.push(values);
				if (key === "fillRect") {
					painted++;
					if (target.fillStyle === "#f3d292") flames.push(values);
					if (
						target.fillStyle === "#ecce99" &&
						values[2] === 2 &&
						values[3] === 1
					)
						trailHeads.push(values.slice(0, 2));
				}
			}),
	});
	const canvas = {
		width: 0,
		height: 0,
		clientWidth: 1440,
		clientHeight: 900,
		getContext: () => context,
	};
	const foreground = { style: { transform: "" } };
	const scene = createScene(
		canvas as unknown as HTMLCanvasElement,
		foreground as unknown as HTMLElement,
	);
	for (const phase of ["night", "fajr", "day", "maghrib", "invalid"])
		scene.setPhase(phase as Phase);
	scene.setLevel(1);
	expect(painted).toBeGreaterThan(0);
	expect(scheduled).toBe(0);
	const restingFire = flames.slice(-7);
	expect((restingFire.at(-1)?.[0] ?? 0) + 3).toBe(
		Math.round(canvas.width * 0.7),
	);
	expect((restingFire.at(-1)?.[1] ?? 0) + 1).toBe(
		Math.round(canvas.height * 0.76) - 1,
	);
	const lastTranslation = () => translations.at(-1) ?? [];
	const tick = (count = 1, elapsed = 1000 / 60) => {
		for (let frame = 0; frame < count; frame++) {
			time += elapsed;
			expect(typeof nextFrame).toBe("function");
			nextFrame?.(time);
			const [x = 0, y = 0] = lastTranslation();
			expect(Math.abs(x) <= 2 && Math.abs(y) <= 2).toBe(true);
			expect(foreground.style.transform).toBe(
				`translate(${x * (canvas.clientWidth / canvas.width)}px, ${y * (canvas.clientHeight / canvas.height)}px)`,
			);
		}
	};
	const pointer = (name: string, event: Partial<PointerEvent>) =>
		events[name]?.(event);
	reduced.matches = false;
	motionChanged();
	expect(scheduled).toBe(1);
	pointer("pointermove", {
		pointerType: "mouse",
		clientX: 2000,
		clientY: -200,
	});
	tick();
	const first = lastTranslation()[0] ?? 0;
	expect(first > 0 && first < 1).toBe(true);
	expect(Number.isInteger(first)).toBe(false);
	tick(1, 60000);
	expect((lastTranslation()[0] ?? 0) - first).toBeLessThan(1);
	tick(30, 50);
	expect(lastTranslation()).toEqual([2, -2]);
	expect(flames.slice(-7)).not.toEqual(restingFire);
	pointer("pointerdown", { pointerType: "touch", clientX: 1440, clientY: 900 });
	tick();
	expect(lastTranslation()[0]).toBeLessThan(2);
	tick(30, 50);
	expect(lastTranslation()).toEqual([0, 0]);
	pointer("pointermove", { pointerType: "mouse", clientX: 1440, clientY: 900 });
	tick(30, 50);
	pointer("pointerout", { relatedTarget: {} as EventTarget });
	tick();
	expect(lastTranslation()).toEqual([2, 2]);
	pointer("pointerout", { relatedTarget: null });
	tick(30, 50);
	expect(lastTranslation()).toEqual([0, 0]);
	pointer("pointermove", { pointerType: "mouse", clientX: 1440, clientY: 900 });
	tick();
	pointer("blur", {});
	tick(30, 50);
	expect(lastTranslation()).toEqual([0, 0]);
	pointer("pointermove", { pointerType: "mouse", clientX: 1440, clientY: 900 });
	tick();
	const beforeReduction = scheduled;
	reduced.matches = true;
	motionChanged();
	expect(cancelled).toBeGreaterThan(0);
	expect(scheduled).toBe(beforeReduction);
	expect(nextFrame).toBeNull();
	expect(lastTranslation()).toEqual([0, 0]);
	expect(foreground.style.transform).toBe("translate(0px, 0px)");
	pointer("pointermove", { pointerType: "mouse", clientX: 1440, clientY: 900 });
	scene.setPhase("night");
	expect(lastTranslation()).toEqual([0, 0]);
	vi.stubGlobal("innerWidth", 390);
	canvas.clientHeight = 844;
	canvas.clientWidth = 390;
	pointer("resize", {});
	expect(canvas.width).toBe(130);
	expect(canvas.height).toBe(282);
	expect((flames.at(-1)?.[0] ?? 0) + 3).toBe(Math.round(canvas.width * 0.7));
	expect((flames.at(-1)?.[1] ?? 0) + 1).toBe(
		Math.round(canvas.height * 0.72) - 1,
	);
	reduced.matches = false;
	motionChanged();
	pointer("pointermove", { pointerType: "mouse", clientX: 390, clientY: 0 });
	tick(30, 50);
	expect(foreground.style.transform).toBe(
		`translate(6px, ${-2 * (844 / 282)}px)`,
	);
	scene.setPhase("night");
	const initialHeads = trailHeads.length;
	scene.formMemory({ x: Number.NaN, y: 20 });
	tick();
	expect(trailHeads.length).toBe(initialHeads);
	scene.formMemory({ x: 25, y: 20 });
	tick(1, 390);
	expect(trailHeads.at(-1)).toEqual([
		Math.round(canvas.width * 0.35),
		Math.round(canvas.height * 0.14),
	]);
	tick(1, 390);
	expect(trailHeads.at(-1)).toEqual([
		Math.round(canvas.width * 0.25),
		Math.round(canvas.height * 0.2),
	]);
	const arrivedHeads = trailHeads.length;
	tick(1, 1);
	expect(trailHeads.length).toBe(arrivedHeads);
	scene.formMemory({ x: 120, y: -10 });
	tick(1, 780);
	expect(trailHeads.at(-1)).toEqual([canvas.width, 0]);
	scene.formMemory({ x: 25, y: 20 });
	scene.setPhase("fajr");
	scene.setPhase("night");
	const cancelledHeads = trailHeads.length;
	tick(1, 390);
	expect(trailHeads.length).toBe(cancelledHeads);
	reduced.matches = true;
	motionChanged();
	scene.formMemory({ x: 25, y: 20 });
	scene.setPhase("night");
	expect(nextFrame).toBeNull();
	expect(trailHeads.length).toBe(cancelledHeads);
	const reducedFire = flames.slice(-7);
	scene.setLevel(0.5);
	scene.setPhase("day");
	expect(flames.slice(-7)).toEqual(reducedFire);
});
