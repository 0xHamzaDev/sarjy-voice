import { EARTH_RADIUS_KM, KAABA_COORDS } from "@server/config";
import type { ToolDefinition } from "@server/vendors/llm";
import type { Coords } from "@shared/protocol";
import { hereOf } from "./reverseGeocode";
import type { ToolContext } from "./toolRegistry";

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function qiblaOf({ lat, lon }: Coords) {
	const fromLat = toRadians(lat);
	const kaabaLat = toRadians(KAABA_COORDS.lat);
	const deltaLon = toRadians(KAABA_COORDS.lon - lon);
	const bearing = toDegrees(
		Math.atan2(
			Math.sin(deltaLon) * Math.cos(kaabaLat),
			Math.cos(fromLat) * Math.sin(kaabaLat) -
				Math.sin(fromLat) * Math.cos(kaabaLat) * Math.cos(deltaLon),
		),
	);
	const haversine =
		Math.sin((kaabaLat - fromLat) / 2) ** 2 +
		Math.cos(fromLat) * Math.cos(kaabaLat) * Math.sin(deltaLon / 2) ** 2;
	return {
		bearing: Math.round((bearing + 360) % 360),
		distanceKm: Math.round(
			2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine)),
		),
	};
}

export const qiblaDefinition: ToolDefinition = {
	type: "function",
	function: {
		name: "qibla",
		description:
			"Get the Qibla direction (compass bearing to the Kaaba in Makkah) and distance from the user's location. Call only when the user asks where the Qibla is or which way to pray. A compass is shown on screen.",
		parameters: { type: "object", properties: {} },
	},
};

export async function qiblaTool(context: ToolContext): Promise<string> {
	const { city, cityAr } = await hereOf(context.coords);
	const card = { city, cityAr, ...qiblaOf(context.coords) };
	context.onResult({ kind: "qibla", qibla: card });
	return JSON.stringify(card);
}
