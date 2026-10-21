import { minutesOf } from "./localClock";

export const PHASES = ["night", "fajr", "day", "maghrib"] as const;

export type Phase = (typeof PHASES)[number];

export type SkyTimes = {
	Fajr: string;
	Sunrise: string;
	Maghrib: string;
	Isha: string;
};

export function skyPhase(times: SkyTimes | null, clock: string): Phase {
	if (!times) return "night";
	const now = minutesOf(clock);
	if (now < minutesOf(times.Fajr) || now >= minutesOf(times.Isha))
		return "night";
	if (now < minutesOf(times.Sunrise)) return "fajr";
	if (now < minutesOf(times.Maghrib)) return "day";
	return "maghrib";
}
