import { PHASES, type Phase } from "@/features/sky/skyPhase";
import { drawCamp } from "./drawCamp";
import { drawSky, type Trail } from "./drawSky";
import { PALETTES, skyBands } from "./palettes";

export type Scene = ReturnType<typeof createScene>;

const PIXEL_SIZE = 3;
const MOBILE_MAX_WIDTH = 700;
const MAX_DRIFT = 2;
const DRIFT_EASE_MS = 120;
const MAX_FRAME_MS = 50;
const TRAIL_MS = 780;
const FIRST_FRAME_MS = 1000 / 60;
const DRIFT_SNAP = 0.001;
const POINTER_DRIFT_SCALE = 4;

const BANDS = Object.fromEntries(
	PHASES.map((phase) => [phase, skyBands(PALETTES[phase])]),
) as Record<Phase, string[]>;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const driftAt = (position: number, size: number) =>
	clamp((position / size - 0.5) * POINTER_DRIFT_SCALE, -MAX_DRIFT, MAX_DRIFT);

export function createScene(
	canvas: HTMLCanvasElement,
	foreground: HTMLElement,
) {
	const ctx = canvas.getContext("2d");
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	let phase: Phase = "night";
	let level = 0;
	let frame = 0;
	let previous: number | null = null;
	let pointerX = 0;
	let pointerY = 0;
	let driftX = 0;
	let driftY = 0;
	let scaleX = 1;
	let scaleY = 1;
	let trail: { x: number; y: number; started: number } | null = null;

	function currentTrail(time: number): Trail | null {
		if (!trail) return null;
		const progress = Math.max(0, (time - trail.started) / TRAIL_MS);
		if (progress > 1 || reduced.matches) {
			trail = null;
			return null;
		}
		return { x: trail.x, y: trail.y, progress };
	}

	function draw(time = previous ?? 0) {
		if (!ctx) return;
		const w = canvas.width;
		const h = canvas.height;
		const scene = {
			ctx,
			w,
			h,
			p: PALETTES[phase],
			phase,
			time,
			still: reduced.matches,
			level,
			driftX,
			driftY,
			mobile: innerWidth <= MOBILE_MAX_WIDTH,
		};
		drawSky(scene, BANDS[phase], currentTrail(time));
		foreground.style.transform = `translate(${driftX * scaleX}px, ${driftY * scaleY}px)`;
		drawCamp(scene);
	}

	function resize() {
		canvas.width = Math.ceil(innerWidth / PIXEL_SIZE);
		canvas.height = Math.ceil(canvas.clientHeight / PIXEL_SIZE);
		scaleX = canvas.clientWidth / canvas.width;
		scaleY = canvas.clientHeight / canvas.height;
		draw();
	}

	function animate(time: number) {
		const elapsed =
			previous === null
				? FIRST_FRAME_MS
				: clamp(time - previous, 0, MAX_FRAME_MS);
		const blend = 1 - Math.exp(-elapsed / DRIFT_EASE_MS);
		driftX += (pointerX - driftX) * blend;
		driftY += (pointerY - driftY) * blend;
		if (Math.abs(pointerX - driftX) < DRIFT_SNAP) driftX = pointerX;
		if (Math.abs(pointerY - driftY) < DRIFT_SNAP) driftY = pointerY;
		previous = time;
		draw(time);
		frame = requestAnimationFrame(animate);
	}

	function resetPointer() {
		pointerX = 0;
		pointerY = 0;
	}

	function motion() {
		cancelAnimationFrame(frame);
		previous = null;
		if (!reduced.matches) {
			frame = requestAnimationFrame(animate);
			return;
		}
		resetPointer();
		trail = null;
		driftX = 0;
		driftY = 0;
		draw();
	}

	const onPointerMove = (event: PointerEvent) => {
		if (event.pointerType !== "mouse" || reduced.matches) {
			resetPointer();
			return;
		}
		pointerX = driftAt(event.clientX, innerWidth);
		pointerY = driftAt(event.clientY, innerHeight);
	};
	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType !== "mouse") resetPointer();
	};
	const onPointerOut = (event: PointerEvent) => {
		if (!event.relatedTarget) resetPointer();
	};

	addEventListener("pointermove", onPointerMove);
	addEventListener("pointerdown", onPointerDown);
	addEventListener("pointerout", onPointerOut);
	addEventListener("blur", resetPointer);
	addEventListener("resize", resize);
	reduced.addEventListener("change", motion);
	resize();
	motion();

	return {
		setPhase(value: Phase) {
			const next = PHASES.includes(value) ? value : "night";
			if (next !== phase) trail = null;
			phase = next;
			draw();
		},
		formMemory({ x, y }: { x: number; y: number }) {
			if (reduced.matches || !Number.isFinite(x) || !Number.isFinite(y)) return;
			trail = {
				x: clamp(x, 0, 100) / 100,
				y: clamp(y, 0, 100) / 100,
				started: previous ?? performance.now(),
			};
		},
		setLevel(value: number) {
			level = clamp(value, 0, 1);
			if (reduced.matches) draw();
		},
		destroy() {
			cancelAnimationFrame(frame);
			removeEventListener("pointermove", onPointerMove);
			removeEventListener("pointerdown", onPointerDown);
			removeEventListener("pointerout", onPointerOut);
			removeEventListener("blur", resetPointer);
			removeEventListener("resize", resize);
			reduced.removeEventListener("change", motion);
		},
	};
}
