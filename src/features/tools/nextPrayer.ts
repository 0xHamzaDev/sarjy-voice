import type { PrayerTimes } from "@shared/protocol";
import { minutesOf } from "@/features/sky/localClock";

export const PRAYER_ORDER = [
	"fajr",
	"sunrise",
	"dhuhr",
	"asr",
	"maghrib",
	"isha",
] as const satisfies readonly (keyof PrayerTimes)[];

export function nextPrayer(
	times: PrayerTimes,
	clock: string,
): keyof PrayerTimes {
	const now = minutesOf(clock);
	return (
		PRAYER_ORDER.find((key) => minutesOf(times[key]) > now) ?? PRAYER_ORDER[0]
	);
}
