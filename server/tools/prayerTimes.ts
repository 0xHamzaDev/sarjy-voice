import {
	ALADHAN_METHOD_UMM_AL_QURA,
	ALADHAN_URL,
	TOOL_TIMEOUT_MS,
} from "@server/config";
import type { ToolDefinition } from "@server/vendors/llm";
import { withTimeout } from "@server/withTimeout";
import type { City, Coords, PrayerCard } from "@shared/protocol";
import { z } from "zod";
import { hereOf } from "./reverseGeocode";
import type { ToolContext } from "./toolRegistry";

const aladhanResponse = z.object({
	data: z.object({
		timings: z.object({
			Fajr: z.string(),
			Sunrise: z.string(),
			Dhuhr: z.string(),
			Asr: z.string(),
			Sunset: z.string(),
			Maghrib: z.string(),
			Isha: z.string(),
		}),
		date: z.object({ hijri: z.object({ date: z.string() }) }),
	}),
});

export const toAladhanDate = (isoDate: string) =>
	isoDate.split("-").reverse().join("-");

export const todayIn = (tz: string, now: Date) =>
	new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);

type RawPrayerTimes = z.infer<typeof aladhanResponse>["data"]["timings"];

export async function fetchPrayerTimes(
	coords: Coords,
	date: string,
	signal: AbortSignal,
) {
	const url = new URL(`${ALADHAN_URL}/${toAladhanDate(date)}`);
	url.searchParams.set("latitude", String(coords.lat));
	url.searchParams.set("longitude", String(coords.lon));
	url.searchParams.set("method", String(ALADHAN_METHOD_UMM_AL_QURA));
	const response = await fetch(url, {
		signal: withTimeout(signal, TOOL_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`aladhan ${response.status}`);
	const { data } = aladhanResponse.parse(await response.json());
	return { timings: data.timings, hijri: data.date.hijri.date };
}

const toCard = (
	{ city, cityAr }: City,
	date: string,
	timings: RawPrayerTimes,
	hijriDate: string,
): PrayerCard => ({
	city,
	cityAr,
	date,
	hijriDate,
	times: {
		fajr: timings.Fajr,
		sunrise: timings.Sunrise,
		dhuhr: timings.Dhuhr,
		asr: timings.Asr,
		maghrib: timings.Maghrib,
		isha: timings.Isha,
	},
});

export const prayerArgs = z.object({
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export const prayerTimesDefinition: ToolDefinition = {
	type: "function",
	function: {
		name: "prayer_times",
		description:
			"Get prayer, sunrise, or sunset times for the user's location, plus the Hijri date (DD-MM-YYYY). Date is YYYY-MM-DD, default today. Call only when the user explicitly asks for a prayer/adhan time, sunrise/sunset, or the Hijri date (e.g. 'when is Maghrib', 'متى أذان الفجر', 'كم التاريخ الهجري'). Do not call for general advice or questions that merely mention a time of day or an activity's timing.",
		parameters: {
			type: "object",
			properties: { date: { type: "string" } },
		},
	},
};

export async function prayerTimesTool(
	date: string,
	context: ToolContext,
): Promise<string> {
	try {
		const [{ timings, hijri }, place] = await Promise.all([
			fetchPrayerTimes(context.coords, date, context.signal),
			hereOf(context.coords),
		]);
		context.onResult({
			kind: "prayer",
			prayer: toCard(place, date, timings, hijri),
		});
		return JSON.stringify({ date, timings, hijri });
	} catch (error) {
		if (context.signal.aborted) throw error;
		console.error("prayer times failed", error);
		return JSON.stringify({ error: "prayer_times_unavailable" });
	}
}
