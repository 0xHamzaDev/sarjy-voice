import type { ClientMessage, Lang, ServerMessage } from "@shared/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AudioPlayer, createAudioPlayer } from "./audioPlayer";
import { startMic } from "./mic";
import { useMicDevices } from "./useMicDevices";
import { useVoiceSocket } from "./useVoiceSocket";
import {
	addUserLine,
	applyServerMessage,
	type CallEvent,
	type CallLifecycle,
	callPhase,
	callState,
	initialVoiceState,
	nextLifecycle,
	setPlaying,
} from "./voiceState";

const PREPARE_TIMEOUT_MS = 12_000;
const IDLE: CallLifecycle = { status: "off", ended: false };

export function useVoice(enabled: boolean) {
	const [state, setState] = useState(initialVoiceState);
	const [lifecycle, setLifecycle] = useState(IDLE);
	const { mics, micId, micIdRef, selectMic, refreshMics } = useMicDevices();
	const [level, setLevel] = useState(0);
	const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
	const [sarjyAnalyser, setSarjyAnalyser] = useState<AnalyserNode | null>(null);
	const [audioBlocked, setAudioBlocked] = useState(false);
	const [connectFailed, setConnectFailed] = useState(false);
	const [prepareTimedOut, setPrepareTimedOut] = useState(false);
	const socketRef = useRef<WebSocket | null>(null);
	const rttRef = useRef(0);
	const lifecycleRef = useRef(IDLE);
	const startGenerationRef = useRef(0);
	const captureGenerationRef = useRef(0);
	const greetingBufferRef = useRef<ArrayBuffer[] | null>(null);
	const acceptPlaybackRef = useRef(true);
	const playerRef = useRef<AudioPlayer | null>(null);
	const stopMicRef = useRef<(() => void) | null>(null);
	const turnRef = useRef<string | null>(null);
	const droppedTurnRef = useRef<string | null>(null);
	const call = callState(lifecycle);
	const phase = callPhase(lifecycle);

	const send = useCallback((message: ClientMessage | ArrayBuffer) => {
		const socket = socketRef.current;
		if (socket?.readyState !== WebSocket.OPEN) return false;
		socket.send(
			message instanceof ArrayBuffer ? message : JSON.stringify(message),
		);
		return true;
	}, []);

	const stopMic = useCallback(() => {
		captureGenerationRef.current++;
		stopMicRef.current?.();
		stopMicRef.current = null;
		setMicAnalyser(null);
		setLevel(0);
	}, []);

	const dispatch = useCallback((event: CallEvent) => {
		lifecycleRef.current = nextLifecycle(lifecycleRef.current, event);
		setLifecycle(lifecycleRef.current);
		if (callState(lifecycleRef.current) !== "live") setLevel(0);
	}, []);

	const hangUp = useCallback(() => {
		startGenerationRef.current++;
		greetingBufferRef.current = null;
		acceptPlaybackRef.current = false;
		playerRef.current?.stop();
		stopMic();
		dispatch("hangUp");
		setAudioBlocked(false);
		setState((current) => ({ ...current, thinking: false }));
	}, [stopMic, dispatch]);

	const interrupt = useCallback(() => {
		droppedTurnRef.current = turnRef.current;
		if (greetingBufferRef.current) greetingBufferRef.current.length = 0;
		playerRef.current?.stop();
		setState((current) => ({ ...current, thinking: false }));
		dispatch("greeted");
	}, [dispatch]);

	useEffect(() => {
		if (!enabled) return;
		const player = createAudioPlayer(
			(playbackMs) => {
				if (turnRef.current)
					send({
						type: "played",
						turnId: turnRef.current,
						playbackMs,
						rttMs: rttRef.current,
					});
			},
			(playing) => {
				setState((current) =>
					setPlaying(current, playing ? performance.now() : null),
				);
				if (!playing) return;
				dispatch("greeted");
				setAudioBlocked(player.suspended());
			},
		);
		playerRef.current = player;
		setSarjyAnalyser(player.analyser);
		return () => {
			playerRef.current = null;
			player.close();
			setSarjyAnalyser(null);
		};
	}, [enabled, send, dispatch]);

	const onBinary = useCallback((data: ArrayBuffer) => {
		if (
			!acceptPlaybackRef.current ||
			droppedTurnRef.current === turnRef.current
		)
			return;
		if (greetingBufferRef.current) greetingBufferRef.current.push(data);
		else playerRef.current?.play(data);
	}, []);

	const onMessage = useCallback(
		(message: ServerMessage) => {
			if (message.type === "turn") {
				if (!acceptPlaybackRef.current) return;
				if (greetingBufferRef.current) greetingBufferRef.current.length = 0;
				turnRef.current = message.turnId;
				playerRef.current?.expectTurn();
			}
			if (message.type === "stop") {
				if (greetingBufferRef.current) greetingBufferRef.current.length = 0;
				playerRef.current?.stop();
			}
			if (
				message.type === "reply" &&
				message.turnId === turnRef.current &&
				message.turnId !== droppedTurnRef.current
			)
				dispatch("greeted");
			const { status } = lifecycleRef.current;
			if (
				message.type === "error" &&
				(status === "connecting" || status === "preparing") &&
				(message.code === "llm_failed" || message.code === "rate_limited")
			) {
				send({ type: "call", action: "end" });
				hangUp();
				setConnectFailed(message.code === "llm_failed");
			}
			if (
				message.type === "error" &&
				(message.code === "mic_idle" || message.code === "session_expired")
			)
				hangUp();
			setState((current) => applyServerMessage(current, message));
		},
		[send, hangUp, dispatch],
	);

	const onClose = useCallback(
		(willReconnect: boolean) => {
			if (willReconnect && lifecycleRef.current.status !== "off")
				setConnectFailed(true);
			hangUp();
			if (willReconnect)
				setState((current) => ({ ...current, connection: "reconnecting" }));
		},
		[hangUp],
	);

	const { locate } = useVoiceSocket({
		enabled,
		socketRef,
		send,
		rttRef,
		onMessage,
		onBinary,
		onClose,
		onCleanup: hangUp,
	});

	const startCapture = useCallback(async () => {
		const generation = ++captureGenerationRef.current;
		const current = () => generation === captureGenerationRef.current;
		const live = () => current() && callState(lifecycleRef.current) === "live";
		try {
			const { stop, analyser } = await startMic(
				micIdRef.current,
				(frame) =>
					live() &&
					lifecycleRef.current.status === "ready" &&
					!greetingBufferRef.current &&
					send(frame),
				(value) => current() && setLevel(live() ? value : 0),
			);
			if (!current()) {
				stop();
				return;
			}
			stopMicRef.current = stop;
			setMicAnalyser(analyser);
			refreshMics();
		} catch (error) {
			if (current()) throw error;
		}
	}, [send, micIdRef, refreshMics]);

	const resumeAudio = useCallback(async () => {
		const player = playerRef.current;
		if (!player) return;
		try {
			await player.resume();
			setAudioBlocked(player.suspended());
		} catch {
			setAudioBlocked(true);
		}
	}, []);

	const startCall = useCallback(
		async (lang: Lang, entrance: Promise<boolean> = Promise.resolve(true)) => {
			if (
				lifecycleRef.current.status !== "off" ||
				socketRef.current?.readyState !== WebSocket.OPEN
			) {
				entrance.catch((error) => console.error("entrance failed", error));
				return;
			}
			interrupt();
			const generation = ++startGenerationRef.current;
			const current = () => generation === startGenerationRef.current;
			const cancel = () => {
				if (!current()) return false;
				if (lifecycleRef.current.status !== "connecting")
					send({ type: "call", action: "end" });
				hangUp();
				return false;
			};
			const seated = entrance.then((ready) => ready || cancel(), cancel);
			greetingBufferRef.current = [];
			acceptPlaybackRef.current = true;
			setConnectFailed(false);
			setState((current) => ({ ...current, error: null, micDenied: false }));
			dispatch("start");
			try {
				await Promise.all([resumeAudio(), startCapture()]);
				if (!current()) return;
				if (!send({ type: "call", action: "start", lang })) {
					cancel();
					setConnectFailed(true);
					return;
				}
				dispatch("connected");
				playerRef.current?.playConnectCue();
				locate();
				if (!(await seated) || !current()) return;
				const greeting = greetingBufferRef.current ?? [];
				greetingBufferRef.current = null;
				for (const chunk of greeting) playerRef.current?.play(chunk);
			} catch {
				if (!current()) return;
				cancel();
				setState((current) => ({ ...current, micDenied: true }));
			}
		},
		[startCapture, dispatch, send, locate, hangUp, interrupt, resumeAudio],
	);

	const toggleMute = useCallback(() => {
		if (!stopMicRef.current) return;
		const muted = callState(lifecycleRef.current) === "live";
		send({ type: "call", action: muted ? "mute" : "unmute" });
		dispatch("toggleMute");
	}, [send, dispatch]);

	const endCall = useCallback(() => {
		if (lifecycleRef.current.status === "off") return;
		send({ type: "call", action: "end" });
		dispatch("end");
		hangUp();
	}, [send, dispatch, hangUp]);

	useEffect(() => {
		if (phase !== "preparing") {
			setPrepareTimedOut(false);
			return;
		}
		const timer = window.setTimeout(
			() => setPrepareTimedOut(true),
			PREPARE_TIMEOUT_MS,
		);
		return () => window.clearTimeout(timer);
	}, [phase]);

	useEffect(() => {
		const onHidden = () => document.hidden && endCall();
		document.addEventListener("visibilitychange", onHidden);
		window.addEventListener("pagehide", endCall);
		return () => {
			document.removeEventListener("visibilitychange", onHidden);
			window.removeEventListener("pagehide", endCall);
		};
	}, [endCall]);

	const chooseMic = useCallback(
		async (deviceId: string) => {
			selectMic(deviceId);
			if (lifecycleRef.current.status === "off") return;
			stopMic();
			try {
				await startCapture();
			} catch {
				endCall();
				setState((current) => ({ ...current, micDenied: true }));
			}
		},
		[selectMic, stopMic, startCapture, endCall],
	);

	const sendText = useCallback(
		(text: string) => {
			if (!send({ type: "text", text })) return false;
			setConnectFailed(false);
			if (lifecycleRef.current.status === "connecting") hangUp();
			else interrupt();
			acceptPlaybackRef.current = true;
			void resumeAudio();
			locate();
			setState((current) => addUserLine(current, text));
			return true;
		},
		[send, locate, hangUp, interrupt, resumeAudio],
	);

	return {
		state,
		call,
		phase,
		prepareTimedOut,
		audioBlocked,
		resumeAudio,
		connectFailed,
		startCall,
		toggleMute,
		endCall,
		sendText,
		mics,
		micId,
		chooseMic,
		level,
		micAnalyser,
		sarjyAnalyser,
		interrupt,
	};
}
