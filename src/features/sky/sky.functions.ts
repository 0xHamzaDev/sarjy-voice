import {
	FALLBACK_COORDS,
	LOCATION_COOKIE,
	LOCATION_COOKIE_MAX_AGE_S,
	SKY_TIME_ZONE,
} from "@server/config";
import { parseLocation, storedLocation } from "@server/location";
import { fetchPrayerTimes, todayIn } from "@server/tools/prayerTimes";
import { cityOf } from "@server/tools/reverseGeocode";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

const readLocation = () => parseLocation(getCookie(LOCATION_COOKIE));

export const getSky = createServerFn({ method: "GET" }).handler(async () => {
	const location = readLocation();
	const coords = location ?? FALLBACK_COORDS;
	const tz = location?.tz ?? SKY_TIME_ZONE;
	const [times, place] = await Promise.all([
		fetchPrayerTimes(
			coords,
			todayIn(tz, new Date()),
			new AbortController().signal,
		)
			.then(({ timings }) => timings)
			.catch((error) => {
				console.error("sky times failed", error);
				return null;
			}),
		cityOf(coords),
	]);
	return { times, place };
});

export const setLocation = createServerFn({ method: "POST" })
	.validator(storedLocation)
	.handler(async ({ data }) => {
		const current = readLocation();
		const changed =
			current?.lat !== data.lat ||
			current?.lon !== data.lon ||
			current?.tz !== data.tz;
		if (changed)
			setCookie(LOCATION_COOKIE, JSON.stringify(data), {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				path: "/",
				maxAge: LOCATION_COOKIE_MAX_AGE_S,
			});
		return changed;
	});
