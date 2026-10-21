import { useEffect, useRef } from "react";
import { quantizeWave } from "./callDisplay";
import type { HostState } from "./voiceState";

const WIDTH_PX = 200;
const HEIGHT_PX = 36;
const COLUMNS = 28;
const GAP_PX = 2;
const DECAY = 0.35;
const WAVE_GAIN = 2.4;
const MIN_BAR_PX = 2;
const IDLE_AMPLITUDE = 0.08;
const BREATHE_HZ = 0.5;
const CALLING_STEP_MS = 90;
const CALLING_FALLOFF = 0.3;
const COLOR_USER = "#e8c48b";
const COLOR_SARJY = "#bccfe8";
const COLOR_IDLE = "#8b7f95";
const COLOR_MUTED = "#4f4756";

type WaveMode = HostState | "muted" | "calling";

type CallWaveProps = {
	mode: WaveMode;
	micAnalyser: AnalyserNode | null;
	sarjyAnalyser: AnalyserNode | null;
	label: string;
};

export const CallWave = ({
	mode,
	micAnalyser,
	sarjyAnalyser,
	label,
}: CallWaveProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const heightsRef = useRef<number[]>(Array.from({ length: COLUMNS }, () => 0));

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = WIDTH_PX * dpr;
		canvas.height = HEIGHT_PX * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const analyser =
			mode === "speaking"
				? sarjyAnalyser
				: mode === "listening"
					? micAnalyser
					: null;
		const timeData = analyser ? new Uint8Array(analyser.fftSize) : null;
		const step = WIDTH_PX / COLUMNS;
		const barWidth = Math.max(1, Math.round(step - GAP_PX));
		let callingFrame = 0;
		let lastCallingStep = 0;
		let raf = 0;

		const targetsFor = (now: number): { targets: number[]; color: string } => {
			if (mode === "muted")
				return { targets: heightsRef.current.map(() => 0), color: COLOR_MUTED };
			if (mode === "calling") {
				if (now - lastCallingStep > CALLING_STEP_MS) {
					callingFrame = (callingFrame + 1) % COLUMNS;
					lastCallingStep = now;
				}
				return {
					targets: Array.from({ length: COLUMNS }, (_, i) =>
						Math.max(0, 1 - Math.abs(i - callingFrame) * CALLING_FALLOFF),
					),
					color: COLOR_USER,
				};
			}
			if (analyser && timeData) {
				analyser.getByteTimeDomainData(timeData);
				return {
					targets: quantizeWave(timeData, COLUMNS).map((peak) =>
						Math.min(1, Math.sqrt(peak) * WAVE_GAIN),
					),
					color: mode === "speaking" ? COLOR_SARJY : COLOR_USER,
				};
			}
			const breathe =
				0.5 + 0.5 * Math.sin((now / 1000) * BREATHE_HZ * Math.PI * 2);
			return {
				targets: Array.from(
					{ length: COLUMNS },
					() => IDLE_AMPLITUDE * breathe,
				),
				color: COLOR_IDLE,
			};
		};

		const paint = (now: number) => {
			const { targets, color } = targetsFor(now);
			const heights = heightsRef.current;
			ctx.clearRect(0, 0, WIDTH_PX, HEIGHT_PX);
			ctx.fillStyle = color;
			for (let i = 0; i < COLUMNS; i++) {
				const current = heights[i] ?? 0;
				const next = current + ((targets[i] ?? 0) - current) * DECAY;
				heights[i] = next;
				const barHeight = Math.max(
					MIN_BAR_PX,
					Math.round(next * (HEIGHT_PX / 2)),
				);
				const x = Math.round(i * step);
				const y = Math.round(HEIGHT_PX / 2 - barHeight);
				ctx.fillRect(x, y, barWidth, barHeight * 2);
			}
		};

		if (reduceMotion) {
			paint(performance.now());
			return;
		}
		const loop = (now: number) => {
			paint(now);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [mode, micAnalyser, sarjyAnalyser]);

	return (
		<canvas
			ref={canvasRef}
			className="call-wave"
			role="img"
			aria-label={label}
			style={{ width: WIDTH_PX, height: HEIGHT_PX }}
		/>
	);
};
