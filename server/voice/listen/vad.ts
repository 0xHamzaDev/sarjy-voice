import {
	VAD_BARGE_IN_MS,
	VAD_CONFIRM_MS,
	VAD_ENTER_PROB,
	VAD_EXIT_PROB,
	VAD_HANGOVER_MS,
	VAD_MAX_UTTERANCE_MS,
	VAD_MIN_SPEECH_DB,
	VAD_PREROLL_MS,
	VAD_SHORT_HANGOVER_MS,
	VAD_SHORT_UTTERANCE_MS,
	VAD_SPECULATE_MS,
	VAD_START_MS,
	VAD_TAIL_MS,
} from "@server/config";
import { MIC_SAMPLE_RATE } from "@shared/protocol";

export type VadEvent =
	| { type: "speech" }
	| { type: "pause"; pcm: Buffer }
	| { type: "end"; pcm: Buffer; speechEndAt: number };

export type Classify = (frame: Buffer) => Promise<number>;

const SILENT_DB = -100;
const BYTES_PER_MS = (MIC_SAMPLE_RATE * 2) / 1000;

export function frameDb(frame: Buffer): number {
	const samples = Math.floor(frame.length / 2);
	if (samples === 0) return SILENT_DB;
	let sum = 0;
	for (let i = 0; i < samples; i++) sum += frame.readInt16LE(i * 2) ** 2;
	const rms = Math.sqrt(sum / samples) / 0x8000;
	return rms === 0 ? SILENT_DB : Math.max(SILENT_DB, 20 * Math.log10(rms));
}

export function createVad(classify: Classify) {
	let preroll: Buffer[] = [];
	let prerollMs = 0;
	let utterance: Buffer[] = [];
	let speaking = false;
	let confirmed = false;
	let paused = false;
	let busyAtOnset = false;
	let onsetMs = 0;
	let voicedMs = 0;
	let silentMs = 0;
	let lengthMs = 0;
	let tailBytes = 0;
	let lastVoicedAt = 0;

	const reset = () => {
		preroll = [];
		prerollMs = 0;
		utterance = [];
		speaking = false;
		confirmed = false;
		paused = false;
		busyAtOnset = false;
		onsetMs = 0;
		voicedMs = 0;
		silentMs = 0;
		lengthMs = 0;
		tailBytes = 0;
	};

	const spoken = () => {
		const pcm = Buffer.concat(utterance);
		return pcm.subarray(0, pcm.length - tailBytes);
	};

	const finish = (): VadEvent[] => {
		const event: VadEvent[] = confirmed
			? [{ type: "end", pcm: spoken(), speechEndAt: lastVoicedAt }]
			: [];
		reset();
		return event;
	};

	return {
		async push(frame: Buffer, now: number, busy: boolean): Promise<VadEvent[]> {
			const frameMs = frame.length / BYTES_PER_MS;
			const db = frameDb(frame);
			const prob = await classify(frame);
			const voiced =
				prob >= (speaking ? VAD_EXIT_PROB : VAD_ENTER_PROB) &&
				db > VAD_MIN_SPEECH_DB;

			if (!speaking) {
				onsetMs = voiced ? onsetMs + frameMs : 0;
				preroll.push(frame);
				prerollMs += frameMs;
				while (prerollMs > VAD_PREROLL_MS && preroll.length > 1)
					prerollMs -= (preroll.shift()?.length ?? 0) / BYTES_PER_MS;
				if (onsetMs < VAD_START_MS) return [];
				speaking = true;
				busyAtOnset = busy;
				utterance = preroll;
				lengthMs = prerollMs;
				voicedMs = onsetMs;
				lastVoicedAt = now;
				preroll = [];
				prerollMs = 0;
				return [];
			}

			utterance.push(frame);
			lengthMs += frameMs;
			if (voiced) {
				voicedMs += frameMs;
				silentMs = 0;
				tailBytes = 0;
				paused = false;
				lastVoicedAt = now;
			} else {
				silentMs += frameMs;
				if (silentMs > VAD_TAIL_MS) tailBytes += frame.length;
			}
			const events: VadEvent[] = [];
			const confirmMs = busyAtOnset ? VAD_BARGE_IN_MS : VAD_CONFIRM_MS;
			if (!confirmed && voicedMs >= confirmMs) {
				confirmed = true;
				events.push({ type: "speech" });
			}
			const hangoverMs =
				voicedMs < VAD_SHORT_UTTERANCE_MS
					? VAD_SHORT_HANGOVER_MS
					: VAD_HANGOVER_MS;
			if (silentMs >= hangoverMs || lengthMs >= VAD_MAX_UTTERANCE_MS)
				events.push(...finish());
			else if (confirmed && !paused && silentMs >= VAD_SPECULATE_MS) {
				paused = true;
				events.push({ type: "pause", pcm: spoken() });
			}
			return events;
		},
		commit(): VadEvent[] {
			return paused ? finish() : [];
		},
	};
}
