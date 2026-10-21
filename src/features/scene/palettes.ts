import type { Phase } from "@/features/sky/skyPhase";

type Palette = {
	sky: [string, string, string, string, string];
	dunes: [string, string, string, string, string];
	edge: string;
	star: string;
	moon: string;
};

export type Frame = {
	ctx: CanvasRenderingContext2D;
	w: number;
	h: number;
	p: Palette;
	phase: Phase;
	time: number;
	still: boolean;
	level: number;
	driftX: number;
	driftY: number;
	mobile: boolean;
};

export const PALETTES: Record<Phase, Palette> = {
	night: {
		sky: ["#151525", "#1b192e", "#252039", "#342a45", "#4a3753"],
		dunes: ["#71556a", "#59465d", "#41384f", "#302c42", "#232438"],
		edge: "#a17b83",
		star: "#d5bcc0",
		moon: "#ecce99",
	},
	fajr: {
		sky: ["#383b57", "#454760", "#535169", "#746477", "#a48386"],
		dunes: ["#aa8b91", "#837487", "#64617b", "#46485f", "#30384e"],
		edge: "#cfafa5",
		star: "#c7c8d9",
		moon: "#ecd3b0",
	},
	day: {
		sky: ["#c3d1cb", "#cbd6c9", "#d5d8c5", "#ded9bd", "#ebd9b4"],
		dunes: ["#d7b88d", "#bc9775", "#a17b65", "#826251", "#58433f"],
		edge: "#f5dbac",
		star: "#a6b9b6",
		moon: "#ffebbb",
	},
	maghrib: {
		sky: ["#775369", "#996071", "#b9767b", "#d79483", "#e6b28c"],
		dunes: ["#bc897e", "#996b70", "#785668", "#573f56", "#342c43"],
		edge: "#e8b08c",
		star: "#f2c6ac",
		moon: "#ffe0a7",
	},
};

const SKY_BAND_COUNT = 32;

const channels = (color: string) =>
	[1, 3, 5].map((offset) =>
		Number.parseInt(color.slice(offset, offset + 2), 16),
	);

export function skyBands(palette: Palette) {
	const colors = palette.sky.map(channels);
	const lastSegment = colors.length - 2;
	const bandsPerSegment = SKY_BAND_COUNT / (lastSegment + 1);
	return Array.from({ length: SKY_BAND_COUNT }, (_, step) => {
		const position = (step + 1) / bandsPerSegment;
		const index = Math.min(lastSegment, Math.floor(position));
		const mix = position - index;
		const from = colors[index] ?? [];
		const to = colors[index + 1] ?? [];
		return `rgb(${from.map((value, channel) => Math.round(value + ((to[channel] ?? value) - value) * mix)).join(",")})`;
	});
}
