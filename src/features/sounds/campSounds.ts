const NOISE_SECONDS = 6;
const WIND_CUTOFF_HZ = 480;
const WIND_Q = 0.5;
const WIND_VOLUME = 0.065;
const BREATH_HZ = 0.075;
const BREATH_DEPTH = 0.018;

export type CampSounds = ReturnType<typeof createCampSounds>;

export function createCampSounds(onError: (error: unknown) => void) {
	let context: AudioContext | undefined;
	let wind: AudioBufferSourceNode | undefined;
	let breath: OscillatorNode | undefined;
	let enabled = false;
	let disposed = false;

	const audible = () => enabled && !document.hidden;

	async function sync(): Promise<void> {
		if (!context || disposed) return;
		const active = audible();
		try {
			await (active ? context.resume() : context.suspend());
			if (active !== audible()) await sync();
		} catch (error) {
			if (!disposed) {
				await cleanup().catch(() => {});
				throw error;
			}
		}
	}

	const visibility = () => {
		sync().catch(onError);
	};
	document.addEventListener("visibilitychange", visibility);

	async function cleanup() {
		if (disposed) return;
		disposed = true;
		enabled = false;
		document.removeEventListener("visibilitychange", visibility);
		for (const source of [wind, breath]) {
			source?.disconnect();
			try {
				source?.stop();
			} catch {}
		}
		if (context && context.state !== "closed") await context.close();
	}

	function start(audio: AudioContext) {
		const buffer = audio.createBuffer(
			1,
			audio.sampleRate * NOISE_SECONDS,
			audio.sampleRate,
		);
		const samples = buffer.getChannelData(0);
		for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
		wind = audio.createBufferSource();
		wind.buffer = buffer;
		wind.loop = true;
		const filter = audio.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = WIND_CUTOFF_HZ;
		filter.Q.value = WIND_Q;
		const volume = audio.createGain();
		volume.gain.value = WIND_VOLUME;
		wind.connect(filter).connect(volume).connect(audio.destination);
		breath = audio.createOscillator();
		breath.frequency.value = BREATH_HZ;
		const depth = audio.createGain();
		depth.gain.value = BREATH_DEPTH;
		breath.connect(depth).connect(volume.gain);
		wind.start();
		breath.start();
	}

	return {
		async setEnabled(value: boolean) {
			if (disposed) throw new Error("Ambience has been cleaned up.");
			try {
				enabled = value;
				if (enabled && !context) {
					context = new AudioContext();
					start(context);
				}
				await sync();
			} catch (error) {
				await cleanup().catch(() => {});
				throw error;
			}
		},
		cleanup,
	};
}
