import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
	ELEVENLABS_MODEL,
	ELEVENLABS_VOICE_ID,
	VAD_HANGOVER_MS,
	WHISPER_MODEL,
} from "@server/config";
import { db } from "@server/db/client";
import { users } from "@server/db/schema";
import { env } from "@server/env";
import { createUser } from "@server/users/userStore";
import {
	MIC_SAMPLE_RATE,
	type ServerMessage,
	type Timings,
	TTS_SAMPLE_RATE,
} from "@shared/protocol";
import { eq } from "drizzle-orm";
import WebSocket from "ws";
import { summarize } from "./stats";

const FRAME_MS = 20;
const FRAME_BYTES = (MIC_SAMPLE_RATE / 1000) * FRAME_MS * 2;
const SILENCE_FRAME = Buffer.alloc(FRAME_BYTES);
const MAX_TRAILING_SILENCE_MS = 10_000;
const TURN_INTERVAL_MS = 6_500;
const GREETING_GAP_MS = 500;
const CLIP_NAMES = ["en", "ar", "mixed"] as const;

const { values } = parseArgs({
	options: {
		label: { type: "string", default: "run" },
		runs: { type: "string", default: "20" },
	},
});
const runs = Number(values.runs);
const label = values.label ?? "run";
const url = process.env.BENCH_URL ?? `ws://localhost:${env.PORT}/voice`;

async function runOnce(
	userId: string,
	pcm: Buffer,
	lang: "ar" | "en",
): Promise<Timings> {
	const socket = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	let turnId = "";
	let rttMs = 0;
	let firstAudio = false;
	let greetingBytes = 0;
	let greeted = false;
	let clipTurn = false;
	let greetingDone = () => {};
	const greeting = new Promise<void>((resolve) => {
		greetingDone = resolve;
	});
	const timings = new Promise<Timings>((resolve, reject) => {
		socket.on("error", reject);
		socket.on("message", (data, isBinary) => {
			if (isBinary) {
				if (!greeted) greetingBytes += (data as Buffer).length;
				if (!firstAudio && turnId) {
					firstAudio = true;
					socket.send(
						JSON.stringify({ type: "played", turnId, playbackMs: 0, rttMs }),
					);
				}
				return;
			}
			const message = JSON.parse(String(data)) as ServerMessage;
			if (message.type === "pong") rttMs = performance.now() - message.t;
			if (message.type === "turn") {
				turnId = message.turnId;
				firstAudio = false;
			}
			if (message.type === "reply" && !greeted) {
				greeted = true;
				greetingDone();
			}
			if (message.type === "error")
				reject(new Error(`server error: ${message.code}`));
			if (
				message.type === "timings" &&
				clipTurn &&
				message.timings.turnId === turnId
			)
				resolve(message.timings);
		});
	});
	timings.catch(() => {});
	await once(socket, "open");
	socket.send(
		JSON.stringify({
			type: "hello",
			tz: "Asia/Riyadh",
			coords: { lat: 24.7136, lon: 46.6753 },
		}),
	);
	socket.send(JSON.stringify({ type: "ping", t: performance.now() }));
	socket.send(JSON.stringify({ type: "call", action: "start", lang }));
	await Promise.race([greeting, sleep(15_000)]);
	await sleep((greetingBytes / (TTS_SAMPLE_RATE * 2)) * 1000 + GREETING_GAP_MS);
	turnId = "";
	firstAudio = false;
	clipTurn = true;

	const started = performance.now();
	for (let frame = 0; !firstAudio || !turnId; frame++) {
		const offset = frame * FRAME_BYTES;
		if (
			offset >
			pcm.length + (MAX_TRAILING_SILENCE_MS / FRAME_MS) * FRAME_BYTES
		)
			break;
		socket.send(
			offset < pcm.length
				? pcm.subarray(offset, offset + FRAME_BYTES)
				: SILENCE_FRAME,
		);
		await sleep(
			Math.max(0, started + (frame + 1) * FRAME_MS - performance.now()),
		);
	}

	try {
		return await Promise.race([
			timings,
			sleep(15_000).then(() => Promise.reject(new Error("no timings"))),
		]);
	} finally {
		socket.close();
	}
}

const row = (
	name: string,
	summary: { p50: number | null; p95: number | null },
) => `| ${name} | ${summary.p50 ?? "–"} | ${summary.p95 ?? "–"} |`;

const user = await createUser("Bench");
try {
	const sections: string[] = [];
	let sample: Timings | undefined;
	for (const clip of CLIP_NAMES) {
		const pcm = await readFile(`bench/clips/${clip}.pcm`);
		const results: Timings[] = [];
		for (let run = 0; run < runs; run++) {
			try {
				results.push(await runOnce(user.id, pcm, clip === "en" ? "en" : "ar"));
				process.stdout.write(".");
			} catch (error) {
				console.error(`\n${clip} run ${run} failed:`, error);
			}
			await sleep(TURN_INTERVAL_MS);
		}
		sample ??= results[0];
		const summary = summarize(results);
		sections.push(
			[
				`## ${clip} (${results.length}/${runs} runs)`,
				"",
				"| Stage | p50 ms | p95 ms |",
				"|---|---|---|",
				...Object.entries(summary).map(([name, value]) => row(name, value)),
			].join("\n"),
		);
	}
	const date = new Date().toISOString().slice(0, 10);
	const header = [
		`# Bench: ${label} (${date})`,
		"",
		`- URL: ${url}`,
		`- PIPELINE: ${sample?.pipeline ?? "–"}, LLM_PROVIDER: ${sample?.llmProvider ?? "–"}`,
		`- STT: ${WHISPER_MODEL}, VAD_HANGOVER_MS: ${VAD_HANGOVER_MS}`,
		`- TTS: ${ELEVENLABS_MODEL}, voice: ${ELEVENLABS_VOICE_ID}`,
		"- Playback delay is 0 (no speakers); network is RTT/2 from the bench machine.",
	].join("\n");
	await mkdir("docs/bench", { recursive: true });
	const path = `docs/bench/${date}-${label}.md`;
	await writeFile(path, `${header}\n\n${sections.join("\n\n")}\n`);
	console.log(`\nwrote ${path}`);
} finally {
	await db.delete(users).where(eq(users.id, user.id));
	await db.$client.end();
}
