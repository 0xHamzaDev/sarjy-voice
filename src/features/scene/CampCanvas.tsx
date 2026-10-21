import { type RefObject, useEffect, useRef } from "react";
import type { Phase } from "@/features/sky/skyPhase";
import { createScene, type Scene } from "./createScene";

const BREATH_PER_LEVEL = 0.007;

type CampCanvasProps = {
	phase: Phase;
	level: number;
	sceneRef: RefObject<Scene | null>;
	arrivalRef: RefObject<HTMLSpanElement | null>;
	label: string;
	pressed: boolean;
	hostName: string;
	onHost: () => void;
};

export const CampCanvas = ({
	phase,
	level,
	sceneRef,
	arrivalRef,
	label,
	pressed,
	hostName,
	onHost,
}: CampCanvasProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const propsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!canvasRef.current || !propsRef.current) return;
		const scene = createScene(canvasRef.current, propsRef.current);
		sceneRef.current = scene;
		return () => {
			scene.destroy();
			sceneRef.current = null;
		};
	}, [sceneRef]);

	useEffect(() => {
		sceneRef.current?.setPhase(phase);
	}, [phase, sceneRef]);

	useEffect(() => {
		sceneRef.current?.setLevel(level);
	}, [level, sceneRef]);

	return (
		<>
			<canvas id="landscape" ref={canvasRef} />
			<div id="camp-props" ref={propsRef}>
				<button
					id="companion"
					type="button"
					aria-describedby="mic-hint"
					aria-pressed={pressed}
					aria-label={label}
					onClick={onHost}
				>
					<span className="host-arrival" ref={arrivalRef} aria-hidden="true" />
					<span
						className="companion-sprite"
						aria-hidden="true"
						style={{ transform: `scaleY(${1 + level * BREATH_PER_LEVEL})` }}
					/>
					<span className="dallah-prop" aria-hidden="true" />
					<span className="host-name">{hostName}</span>
				</button>
				<div id="falcon-prop" aria-hidden="true" />
			</div>
		</>
	);
};
