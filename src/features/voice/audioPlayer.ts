import { TTS_SAMPLE_RATE } from "@shared/protocol";

export type AudioPlayer = ReturnType<typeof createAudioPlayer>;

const UNDERRUN_GRACE_MS = 400;
const ANALYSER_FFT_SIZE = 256;
const CONNECT_CUE_FREQS_HZ = [660, 880];
const CONNECT_CUE_TONE_MS = 90;
const CONNECT_CUE_GAP_MS = 50;
const CONNECT_CUE_GAIN = 0.05;
const CONNECT_CUE_RAMP_S = 0.01;

export function createAudioPlayer(
	onFirstPlay: (playbackMs: number) => void,
	onPlaying: (playing: boolean) => void,
) {
	const context = new AudioContext();
	const analyser = context.createAnalyser();
	analyser.fftSize = ANALYSER_FFT_SIZE;
	analyser.connect(context.destination);
	let playhead = 0;
	const sources = new Set<AudioBufferSourceNode>();
	let awaitingFirst = false;
	let playing = false;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	const report = (next: boolean) => {
		clearTimeout(idleTimer);
		if (next === playing) return;
		playing = next;
		onPlaying(next);
	};

	const schedule = (pcm: ArrayBuffer) => {
		const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
		if (samples.length === 0) return;
		const buffer = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
		const channel = buffer.getChannelData(0);
		for (let i = 0; i < samples.length; i++)
			channel[i] = (samples[i] ?? 0) / 0x8000;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(analyser);
		const startAt = Math.max(context.currentTime, playhead);
		source.start(startAt);
		playhead = startAt + buffer.duration;
		report(true);
		sources.add(source);
		source.onended = () => {
			if (!sources.delete(source)) return;
			if (sources.size === 0)
				idleTimer = setTimeout(() => report(false), UNDERRUN_GRACE_MS);
		};
		if (awaitingFirst) {
			awaitingFirst = false;
			const outputLatency = context.outputLatency || context.baseLatency || 0;
			onFirstPlay((startAt - context.currentTime + outputLatency) * 1000);
		}
	};

	const stop = () => {
		for (const source of sources) source.stop();
		sources.clear();
		playhead = 0;
		awaitingFirst = false;
		report(false);
	};

	const playConnectCue = () => {
		const now = context.currentTime;
		CONNECT_CUE_FREQS_HZ.forEach((freq, index) => {
			const start =
				now + (index * (CONNECT_CUE_TONE_MS + CONNECT_CUE_GAP_MS)) / 1000;
			const end = start + CONNECT_CUE_TONE_MS / 1000;
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.frequency.value = freq;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(
				CONNECT_CUE_GAIN,
				start + CONNECT_CUE_RAMP_S,
			);
			gain.gain.linearRampToValueAtTime(0, end);
			oscillator.connect(gain).connect(context.destination);
			oscillator.start(start);
			oscillator.stop(end + CONNECT_CUE_RAMP_S);
		});
	};

	return {
		analyser,
		expectTurn() {
			awaitingFirst = true;
		},
		play: schedule,
		stop,
		resume: () => context.resume(),
		suspended: () => context.state !== "running",
		playConnectCue,
		close() {
			stop();
			void context.close();
		},
	};
}
