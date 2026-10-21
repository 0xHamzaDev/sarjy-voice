import { drawRug } from "./drawRug";
import type { Frame } from "./palettes";

const FIRE_RED = "#c56a42";
const FIRE_ORANGE = "#e9a45c";
const FIRE_CORE = "#f3d292";

export function drawCamp(frame: Frame) {
	const { ctx, driftX, driftY } = frame;
	ctx.save();
	ctx.translate(driftX, driftY);
	drawSand(frame);
	drawRug(frame);
	drawRocks(frame);
	drawFire(frame);
	ctx.restore();
}

function drawSand({ ctx, w, h, p }: Frame) {
	ctx.fillStyle = p.edge;
	for (let row = 0; row < 18; row++) {
		const depth = row / 17;
		const y = h * (0.61 + depth * depth * 0.42);
		ctx.globalAlpha = 0.05 + depth * 0.08;
		for (let x = -20; x < w; x += 5 + depth * 24) {
			const bend = Math.sin(x * 0.024 + row * 0.9) * depth * 2;
			ctx.fillRect(
				Math.round(x + row * 13),
				Math.round(y + bend),
				Math.round(1 + depth * 13),
				1,
			);
		}
	}
	for (let step = 0; step < 20; step++) {
		const depth = step / 19;
		const x =
			w * (0.54 + depth * depth * 0.4) +
			(step % 2 ? 1 : -1) * (0.5 + depth * 4);
		const y = h * (0.61 + depth * depth * 0.41);
		const size = 1 + Math.floor(depth * 2);
		ctx.globalAlpha = 0.14 + depth * 0.2;
		ctx.fillStyle = p.sky[0];
		ctx.fillRect(Math.round(x), Math.round(y), size, size + 1);
		ctx.fillStyle = p.edge;
		ctx.globalAlpha = 0.15;
		ctx.fillRect(Math.round(x), Math.round(y) + size + 1, size, 1);
	}
}

function drawRocks({ ctx, w, h, p }: Frame) {
	for (const [x, y, size] of [
		[0.04, 0.88, 7],
		[0.92, 0.85, 5],
		[0.98, 0.96, 10],
	] as const) {
		const left = Math.round(w * x);
		const top = Math.round(h * y);
		ctx.fillStyle = p.dunes[4];
		ctx.fillRect(left - 2, top + 2, size + 5, 2);
		ctx.fillStyle = p.dunes[2];
		ctx.beginPath();
		ctx.moveTo(left, top);
		ctx.lineTo(left + 2, top - size * 0.4);
		ctx.lineTo(left + size - 2, top - size * 0.5);
		ctx.lineTo(left + size, top + 2);
		ctx.lineTo(left - 1, top + 2);
		ctx.fill();
		ctx.fillStyle = p.edge;
		ctx.globalAlpha = 0.3;
		ctx.fillRect(left + 2, Math.round(top - size * 0.4), size - 3, 1);
		ctx.globalAlpha = 1;
	}
	ctx.fillStyle = p.edge;
	ctx.globalAlpha = 0.35;
	for (const [x, y] of [
		[0.11, 0.72],
		[0.87, 0.67],
		[0.94, 0.91],
	] as const) {
		const left = Math.round(w * x);
		const top = Math.round(h * y);
		ctx.fillRect(left, top - 4, 1, 5);
		ctx.fillRect(left - 2, top - 2, 1, 3);
		ctx.fillRect(left + 2, top - 3, 1, 4);
	}
}

function drawFire({ ctx, w, h, phase, time, still, mobile }: Frame) {
	const camp = {
		x: Math.round(w * 0.7),
		y: Math.round(h * (mobile ? 0.72 : 0.76)),
	};
	const fireTime = still ? 0 : time;
	ctx.fillStyle = FIRE_ORANGE;
	for (let pool = 3; pool > 0; pool--) {
		ctx.globalAlpha =
			(phase === "day" ? 0.025 : 0.07) +
			(still ? 0 : Math.sin(fireTime / 270) * 0.007);
		for (let row = -pool * 2; row <= pool * 2; row++) {
			const width = Math.round(
				Math.sqrt(1 - (row / (pool * 2 + 1)) ** 2) * pool * 9,
			);
			ctx.fillRect(camp.x - width, camp.y + row, width * 2, 1);
		}
	}
	ctx.globalAlpha = 1;
	ctx.fillStyle = FIRE_RED;
	ctx.fillRect(camp.x - 7, camp.y - 2, 15, 3);
	for (const [offset, height, width] of [
		[-4, 12, 4],
		[1, 19, 5],
		[6, 10, 3],
	] as const) {
		const sway = Math.sin(fireTime / 230 + offset) * 2;
		const peak = height + Math.round(Math.sin(fireTime / 170 + offset) * 2);
		for (let row = 0; row < peak; row++) {
			const depth = row / (peak - 1);
			const radius = Math.floor(Math.sin(depth * Math.PI * 0.6) * width);
			const x = camp.x + offset + Math.round(sway * (1 - depth));
			ctx.fillStyle = FIRE_RED;
			ctx.fillRect(x - radius, camp.y - peak + row, radius * 2 + 1, 1);
			if (radius > 1) {
				ctx.fillStyle = FIRE_ORANGE;
				ctx.fillRect(x - radius + 1, camp.y - peak + row, radius * 2 - 1, 1);
			}
		}
	}
	ctx.fillStyle = FIRE_CORE;
	for (let row = 0; row < 7; row++) {
		const radius = Math.floor(row * 0.6);
		const sway = Math.round(Math.sin(fireTime / 240) * (1 - row / 6));
		ctx.fillRect(
			camp.x + sway + (row < 3 ? 1 : 0) - radius,
			camp.y - 8 + row,
			radius * 2 + 1,
			1,
		);
	}
	for (const direction of [-1, 1]) {
		for (let section = 0; section < 7; section++) {
			const x = camp.x - 10 + section * 3;
			const y = camp.y - 1 + Math.round((section - 3) * direction * 0.65);
			ctx.fillStyle = "#392d31";
			ctx.fillRect(x, y, 4, 3);
			ctx.fillStyle = "#795341";
			ctx.fillRect(x, y, 3, 1);
		}
	}
	ctx.fillStyle = FIRE_RED;
	ctx.fillRect(camp.x - 3, camp.y, 2, 1);
	ctx.fillRect(camp.x + 3, camp.y + 1, 2, 1);
	ctx.fillStyle = FIRE_ORANGE;
	for (let ember = 0; ember < 3; ember++) {
		const rise = (fireTime / 1600 + ember / 3) % 1;
		ctx.globalAlpha = (1 - rise) * 0.6;
		ctx.fillRect(
			camp.x + Math.round(Math.sin(ember * 2 + rise * 4) * 4),
			camp.y - 15 - Math.round(rise * 16),
			1,
			1,
		);
	}
}
