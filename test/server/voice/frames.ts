import { VAD_MIN_SPEECH_DB } from "@server/config";
import { type Classify, frameDb } from "@server/voice/listen/vad";

const FRAME_SAMPLES = 320;
const FRAME_MS = 20;
const SPEECH_AMPLITUDE = 6000;
const SPEECH_HZ = 220;
const SAMPLE_RATE = 16000;

const frames = (ms: number, amplitude: number) =>
	Array.from({ length: Math.round(ms / FRAME_MS) }, (_, index) => {
		const frame = Buffer.alloc(FRAME_SAMPLES * 2);
		for (let i = 0; i < FRAME_SAMPLES; i++) {
			const t = (index * FRAME_SAMPLES + i) / SAMPLE_RATE;
			frame.writeInt16LE(
				Math.round(amplitude * Math.sin(2 * Math.PI * SPEECH_HZ * t)),
				i * 2,
			);
		}
		return frame;
	});

export const speech = (ms: number) => frames(ms, SPEECH_AMPLITUDE);
export const silence = (ms: number) => frames(ms, 0);

export const energyClassify: Classify = async (frame) =>
	frameDb(frame) > VAD_MIN_SPEECH_DB ? 1 : 0;
