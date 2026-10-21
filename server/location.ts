import { cookieFromHeader } from "@server/users/userStore";
import { coordinates, timeZone } from "@shared/protocol";
import type { z } from "zod";
import { LOCATION_COOKIE } from "./config";

export const storedLocation = coordinates.extend({ tz: timeZone });

export type StoredLocation = z.infer<typeof storedLocation>;

export function parseLocation(raw: string | undefined): StoredLocation | null {
	if (!raw) return null;
	try {
		return storedLocation.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function locationFromCookieHeader(
	header: string | undefined,
): StoredLocation | null {
	const raw = cookieFromHeader(header, LOCATION_COOKIE);
	try {
		return parseLocation(raw && decodeURIComponent(raw));
	} catch {
		return null;
	}
}
