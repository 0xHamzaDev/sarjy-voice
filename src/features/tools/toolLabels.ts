import type { StringKey } from "@/i18n/strings";

const AQI_LEVELS: [maxAqi: number, key: StringKey][] = [
	[50, "aqiGood"],
	[100, "aqiModerate"],
	[150, "aqiSensitive"],
	[200, "aqiUnhealthy"],
	[300, "aqiVeryUnhealthy"],
];

export const aqiLevel = (aqi: number): StringKey =>
	AQI_LEVELS.find(([max]) => aqi <= max)?.[1] ?? "aqiHazardous";

const COMPASS_POINTS: StringKey[] = [
	"dirN",
	"dirNE",
	"dirE",
	"dirSE",
	"dirS",
	"dirSW",
	"dirW",
	"dirNW",
];
const DEGREES_PER_POINT = 360 / COMPASS_POINTS.length;

export const compassPoint = (bearing: number): StringKey =>
	COMPASS_POINTS[
		Math.round(bearing / DEGREES_PER_POINT) % COMPASS_POINTS.length
	] ?? "dirN";
