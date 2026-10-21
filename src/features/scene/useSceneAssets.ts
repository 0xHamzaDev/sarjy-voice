import { useEffect, useState } from "react";

const SCENE_IMAGES = [
	"/assets/saudi-host-entrance-v2.png",
	"/assets/saudi-host-poses-v2.png",
	"/assets/saudi-host-speaking-v1.png",
	"/assets/saudi-coffee-set-v2.png",
	"/assets/falcon-poses.png",
];

export function useSceneAssets() {
	const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
	useEffect(() => {
		let active = true;
		void Promise.all([
			document.fonts.ready,
			...SCENE_IMAGES.map((src) => {
				const image = new Image();
				image.src = src;
				return image.decode();
			}),
		]).then(
			() => active && setState("ready"),
			() => active && setState("failed"),
		);
		return () => {
			active = false;
		};
	}, []);
	return state;
}
