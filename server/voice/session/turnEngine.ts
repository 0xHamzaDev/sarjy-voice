import {
	FALLBACK_COORDS,
	HISTORY_MAX_MESSAGES,
	RATE_WINDOW_MS,
	SKY_TIME_ZONE,
	TURNS_PER_MINUTE,
} from "@server/config";
import type { StoredLocation } from "@server/location";
import {
	type MemorySnapshot,
	readMemorySnapshot,
} from "@server/memory/memoryStore";
import type { User } from "@server/users/userStore";
import type { ChatMessage } from "@server/vendors/llm";
import { detectLanguage } from "@server/voice/listen/detectLanguage";
import { createSpeechInput } from "@server/voice/listen/speechInput";
import { runTurn } from "@server/voice/reply/runTurn";
import { GREETING_INSTRUCTION } from "@server/voice/reply/systemPrompt";
import {
	getPhraseAudio,
	MISSED_SPEECH_TEXT,
} from "@server/voice/speak/fillerAudio";
import type { Marks } from "@server/voice/turnTimings";
import { debugLog } from "@server/voice/voiceDebug";
import {
	type Coords,
	type Lang,
	type ServerMessage,
	TTS_SAMPLE_RATE,
} from "@shared/protocol";
import { extractAndSaveMemories } from "./backgroundMemory";
import { createTimingsReport } from "./timingsReport";

const TTS_BYTES_PER_SECOND = TTS_SAMPLE_RATE * 2;

type TurnEngineDeps = {
	user: User;
	location: StoredLocation | null;
	sessionSignal: AbortSignal;
	sendJson(message: ServerMessage): void;
	writeAudio(pcm: Buffer): void;
};

export function createTurnEngine({
	user,
	location,
	sessionSignal,
	sendJson,
	writeAudio,
}: TurnEngineDeps) {
	const vocab = [user.name];
	const history: ChatMessage[] = [];
	const recentTurns: number[] = [];
	const timings = createTimingsReport(user.id, sendJson);
	let tz = location?.tz ?? SKY_TIME_ZONE;
	let coords: Coords = location
		? { lat: location.lat, lon: location.lon }
		: FALLBACK_COORDS;
	let turn: AbortController | null = null;
	let playingUntil = 0;
	let callLang: Lang = "ar";
	let turnNumber = 0;
	let unanswered: string | null = null;
	let memoryRevision: number | null = null;
	let pausedSnapshot: Promise<MemorySnapshot> | null = null;

	const isSilent = () => !turn && Date.now() >= playingUntil;

	const sendAudio = (pcm: Buffer) => {
		unanswered = null;
		writeAudio(pcm);
		playingUntil =
			Math.max(playingUntil, Date.now()) +
			(pcm.length / TTS_BYTES_PER_SECOND) * 1000;
	};

	const interrupt = () => {
		const disrupting = turn !== null || Date.now() < playingUntil;
		turn?.abort();
		turn = null;
		playingUntil = 0;
		if (disrupting) sendJson({ type: "stop" });
	};

	const withinRateLimit = () => {
		const now = Date.now();
		while (now - (recentTurns[0] ?? now) > RATE_WINDOW_MS) recentTurns.shift();
		if (recentTurns.length >= TURNS_PER_MINUTE) return false;
		recentTurns.push(now);
		return true;
	};

	const startTurn = async (
		transcript: string,
		marks: Marks,
		greetLang?: Lang,
		sttLanguage?: string | null,
		snapshotRead = readMemorySnapshot(user.id),
	) => {
		if (!withinRateLimit()) {
			sendJson({ type: "error", code: "rate_limited" });
			return;
		}
		interrupt();
		const controller = new AbortController();
		turn = controller;
		turnNumber++;
		marks.transcriptFinal ??= performance.now();
		const snapshot = await snapshotRead.catch(() => null);
		if (turn !== controller || sessionSignal.aborted) return;
		if (snapshot?.revision !== memoryRevision) history.length = 0;
		memoryRevision = snapshot?.revision ?? null;
		if (!greetLang)
			debugLog(
				"TRANSCRIPT",
				turnNumber,
				`${transcript} (lang: ${sttLanguage ?? detectLanguage(transcript)})`,
			);
		const result = await runTurn({
			transcript,
			marks,
			user,
			onNameSaved: (name) => {
				user.name = name;
				vocab[0] = name;
				sendJson({ type: "name", name });
			},
			tz,
			coords,
			lang: greetLang ?? (/\p{L}/u.test(transcript) ? undefined : callLang),
			turnNumber,
			memories: snapshotRead.then(({ memories }) => memories),
			history: [...history],
			signal: AbortSignal.any([controller.signal, sessionSignal]),
			sendJson: (message) => {
				if (controller.signal.aborted || sessionSignal.aborted) return;
				if (message.type === "turn") timings.issued(message.turnId);
				sendJson(message);
			},
			sendAudio: (pcm) => {
				if (!controller.signal.aborted && !sessionSignal.aborted)
					sendAudio(pcm);
			},
		});
		if (result && !greetLang && snapshot)
			void extractAndSaveMemories(user.id, transcript, snapshot, sendJson);
		if (turn !== controller || sessionSignal.aborted) return;
		turn = null;
		if (!result) return;
		if (unanswered === transcript) unanswered = null;
		callLang = result.lang;
		if (!greetLang) history.push({ role: "user", content: transcript });
		history.push({ role: "assistant", content: result.reply });
		history.splice(0, Math.max(0, history.length - HISTORY_MAX_MESSAGES));
		timings.completed(result);
	};

	const stt = createSpeechInput({
		signal: sessionSignal,
		vocab,
		language: () => callLang,
		onSpeech: interrupt,
		onPause: () => {
			pausedSnapshot = readMemorySnapshot(user.id);
			pausedSnapshot.catch(() => {});
		},
		onEndpoint: ({ text, language, marks }) => {
			sendJson({ type: "transcript", text, final: true });
			unanswered = unanswered ? `${unanswered} ${text}` : text;
			const snapshotRead = pausedSnapshot ?? undefined;
			pausedSnapshot = null;
			void startTurn(unanswered, marks, undefined, language, snapshotRead);
		},
		onMissedSpeech: async (signal) => {
			if (!isSilent()) return;
			sendJson({ type: "error", code: "stt_failed" });
			const audio = await getPhraseAudio(
				MISSED_SPEECH_TEXT[callLang],
				callLang,
			);
			if (audio && isSilent() && !signal.aborted) sendAudio(audio);
		},
		onError: (code) => sendJson({ type: "error", code }),
		busyUntil: () => (turn ? Date.now() : playingUntil),
	});

	return {
		write: stt.write,
		setLocation(newTz: string, newCoords: Coords | null) {
			tz = newTz;
			coords = newCoords ?? coords;
		},
		startText(text: string) {
			void startTurn(text, { speechEnd: performance.now() });
		},
		muteMic: stt.stop,
		unmuteMic: stt.start,
		startCall(lang: Lang) {
			stt.start();
			callLang = lang;
			void startTurn(
				GREETING_INSTRUCTION,
				{ speechEnd: performance.now() },
				lang,
			);
		},
		endCall() {
			stt.stop();
			unanswered = null;
			interrupt();
		},
		played: timings.played,
	};
}
