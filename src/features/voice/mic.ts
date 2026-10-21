import { MIC_SAMPLE_RATE } from "@shared/protocol";

const LEVEL_INTERVAL_MS = 100;
const LEVEL_FLOOR_DB = -60;
const ANALYSER_FFT_SIZE = 256;

export function levelOf(samples: Int16Array): number {
	if (samples.length === 0) return 0;
	let sum = 0;
	for (const sample of samples) sum += sample * sample;
	const rms = Math.sqrt(sum / samples.length) / 0x8000;
	const db = 20 * Math.log10(rms);
	return Math.min(1, Math.max(0, 1 - db / LEVEL_FLOOR_DB));
}

const AUDIO_PROCESSING = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
	channelCount: 1,
};

const openInput = (deviceId: string) =>
	navigator.mediaDevices.getUserMedia({
		audio: {
			...AUDIO_PROCESSING,
			deviceId: deviceId ? { ideal: deviceId } : undefined,
		},
	});

export async function listMics(): Promise<MediaDeviceInfo[]> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter(
		(device) => device.kind === "audioinput" && device.deviceId,
	);
}

export async function startMic(
	deviceId: string,
	onFrame: (pcm: ArrayBuffer) => void,
	onLevel: (level: number) => void,
): Promise<{ stop: () => void; analyser: AnalyserNode }> {
	const stream = await openInput(deviceId);
	let context: AudioContext | undefined;
	const stop = () => {
		for (const track of stream.getTracks()) track.stop();
		void context?.close();
	};
	try {
		context = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
		await context.audioWorklet.addModule("/capture-worklet.js");
		const source = context.createMediaStreamSource(stream);
		const node = new AudioWorkletNode(context, "capture-processor");
		const analyser = context.createAnalyser();
		analyser.fftSize = ANALYSER_FFT_SIZE;
		source.connect(analyser);
		let peak = 0;
		let lastLevelAt = 0;
		node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
			peak = Math.max(peak, levelOf(new Int16Array(event.data)));
			const now = performance.now();
			if (now - lastLevelAt >= LEVEL_INTERVAL_MS) {
				onLevel(peak);
				peak = 0;
				lastLevelAt = now;
			}
			onFrame(event.data);
		};
		source.connect(node);
		return {
			analyser,
			stop: () => {
				node.port.onmessage = null;
				node.disconnect();
				source.disconnect();
				stop();
			},
		};
	} catch (error) {
		stop();
		throw error;
	}
}
