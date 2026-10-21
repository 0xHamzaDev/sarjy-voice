import { afterEach, expect, test, vi } from "vitest";
import { createAudioPlayer } from "@/features/voice/audioPlayer";

afterEach(() => vi.unstubAllGlobals());

test("closing mid-reply stops scheduled audio and reports playback over", () => {
	const stop = vi.fn();
	vi.stubGlobal(
		"AudioContext",
		class {
			currentTime = 0;
			destination = {};
			createAnalyser = () => ({ connect: vi.fn() });
			createBuffer = (_channels: number, length: number) => ({
				duration: length,
				getChannelData: () => new Float32Array(length),
			});
			createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), stop });
			close = vi.fn().mockResolvedValue(undefined);
		},
	);
	const onPlaying = vi.fn();
	const player = createAudioPlayer(vi.fn(), onPlaying);
	player.play(new ArrayBuffer(4));
	expect(onPlaying).toHaveBeenLastCalledWith(true);
	player.close();
	expect(stop).toHaveBeenCalledOnce();
	expect(onPlaying).toHaveBeenLastCalledWith(false);
});
