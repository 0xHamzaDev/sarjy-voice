import { z } from "zod";

export const MIC_SAMPLE_RATE = 16000;
export const TTS_SAMPLE_RATE = 24000;
export const SESSION_ENDED_CLOSE_CODE = 4000;
export const NAME_MAX_CHARS = 40;

export const LANGS = ["ar", "en"] as const;

export type Lang = (typeof LANGS)[number];

const isTimeZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat("en", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

export const timeZone = z.string().min(1).max(64).refine(isTimeZone);

export const coordinates = z.object({
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
});

export type Coords = z.infer<typeof coordinates>;

export const clientMessage = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		tz: timeZone,
		coords: coordinates.nullable(),
	}),
	z.object({
		type: z.literal("text"),
		text: z.string().trim().min(1).max(500),
	}),
	z.discriminatedUnion("action", [
		z.object({
			type: z.literal("call"),
			action: z.literal("start"),
			lang: z.enum(LANGS),
		}),
		z.object({
			type: z.literal("call"),
			action: z.enum(["mute", "unmute", "end"]),
		}),
	]),
	z.object({ type: z.literal("ping"), t: z.number() }),
	z.object({
		type: z.literal("played"),
		turnId: z.uuid(),
		playbackMs: z.number().nonnegative(),
		rttMs: z.number().nonnegative(),
	}),
]);

export type ClientMessage = z.infer<typeof clientMessage>;

export const stageNames = [
	"endpointing",
	"sttFinalize",
	"memoryLookup",
	"llmFirstToken",
	"firstSentence",
	"ttsFirstAudio",
	"network",
	"playback",
] as const;

export type Stage = (typeof stageNames)[number];

export type Timings = {
	turnId: string;
	stages: Record<Stage, number | null>;
	ttfaMs: number | null;
	llmProvider: string;
	pipeline: string;
};

export type City = { city: string; cityAr: string };

export type Word = { text: string; startMs: number; endMs: number };

export type Weather = {
	city: string;
	cityAr: string;
	temperature: number;
	feelsLike: number;
	condition: string;
	conditionAr: string;
	windKmh: number;
	humidity: number;
	hours: { time: string; temperature: number }[];
	air: AirQuality | null;
};

export type AirQuality = { aqi: number; pm10: number; dust: number };

export type CurrencyCard = {
	amount: number;
	from: string;
	to: string;
	result: number;
	rate: number;
	updatedAt: string;
};

export type QiblaCard = {
	city: string;
	cityAr: string;
	bearing: number;
	distanceKm: number;
};

export type PrayerTimes = {
	fajr: string;
	sunrise: string;
	dhuhr: string;
	asr: string;
	maghrib: string;
	isha: string;
};

export type PrayerCard = {
	city: string;
	cityAr: string;
	date: string;
	hijriDate: string;
	times: PrayerTimes;
};

export type ToolResult =
	| { kind: "weather"; weather: Weather }
	| { kind: "prayer"; prayer: PrayerCard }
	| { kind: "currency"; currency: CurrencyCard }
	| { kind: "qibla"; qibla: QiblaCard };

export type ErrorCode =
	| "rate_limited"
	| "session_expired"
	| "stt_failed"
	| "llm_failed"
	| "tts_failed"
	| "memory_failed"
	| "bad_message"
	| "mic_idle";

export type ServerMessage =
	| { type: "ready"; name: string }
	| { type: "name"; name: string }
	| { type: "turn"; turnId: string }
	| { type: "transcript"; text: string; final: boolean }
	| { type: "reply"; turnId: string; text: string }
	| { type: "words"; turnId: string; words: Word[] }
	| { type: "memory"; memory: { id: number; content: string } }
	| { type: "tool"; result: ToolResult }
	| { type: "timings"; timings: Timings }
	| { type: "stop" }
	| { type: "pong"; t: number }
	| { type: "error"; code: ErrorCode };
