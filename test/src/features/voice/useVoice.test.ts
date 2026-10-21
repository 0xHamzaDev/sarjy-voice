import { SESSION_ENDED_CLOSE_CODE, type ServerMessage } from "@shared/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { useVoice as mountVoice } from "@/features/voice/useVoice";
import type { VoiceState } from "@/features/voice/voiceState";

const mocks = vi.hoisted(() => ({
	effects: [] as (() => undefined | (() => void))[],
	startMic: vi.fn(),
	resume: vi.fn().mockResolvedValue(undefined),
	cue: vi.fn(),
	play: vi.fn(),
	stop: vi.fn(),
	state: null as VoiceState | null,
	stateValues: [] as unknown[],
	stateIndex: 0,
	socket: null as {
		readyState: number;
		onmessage?: (event: { data: string | ArrayBuffer }) => void;
		onclose?: (event: { code: number }) => void;
	} | null,
	send: vi.fn(),
}));

vi.mock("react", () => ({
	useState: (value: unknown) => {
		const index = mocks.stateIndex++;
		let current = mocks.stateValues[index] ?? value;
		const set = (next: unknown) => {
			current = typeof next === "function" ? next(current) : next;
			mocks.stateValues[index] = current;
			if (current && typeof current === "object" && "connection" in current)
				mocks.state = current as VoiceState;
		};
		set(current);
		return [current, set];
	},
	useRef: (current: unknown) => ({ current }),
	useCallback: (callback: unknown) => callback,
	useEffect: (effect: () => undefined | (() => void)) =>
		mocks.effects.push(effect),
}));
vi.mock("@/features/voice/mic", () => ({
	startMic: mocks.startMic,
	listMics: () => Promise.resolve([]),
}));
vi.mock("@/lib/storage", () => ({
	readStored: () => null,
	store: vi.fn(),
}));
vi.mock("@/features/voice/audioPlayer", () => ({
	createAudioPlayer: (
		_onFirstPlay: unknown,
		onPlaying: (playing: boolean) => void,
	) => {
		let playing = false;
		return {
			play: (chunk: ArrayBuffer) => {
				mocks.play(chunk);
				if (!playing) onPlaying(true);
				playing = true;
			},
			stop: () => {
				mocks.stop();
				if (playing) onPlaying(false);
				playing = false;
			},
			expectTurn: vi.fn(),
			suspended: () => false,
			resume: mocks.resume,
			playConnectCue: mocks.cue,
			close: vi.fn(),
		};
	},
}));

let effects: (() => undefined | (() => void))[] = [];
let cleanups: (() => void)[] = [];

function runEffects() {
	cleanups = effects.flatMap((effect) => {
		const cleanup = effect();
		return cleanup ? [cleanup] : [];
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function mount() {
	mocks.stateValues = [];
	mocks.stateIndex = 0;
	class Socket {
		static OPEN = 1;
		onmessage?: (event: { data: string | ArrayBuffer }) => void;
		onclose?: (event: { code: number }) => void;
		constructor() {
			mocks.socket = this;
		}
		readyState = Socket.OPEN;
		send = mocks.send;
		close = vi.fn();
	}
	vi.stubGlobal("WebSocket", Socket);
	vi.stubGlobal("window", new EventTarget());
	vi.stubGlobal(
		"document",
		Object.assign(new EventTarget(), { hidden: false }),
	);
	vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
	vi.stubGlobal("navigator", { mediaDevices: new EventTarget() });
	window.clearInterval = clearInterval;
	window.clearTimeout = clearTimeout;
	window.setTimeout = setTimeout;
	const voice = mountVoice(true);
	effects = mocks.effects.splice(0);
	runEffects();
	return voice;
}

function readVoice() {
	mocks.stateIndex = 0;
	const voice = mountVoice(true);
	mocks.effects.length = 0;
	return voice;
}

afterEach(() => {
	for (const cleanup of cleanups) cleanup();
	cleanups = [];
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function receive(data: ArrayBuffer | ServerMessage) {
	mocks.socket?.onmessage?.({
		data: data instanceof ArrayBuffer ? data : JSON.stringify(data),
	});
}

test("connects during entrance, buffers greeting in order, and opens the mic after playback", async () => {
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	const seat = deferred<boolean>();
	const start = voice.startCall("ar", seat.promise);
	expect(mocks.resume).toHaveBeenCalledOnce();
	expect(mocks.startMic).toHaveBeenCalledOnce();
	await voice.startCall("ar", seat.promise);
	await vi.waitFor(() =>
		expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify({ type: "call", action: "start", lang: "ar" }),
		),
	);
	expect(mocks.cue).toHaveBeenCalledOnce();
	const chunks = [new ArrayBuffer(2), new ArrayBuffer(4)];
	receive({ type: "turn", turnId: "greeting" });
	for (const chunk of chunks) receive(chunk);
	const frame = new ArrayBuffer(8);
	const onFrame = mocks.startMic.mock.calls[0]?.[1] as (
		pcm: ArrayBuffer,
	) => void;
	onFrame(frame);
	expect(mocks.send).toHaveBeenCalledTimes(1);
	expect(mocks.play).not.toHaveBeenCalled();
	seat.resolve(true);
	await start;
	expect(mocks.play.mock.calls).toEqual(chunks.map((chunk) => [chunk]));
	onFrame(frame);
	expect(mocks.send).toHaveBeenLastCalledWith(frame);
	const next = new ArrayBuffer(10);
	receive(next);
	expect(mocks.play).toHaveBeenLastCalledWith(next);
});

test.each([
	"entrance",
	"end",
	"hidden",
	"pagehide",
	"socket",
	"unmount",
])("%s discards a buffered greeting and blocks late playback", async (reason) => {
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	const seat = deferred<boolean>();
	const start = voice.startCall("en", seat.promise);
	await vi.waitFor(() => expect(mocks.send).toHaveBeenCalled());
	receive({ type: "turn", turnId: "greeting" });
	receive(new ArrayBuffer(2));
	if (reason === "entrance") seat.resolve(false);
	if (reason === "end") voice.endCall();
	if (reason === "hidden") {
		Object.defineProperty(document, "hidden", { value: true });
		document.dispatchEvent(new Event("visibilitychange"));
	}
	if (reason === "pagehide") window.dispatchEvent(new Event("pagehide"));
	if (reason === "socket") mocks.socket?.onclose?.({ code: 1000 });
	if (reason === "unmount") {
		for (const cleanup of cleanups) cleanup();
		cleanups = [];
	}
	seat.resolve(true);
	await start;
	receive({ type: "turn", turnId: "late" });
	receive(new ArrayBuffer(4));
	expect(mocks.play).not.toHaveBeenCalled();
	if (["entrance", "end", "hidden", "pagehide"].includes(reason))
		expect(mocks.send).toHaveBeenLastCalledWith(
			JSON.stringify({ type: "call", action: "end" }),
		);
});

test.each([
	"end",
	"hidden",
	"pagehide",
	"unmount",
])("%s invalidates an in-flight capture and stops its late stream", async (reason) => {
	const capture = deferred<{ stop: () => void; analyser: null }>();
	mocks.startMic.mockReturnValue(capture.promise);
	const voice = mount();
	const start = voice.startCall("en");
	if (reason === "end") voice.endCall();
	if (reason === "hidden") {
		Object.defineProperty(document, "hidden", { value: true });
		document.dispatchEvent(new Event("visibilitychange"));
	}
	if (reason === "pagehide") window.dispatchEvent(new Event("pagehide"));
	if (reason === "unmount") {
		for (const cleanup of cleanups) cleanup();
		cleanups = [];
	}
	mocks.send.mockClear();
	const stop = vi.fn();
	capture.resolve({ stop, analyser: null });
	await start;
	expect(stop).toHaveBeenCalledOnce();
	expect(mocks.send).not.toHaveBeenCalled();
	expect(mocks.cue).not.toHaveBeenCalled();
});

test.each([
	"older",
	"newer",
])("keeps only the latest microphone when the %s replacement resolves first", async (first) => {
	const initialStop = vi.fn();
	const older = deferred<{ stop: () => void; analyser: null }>();
	const newer = deferred<{ stop: () => void; analyser: null }>();
	mocks.startMic
		.mockResolvedValueOnce({ stop: initialStop, analyser: null })
		.mockReturnValueOnce(older.promise)
		.mockReturnValueOnce(newer.promise);
	const voice = mount();
	await voice.startCall("en");
	receive({ type: "turn", turnId: "greeting" });
	receive(new ArrayBuffer(2));
	const chooseOlder = voice.chooseMic("older");
	const chooseNewer = voice.chooseMic("newer");
	const olderStop = vi.fn();
	const newerStop = vi.fn();
	if (first === "older") {
		older.resolve({ stop: olderStop, analyser: null });
		await chooseOlder;
	}
	newer.resolve({ stop: newerStop, analyser: null });
	await chooseNewer;
	older.resolve({ stop: olderStop, analyser: null });
	await chooseOlder;
	expect(initialStop).toHaveBeenCalledOnce();
	expect(olderStop).toHaveBeenCalledOnce();
	expect(newerStop).not.toHaveBeenCalled();
	mocks.send.mockClear();
	const frame = new ArrayBuffer(8);
	for (const [, onFrame] of mocks.startMic.mock.calls) onFrame(frame);
	expect(mocks.send).toHaveBeenCalledExactlyOnceWith(frame);
	voice.endCall();
	expect(newerStop).toHaveBeenCalledOnce();
});

test("an obsolete microphone failure cannot end the current call", async () => {
	const older = deferred<{ stop: () => void; analyser: null }>();
	const stop = vi.fn();
	mocks.startMic
		.mockResolvedValueOnce({ stop: vi.fn(), analyser: null })
		.mockReturnValueOnce(older.promise)
		.mockResolvedValueOnce({ stop, analyser: null });
	const voice = mount();
	await voice.startCall("en");
	const chooseOlder = voice.chooseMic("older");
	await voice.chooseMic("newer");
	mocks.send.mockClear();
	older.reject(new Error("device unavailable"));
	await chooseOlder;
	expect(mocks.send).not.toHaveBeenCalled();
	expect(stop).not.toHaveBeenCalled();
	voice.endCall();
	expect(stop).toHaveBeenCalledOnce();
});

test("a disconnected text send leaves the transcript and playback untouched", () => {
	const voice = mount();
	receive({ type: "turn", turnId: "previous" });
	receive(new ArrayBuffer(2));
	const before = mocks.state;
	if (mocks.socket) mocks.socket.readyState = 3;
	expect(voice.sendText("Keep my draft")).toBe(false);
	expect(mocks.send).not.toHaveBeenCalled();
	expect(mocks.resume).not.toHaveBeenCalled();
	expect(mocks.stop).not.toHaveBeenCalled();
	expect(mocks.state).toBe(before);
});

test("an accepted text send stops the prior reply and drops its late audio", () => {
	const voice = mount();
	receive({ type: "turn", turnId: "previous" });
	receive(new ArrayBuffer(2));
	expect(voice.sendText("A new question")).toBe(true);
	expect(mocks.send).toHaveBeenCalledWith(
		JSON.stringify({ type: "text", text: "A new question" }),
	);
	expect(mocks.stop).toHaveBeenCalledOnce();
	expect(mocks.state?.lines.at(-1)?.text).toBe("A new question");
	receive(new ArrayBuffer(4));
	expect(mocks.play).toHaveBeenCalledOnce();
	receive({ type: "turn", turnId: "next" });
	receive(new ArrayBuffer(8));
	expect(mocks.play).toHaveBeenCalledTimes(2);
});

test("starting a call stops a typed reply before waiting for the greeting", async () => {
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	receive({ type: "turn", turnId: "typed" });
	receive(new ArrayBuffer(2));
	await voice.startCall("en");
	expect(mocks.stop).toHaveBeenCalledOnce();
	receive({ type: "reply", turnId: "typed", text: "Old reply" });
	receive(new ArrayBuffer(4));
	const onFrame = mocks.startMic.mock.calls[0]?.[1];
	mocks.send.mockClear();
	onFrame(new ArrayBuffer(8));
	expect(mocks.send).not.toHaveBeenCalled();
	receive({ type: "turn", turnId: "greeting" });
	receive(new ArrayBuffer(10));
	const frame = new ArrayBuffer(12);
	onFrame(frame);
	expect(mocks.send).toHaveBeenLastCalledWith(frame);
	expect(mocks.play).toHaveBeenCalledTimes(2);
});

test.each([
	"text reply",
	"interrupt",
	"typed question",
])("%s releases greeting capture without opening the mic during entrance", async (action) => {
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	const seat = deferred<boolean>();
	const start = voice.startCall("en", seat.promise);
	await vi.waitFor(() => expect(mocks.send).toHaveBeenCalled());
	receive({ type: "turn", turnId: "greeting" });
	if (action === "text reply") {
		receive({ type: "error", code: "tts_failed" });
		receive({ type: "reply", turnId: "greeting", text: "Hello" });
	} else if (action === "interrupt") voice.interrupt();
	else expect(voice.sendText("Skip the greeting")).toBe(true);
	mocks.send.mockClear();
	const onFrame = mocks.startMic.mock.calls[0]?.[1];
	const frame = new ArrayBuffer(8);
	onFrame(frame);
	expect(mocks.send).not.toHaveBeenCalled();
	seat.resolve(true);
	await start;
	onFrame(frame);
	expect(mocks.send).toHaveBeenCalledExactlyOnceWith(frame);
	if (action !== "text reply") {
		receive(new ArrayBuffer(2));
		expect(mocks.play).not.toHaveBeenCalled();
	}
});

test.each([
	"llm_failed",
	"rate_limited",
] as const)("%s before the greeting ends capture and permits a new call", async (code) => {
	const stop = vi.fn();
	mocks.startMic.mockResolvedValue({ stop, analyser: null });
	const voice = mount();
	await voice.startCall("en");
	receive({ type: "turn", turnId: "greeting" });
	receive({ type: "error", code });
	expect(stop).toHaveBeenCalledOnce();
	expect(mocks.state?.error).toBe(code);
	expect(mocks.send).toHaveBeenLastCalledWith(
		JSON.stringify({ type: "call", action: "end" }),
	);
	receive(new ArrayBuffer(2));
	expect(mocks.play).not.toHaveBeenCalled();
	await voice.startCall("en");
	expect(mocks.startMic).toHaveBeenCalledTimes(2);
});

test("typing during a pending microphone request cancels the later call start", async () => {
	const capture = deferred<{ stop: () => void; analyser: null }>();
	mocks.startMic.mockReturnValue(capture.promise);
	const voice = mount();
	const start = voice.startCall("en");
	expect(voice.sendText("Use text instead")).toBe(true);
	const stop = vi.fn();
	capture.resolve({ stop, analyser: null });
	await start;
	expect(stop).toHaveBeenCalledOnce();
	expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
		JSON.stringify({ type: "text", text: "Use text instead" }),
	);
	receive({ type: "turn", turnId: "typed" });
	receive(new ArrayBuffer(2));
	expect(mocks.play).toHaveBeenCalledOnce();
});

test("output resume failure does not report microphone denial or prevent capture", async () => {
	mocks.resume.mockRejectedValueOnce(new Error("output unavailable"));
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	await voice.startCall("en");
	expect(mocks.state?.micDenied).toBe(false);
	expect(mocks.send).toHaveBeenCalledWith(
		JSON.stringify({ type: "call", action: "start", lang: "en" }),
	);
	await expect(voice.resumeAudio()).resolves.toBeUndefined();
});

test("a socket closing during microphone permission cancels the unsent call", async () => {
	const capture = deferred<{ stop: () => void; analyser: null }>();
	mocks.startMic.mockReturnValueOnce(capture.promise);
	const voice = mount();
	const start = voice.startCall("en");
	if (mocks.socket) mocks.socket.readyState = 2;
	const stop = vi.fn();
	capture.resolve({ stop, analyser: null });
	await start;
	expect(stop).toHaveBeenCalledOnce();
	expect(mocks.cue).not.toHaveBeenCalled();
	expect(mocks.send).not.toHaveBeenCalled();
	expect(readVoice().connectFailed).toBe(true);
	if (mocks.socket) mocks.socket.readyState = 1;
	mocks.startMic.mockResolvedValueOnce({ stop: vi.fn(), analyser: null });
	await voice.startCall("en");
	expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
		JSON.stringify({ type: "call", action: "start", lang: "en" }),
	);
	expect(readVoice().connectFailed).toBe(false);
});

test.each([
	1006,
	SESSION_ENDED_CLOSE_CODE,
])("a greeted call closed with %s preserves appropriate retry feedback", async (code) => {
	mocks.startMic.mockResolvedValue({ stop: vi.fn(), analyser: null });
	const voice = mount();
	await voice.startCall("en");
	receive({ type: "turn", turnId: "greeting" });
	receive(new ArrayBuffer(2));
	mocks.socket?.onclose?.({ code });
	receive({ type: "ready", name: "Guest" });
	expect(readVoice().connectFailed).toBe(code !== SESSION_ENDED_CLOSE_CODE);
});

test("retry clears old errors while microphone permission is pending", async () => {
	mocks.startMic.mockRejectedValueOnce(new Error("permission denied"));
	const voice = mount();
	await voice.startCall("en");
	receive({ type: "error", code: "llm_failed" });
	expect(mocks.state?.micDenied).toBe(true);
	expect(mocks.state?.error).toBe("llm_failed");
	const capture = deferred<{ stop: () => void; analyser: null }>();
	mocks.startMic.mockReturnValueOnce(capture.promise);
	const retry = voice.startCall("en");
	expect(mocks.state?.micDenied).toBe(false);
	expect(mocks.state?.error).toBeNull();
	voice.endCall();
	capture.resolve({ stop: vi.fn(), analyser: null });
	await retry;
});

test("re-enabling hangs up the old call and ignores the replaced socket's late close", async () => {
	const oldStop = vi.fn();
	const newStop = vi.fn();
	mocks.startMic
		.mockResolvedValueOnce({ stop: oldStop, analyser: null })
		.mockResolvedValueOnce({ stop: newStop, analyser: null });
	const voice = mount();
	const replaced = mocks.socket;
	await voice.startCall("en");
	for (const cleanup of cleanups) cleanup();
	runEffects();
	expect(oldStop).toHaveBeenCalledOnce();
	expect(readVoice().call).toBe("off");
	await voice.startCall("en");
	replaced?.onclose?.({ code: 1006 });
	expect(newStop).not.toHaveBeenCalled();
	expect(readVoice().call).toBe("live");
});
