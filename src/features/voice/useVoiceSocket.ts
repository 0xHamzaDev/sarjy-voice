import {
	type ClientMessage,
	type Coords,
	SESSION_ENDED_CLOSE_CODE,
	type ServerMessage,
} from "@shared/protocol";
import { type RefObject, useCallback, useEffect, useRef } from "react";

const PING_INTERVAL_MS = 10_000;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const GEO_OPTIONS: PositionOptions = {
	enableHighAccuracy: true,
	maximumAge: 600_000,
	timeout: 10_000,
};

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

type VoiceSocketOptions = {
	enabled: boolean;
	socketRef: RefObject<WebSocket | null>;
	send: (message: ClientMessage | ArrayBuffer) => boolean;
	rttRef: RefObject<number>;
	onMessage: (message: ServerMessage) => void;
	onBinary: (data: ArrayBuffer) => void;
	onClose: (willReconnect: boolean) => void;
	onCleanup: () => void;
};

export function useVoiceSocket({
	enabled,
	socketRef,
	send,
	rttRef,
	onMessage,
	onBinary,
	onClose,
	onCleanup,
}: VoiceSocketOptions) {
	const coordsRef = useRef<Coords | null>(null);
	const locatedRef = useRef(false);

	const locate = useCallback(() => {
		if (locatedRef.current) return;
		locatedRef.current = true;
		navigator.geolocation?.getCurrentPosition(
			({ coords }) => {
				coordsRef.current = { lat: coords.latitude, lon: coords.longitude };
				send({ type: "hello", tz: timeZone(), coords: coordsRef.current });
			},
			() => {},
			GEO_OPTIONS,
		);
	}, [send]);

	useEffect(() => {
		if (!enabled) return;
		let disposed = false;
		let attempt = 0;
		let pingTimer: number | undefined;
		let reconnectTimer: number | undefined;
		const ping = () => send({ type: "ping", t: performance.now() });

		const connect = () => {
			const protocol = location.protocol === "https:" ? "wss:" : "ws:";
			const socket = new WebSocket(`${protocol}//${location.host}/voice`);
			socket.binaryType = "arraybuffer";
			socketRef.current = socket;
			socket.onopen = () => {
				attempt = 0;
				send({ type: "hello", tz: timeZone(), coords: coordsRef.current });
				locate();
				ping();
				pingTimer = window.setInterval(ping, PING_INTERVAL_MS);
			};
			socket.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
				if (event.data instanceof ArrayBuffer) {
					onBinary(event.data);
					return;
				}
				const message = JSON.parse(event.data) as ServerMessage;
				if (message.type === "pong") {
					rttRef.current = performance.now() - message.t;
					return;
				}
				onMessage(message);
			};
			socket.onclose = (event) => {
				window.clearInterval(pingTimer);
				if (disposed) return;
				const willReconnect = event.code !== SESSION_ENDED_CLOSE_CODE;
				onClose(willReconnect);
				if (!willReconnect) return;
				reconnectTimer = window.setTimeout(
					connect,
					Math.min(
						BASE_RECONNECT_DELAY_MS * 2 ** attempt++,
						MAX_RECONNECT_DELAY_MS,
					),
				);
			};
		};

		connect();
		return () => {
			disposed = true;
			onCleanup();
			window.clearTimeout(reconnectTimer);
			window.clearInterval(pingTimer);
			socketRef.current?.close();
		};
	}, [
		enabled,
		socketRef,
		send,
		rttRef,
		onMessage,
		onBinary,
		onClose,
		onCleanup,
		locate,
	]);

	return { locate };
}
