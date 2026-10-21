import { env } from "@server/env";

export function debugLog(label: string, turn: number, body: string): void {
	if (env.VOICE_DEBUG) console.log(`[${label}] turn ${turn}\n${body}`);
}
