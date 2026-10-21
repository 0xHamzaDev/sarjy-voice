import type { Frame } from "./palettes";

type Point = [number, number];

const RUG_DESKTOP = [
	[0.22, 0.75],
	[0.66, 0.77],
	[0.92, 1.18],
	[0.04, 1.08],
] as const;
const RUG_MOBILE = [
	[0, 0.72],
	[0.95, 0.74],
	[1.17, 1.22],
	[-0.2, 1.12],
] as const;
const RUG_BASE = "#65424c";
const RUG_LIGHT = "#b19b81";
const RUG_DARK = "#292537";
export function drawRug({ ctx, w, h, p, mobile }: Frame) {
	const [a, b, c, d] = mobile ? RUG_MOBILE : RUG_DESKTOP;
	const rugPoint = (u: number, v: number): Point => [
		w *
			((1 - v) * (a[0] * (1 - u) + b[0] * u) + v * (d[0] * (1 - u) + c[0] * u)),
		h *
			((1 - v) * (a[1] * (1 - u) + b[1] * u) + v * (d[1] * (1 - u) + c[1] * u)),
	];
	const shape = (points: Point[], color: string) => {
		ctx.fillStyle = color;
		ctx.beginPath();
		points.forEach(([u, v], i) => {
			const [x, y] = rugPoint(u, v);
			if (i === 0) ctx.moveTo(Math.round(x), Math.round(y));
			else ctx.lineTo(Math.round(x), Math.round(y));
		});
		ctx.closePath();
		ctx.fill();
	};
	const band = (
		u1: number,
		u2: number,
		v1: number,
		v2: number,
		color: string,
	) =>
		shape(
			[
				[u1, v1],
				[u2, v1],
				[u2, v2],
				[u1, v2],
			],
			color,
		);
	const diamond = (u: number, v: number, size: number, color: string) =>
		shape(
			[
				[u, v - size],
				[u + size, v],
				[u, v + size],
				[u - size, v],
			],
			color,
		);
	ctx.globalAlpha = 0.35;
	shape(
		[
			[0, 0.02],
			[1, 0.02],
			[1.01, 1.02],
			[-0.01, 1.02],
		],
		p.sky[0],
	);
	ctx.globalAlpha = 1;
	band(0, 1, 0, 1, RUG_BASE);
	for (const u of [0.04, 0.12, 0.2, 0.78, 0.86, 0.94]) {
		band(u, u + 0.025, 0, 1, RUG_LIGHT);
		band(u + 0.025, u + 0.045, 0, 1, RUG_DARK);
	}
	for (const v of [0.12, 0.37, 0.65, 0.94]) {
		for (const u of [0.37, 0.63]) {
			diamond(u, v, 0.075, RUG_LIGHT);
			diamond(u, v, 0.035, RUG_DARK);
		}
	}
	band(0, 1, 0.02, 0.035, RUG_LIGHT);
}
