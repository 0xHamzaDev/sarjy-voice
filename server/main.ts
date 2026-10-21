import { db } from "@server/db/client";
import { restartVoiceSessions } from "@server/voice/session/voiceSession";
import {
	FILLER_TEXT,
	getPhraseAudio,
	LLM_FAILED_TEXT,
	MISSED_SPEECH_TEXT,
} from "@server/voice/speak/fillerAudio";
import type { Lang } from "@shared/protocol";
import { sql } from "drizzle-orm";
import { createAppServer } from "./app";
import { DB_KEEPALIVE_MS, DB_SHUTDOWN_TIMEOUT_S } from "./config";
import { env } from "./env";
import type { FetchHandler } from "./tanstackBridge";

const START_ENTRY = new URL("../dist/server/server.js", import.meta.url).href;

const startHandler =
	env.NODE_ENV === "production"
		? ((await import(START_ENTRY)) as { default: FetchHandler }).default
		: null;

const server = createAppServer(startHandler).listen(env.PORT, () =>
	console.log(`sarjy listening on :${env.PORT}`),
);

if (env.NODE_ENV === "production")
	for (const lang of ["ar", "en"] as const satisfies Lang[]) {
		void getPhraseAudio(MISSED_SPEECH_TEXT[lang], lang);
		void getPhraseAudio(LLM_FAILED_TEXT[lang], lang);
		if (env.FILLER) void getPhraseAudio(FILLER_TEXT[lang], lang);
	}

if (env.DB_KEEPALIVE) {
	setInterval(() => {
		db.execute(sql`select 1`).catch((error) =>
			console.error("db keepalive failed", error),
		);
	}, DB_KEEPALIVE_MS);
}

async function shutdown() {
	server.close();
	restartVoiceSessions();
	await db.$client.end({ timeout: DB_SHUTDOWN_TIMEOUT_S });
	process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.once(signal, () => {
		shutdown().catch((error) => {
			console.error("shutdown failed", error);
			process.exit(1);
		});
	});
