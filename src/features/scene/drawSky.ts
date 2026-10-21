import type { Frame } from "./palettes";

export type Trail = { x: number; y: number; progress: number };

const STAR_COUNT = 148;
const STARDUST_COUNT = 86;
const TRAIL_LENGTH = 10;

const MOON = [
	"001111100",
	"011111110",
	"111111111",
	"111111111",
	"111111111",
	"011111110",
	"001111100",
].flatMap((row, y) =>
	[...row].flatMap((cell, x) => (cell === "1" ? [[x, y] as const] : [])),
);

const RIDGES = [
	[0.487, 0.468, 0.447, 0.459, 0.482, 0.493, 0.478, 0.463, 0.478],
	[0.544, 0.532, 0.506, 0.522, 0.554, 0.565, 0.54, 0.511, 0.529],
	[0.584, 0.598, 0.611, 0.598, 0.571, 0.548, 0.555, 0.579, 0.593],
];

const STARS = Array.from({ length: STAR_COUNT }, (_, i) => {
	const x = ((i * 137 + 31) % 997) / 997;
	const y = 0.025 + ((i * 71 + 17) % 463) / 1000;
	return {
		x,
		y,
		size: i % 43 === 0 ? 2 : 1,
		brightness:
			(0.18 + ((i * 31) % 47) / 100) *
			(x > 0.32 && x < 0.68 && y > 0.18 ? 0.36 : 1),
		speed: 1800 + ((i * 53) % 1700),
	};
});

const STARDUST = Array.from({ length: STARDUST_COUNT }, (_, i) => {
	const x = ((i * 149 + 19) % 997) / 997;
	return { x, y: 0.105 + x * 0.27 + (((i * 47) % 101) / 100 - 0.5) * 0.11 };
});

export function drawSky(frame: Frame, bands: string[], trail: Trail | null) {
	const { ctx, w, h, p, phase, time, still } = frame;
	ctx.fillStyle = p.sky[0];
	ctx.fillRect(0, 0, w, h);
	bands.forEach((band, index) => {
		ctx.fillStyle = band;
		const y = Math.floor(h * (0.18 + ((index + 1) / bands.length) * 0.32));
		ctx.fillRect(0, y, w, h - y);
	});
	ctx.fillStyle = p.star;
	for (const point of STARDUST) {
		ctx.globalAlpha =
			(phase === "day" ? 0.012 : 0.1) *
			(point.x > 0.32 && point.x < 0.68 ? 0.3 : 1);
		ctx.fillRect(Math.floor(point.x * w), Math.floor(point.y * h), 1, 1);
	}
	STARS.forEach((star, i) => {
		const x = Math.floor(star.x * w);
		const y = Math.floor(star.y * h);
		const twinkle = still
			? 0.85
			: 0.76 + Math.sin(time / star.speed + i * 2.39) * 0.24;
		ctx.globalAlpha = star.brightness * twinkle * (phase === "day" ? 0.1 : 1);
		ctx.fillRect(x, y, star.size, 1);
		if (star.size === 2) {
			ctx.globalAlpha *= 0.35;
			ctx.fillRect(x, y - 1, 1, 3);
			ctx.fillRect(x - 1, y, 3, 1);
		}
	});
	if (trail) drawTrail(frame, trail);
	ctx.globalAlpha = 1;
	drawMoon(frame);
	drawDunes(frame);
}

function drawTrail({ ctx, w, h, p, phase }: Frame, trail: Trail) {
	const startX = trail.x < 0.5 ? trail.x + 0.2 : trail.x - 0.2;
	const startY = Math.max(0.01, trail.y - 0.12);
	ctx.fillStyle = p.moon;
	for (let tail = TRAIL_LENGTH; tail >= 0; tail--) {
		const travel = Math.max(0, trail.progress - tail * 0.018);
		ctx.globalAlpha =
			(1 - tail / (TRAIL_LENGTH + 1)) *
			Math.min(1, trail.progress * 8) *
			(phase === "day" ? 0.5 : 0.9);
		ctx.fillRect(
			Math.round((startX + (trail.x - startX) * travel) * w),
			Math.round((startY + (trail.y - startY) * travel) * h),
			tail === 0 ? 2 : 1,
			1,
		);
	}
}

function drawMoon({ ctx, w, h, p, phase }: Frame) {
	const mx = Math.floor(w * 0.79);
	const my = Math.floor(h * 0.18);
	ctx.fillStyle = p.moon;
	for (const [x, y] of MOON) ctx.fillRect(mx + x * 2, my + y * 2, 2, 2);
	if (phase !== "day" && phase !== "maghrib") {
		ctx.fillStyle = p.sky[0];
		ctx.fillRect(mx + 7, my - 1, 12, 10);
		ctx.fillRect(mx + 10, my + 9, 8, 2);
	}
}

function drawDunes({ ctx, w, h, p, level, driftX, driftY }: Frame) {
	RIDGES.forEach((ridge, layer) => {
		const shiftX = driftX * (layer + 1) * 0.2;
		const shiftY = driftY * (layer + 1) * 0.1;
		const heightAt = (x: number) => {
			const position = Math.max(0, Math.min(7.999, ((x - shiftX) / w) * 8));
			const segment = Math.floor(position);
			const fraction = position - segment;
			const eased = fraction * fraction * (3 - 2 * fraction);
			const from = ridge[segment] ?? 0;
			const to = ridge[segment + 1] ?? from;
			return Math.round((from + (to - from) * eased) * h + shiftY);
		};
		const heights = Array.from({ length: w + 2 }, (_, x) => heightAt(x));
		ctx.fillStyle = p.dunes[layer === 2 ? 3 : layer] ?? p.dunes[0];
		ctx.beginPath();
		ctx.moveTo(0, h);
		for (const [x, y] of heights.entries()) ctx.lineTo(x, y);
		ctx.lineTo(w, h);
		ctx.fill();
		ctx.fillStyle = p.edge;
		ctx.globalAlpha = (layer === 2 ? 0.16 : 0.32) + level * 0.15;
		for (let x = 0; x < w; x++) {
			const y = heights[x] ?? h;
			if ((heights[x + 2] ?? h) < y || (layer === 0 && x % 5 < 3))
				ctx.fillRect(x, y, 1, 1);
		}
		ctx.globalAlpha = 1;
	});
}
