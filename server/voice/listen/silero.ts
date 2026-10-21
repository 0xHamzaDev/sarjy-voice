import { fileURLToPath } from "node:url";
import { MIC_SAMPLE_RATE } from "@shared/protocol";
import { InferenceSession, Tensor } from "onnxruntime-node";
import type { Classify } from "./vad";

const MODEL_PATH = fileURLToPath(new URL("./silero_vad.onnx", import.meta.url));
const WINDOW_SAMPLES = 512;
const CONTEXT_SAMPLES = 64;
const STATE_SIZE = 128;
const PCM_SCALE = 0x8000;

let sessionPromise: Promise<InferenceSession> | null = null;
const getSession = () =>
	(sessionPromise ??= InferenceSession.create(MODEL_PATH));

function pcmToFloat32(frame: Buffer): Float32Array {
	const samples = frame.length / 2;
	const out = new Float32Array(samples);
	for (let i = 0; i < samples; i++)
		out[i] = frame.readInt16LE(i * 2) / PCM_SCALE;
	return out;
}

export function rechunk(
	carry: Float32Array,
	samples: Float32Array,
): { windows: Float32Array[]; carry: Float32Array } {
	const combined = new Float32Array(carry.length + samples.length);
	combined.set(carry);
	combined.set(samples, carry.length);
	const windows: Float32Array[] = [];
	let offset = 0;
	while (combined.length - offset >= WINDOW_SAMPLES) {
		windows.push(combined.slice(offset, offset + WINDOW_SAMPLES));
		offset += WINDOW_SAMPLES;
	}
	return { windows, carry: combined.slice(offset) };
}

function floatData(tensor: Tensor | undefined): Float32Array {
	if (!tensor || !(tensor.data instanceof Float32Array))
		throw new Error("silero vad: expected a float32 tensor");
	return tensor.data;
}

export function createSileroClassify(): Classify {
	let state: Float32Array = new Float32Array(2 * STATE_SIZE);
	let context = new Float32Array(CONTEXT_SAMPLES);
	let carry: Float32Array = new Float32Array(0);
	let prob = 0;

	return async (frame: Buffer) => {
		const session = await getSession();
		const chunked = rechunk(carry, pcmToFloat32(frame));
		carry = chunked.carry;
		for (const window of chunked.windows) {
			const input = new Float32Array(CONTEXT_SAMPLES + WINDOW_SAMPLES);
			input.set(context);
			input.set(window, CONTEXT_SAMPLES);
			const results = await session.run({
				input: new Tensor("float32", input, [
					1,
					CONTEXT_SAMPLES + WINDOW_SAMPLES,
				]),
				state: new Tensor("float32", state, [2, 1, STATE_SIZE]),
				sr: new Tensor(
					"int64",
					BigInt64Array.from([BigInt(MIC_SAMPLE_RATE)]),
					[],
				),
			});
			prob = floatData(results.output)[0] ?? prob;
			state = floatData(results.stateN);
			context = window.slice(WINDOW_SAMPLES - CONTEXT_SAMPLES);
		}
		return prob;
	};
}
