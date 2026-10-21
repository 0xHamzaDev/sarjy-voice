import type { Lang, Word } from "@shared/protocol";
import type { Memory } from "@/features/memories/starSlots";
import type { WaterfallData } from "@/features/voice/voiceState";

export const PREVIEW_STATES = [
	"idle",
	"listening",
	"thinking",
	"speaking",
	"memory-learned",
	"error",
] as const;

export type PreviewState = (typeof PREVIEW_STATES)[number];

export type View = {
	state: PreviewState;
	level: number;
	transcript: string;
	words: Word[];
	startedAt: number | null;
	memories: Memory[];
	newId: number | null;
	referencedId: number | null;
	timings: WaterfallData | null;
};

const MEMORIES: Memory[] = [
	{ id: 1, content: "Home is Riyadh", contentAr: "مدينتي الرياض" },
	{ id: 2, content: "Quiet desert evenings", contentAr: "أحب هدوء ليالي البر" },
	{
		id: 3,
		content: "Friday coffee with family",
		contentAr: "قهوة الجمعة مع الأهل",
	},
	{ id: 4, content: "Morning walks", contentAr: "أحب المشي في الصباح" },
	{
		id: 5,
		content: "Arabic feels like home",
		contentAr: "العربية لغتي الأقرب",
	},
	{
		id: 6,
		content: "A little space to think",
		contentAr: "أحتاج وقتًا هادئًا للتفكير",
	},
];

const LEARNED: Memory = {
	id: 7,
	content: "Favorite color is blue",
	contentAr: "لوني المفضل هو الأزرق",
};

const TIMINGS: WaterfallData = {
	rows: [
		["endpointing", 300],
		["transcription", 157],
		["reasoning", 420],
		["synthesis", 180],
	],
	ttfaMs: 1057,
};

export const PREVIEW_START: View = {
	state: "idle",
	level: 0,
	transcript: "",
	words: [],
	startedAt: null,
	memories: MEMORIES,
	newId: null,
	referencedId: null,
	timings: null,
};

const LEVEL_TICK_MS = 110;
const LEVEL_FLOOR = 0.12;
const LEVEL_SPAN = 0.78;
const LEVEL_WAVE_FAST = 0.67;
const LEVEL_WAVE_SLOW = 0.23;
const LISTEN_STEPS = [
	[0.3, 450],
	[0.65, 1200],
	[1, 2200],
] as const;
const THINK_AT_MS = 2400;
const SPEAK_AT_MS = 3400;
const SPEAK_MS = 7200;
const WORD_GAP_MS = 30;
const LEARNED_MS = 2000;

const utterance = (lang: Lang) =>
	lang === "ar"
		? "تذكّر أن لوني المفضل هو الأزرق"
		: "Remember that my favorite color is blue";

const reply = (lang: Lang, name: string) =>
	lang === "ar"
		? `أهلاً ${name}، هنا بين النجوم مكان لكل حكاية. تذكّرت أن لونك المفضل هو الأزرق، وصارت له نجمة في سمائك.`
		: `Hello ${name}. There is room for every story here. Your favorite color is blue. Now it has a star.`;

export function createPreviewPlayer(update: (patch: Partial<View>) => void) {
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let levelTimer: ReturnType<typeof setInterval> | undefined;

	const later = (callback: () => void, delay: number) => {
		const timer = setTimeout(() => {
			timers.delete(timer);
			callback();
		}, delay);
		timers.add(timer);
	};

	const dispose = () => {
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
		clearInterval(levelTimer);
	};

	const state = (value: PreviewState) => {
		clearInterval(levelTimer);
		update({ state: value, level: 0 });
		if (value !== "listening" && value !== "speaking") return;
		let tick = 0;
		levelTimer = setInterval(() => {
			tick += 1;
			update({
				level:
					LEVEL_FLOOR +
					Math.abs(
						Math.sin(tick * LEVEL_WAVE_FAST) * Math.cos(tick * LEVEL_WAVE_SLOW),
					) *
						LEVEL_SPAN,
			});
		}, LEVEL_TICK_MS);
	};

	const finish = () => {
		update({ transcript: "" });
		state("idle");
	};

	const learn = () => {
		state("memory-learned");
		update({ memories: [...MEMORIES, LEARNED], newId: LEARNED.id });
		later(finish, LEARNED_MS);
	};

	const speak = (lang: Lang, name: string) => {
		const tokens = reply(lang, name).split(/\s+/);
		const duration = SPEAK_MS / tokens.length;
		state("speaking");
		update({
			words: tokens.map((text, index) => ({
				text,
				startMs: Math.round(index * duration),
				endMs: Math.round((index + 1) * duration - WORD_GAP_MS),
			})),
			startedAt: performance.now(),
			referencedId: MEMORIES[0]?.id ?? null,
		});
		later(learn, SPEAK_MS);
	};

	const listen = (lang: Lang) => {
		state("listening");
		update({ transcript: "" });
		const tokens = utterance(lang).split(/\s+/);
		for (const [fraction, delay] of LISTEN_STEPS)
			later(
				() =>
					update({
						transcript: tokens
							.slice(0, Math.ceil(tokens.length * fraction))
							.join(" "),
					}),
				delay,
			);
	};

	return {
		play(lang: Lang, name: string) {
			dispose();
			listen(lang);
			later(() => state("thinking"), THINK_AT_MS);
			later(() => {
				update({ timings: TIMINGS });
				speak(lang, name);
			}, SPEAK_AT_MS);
		},
		show(value: PreviewState, lang: Lang, name: string) {
			dispose();
			if (value === "listening") listen(lang);
			else if (value === "speaking") speak(lang, name);
			else if (value === "memory-learned") learn();
			else state(value);
		},
		dispose,
	};
}
