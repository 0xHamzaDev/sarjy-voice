import { SERVER_RESTART_CLOSE_CODE, SESSION_MAX_MS } from "@server/config";
import type { StoredLocation } from "@server/location";
import type { User } from "@server/users/userStore";
import {
	clientMessage,
	SESSION_ENDED_CLOSE_CODE,
	type ServerMessage,
} from "@shared/protocol";
import type { WebSocket } from "ws";
import { createTurnEngine } from "./turnEngine";

const liveSessions = new Map<string, (closeCode?: number) => void>();

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export function restartVoiceSessions(): void {
	for (const endSession of liveSessions.values())
		endSession(SERVER_RESTART_CLOSE_CODE);
}

export function startVoiceSession(
	socket: WebSocket,
	user: User,
	location: StoredLocation | null,
): void {
	liveSessions.get(user.id)?.();
	const session = new AbortController();
	const send = (data: string | Buffer) => {
		if (socket.readyState === socket.OPEN) socket.send(data);
	};
	const sendJson = (message: ServerMessage) => send(JSON.stringify(message));
	const endSession = (closeCode = SESSION_ENDED_CLOSE_CODE) => {
		session.abort();
		if (closeCode === SESSION_ENDED_CLOSE_CODE)
			sendJson({ type: "error", code: "session_expired" });
		socket.close(closeCode);
	};
	liveSessions.set(user.id, endSession);

	const engine = createTurnEngine({
		user,
		location,
		sessionSignal: session.signal,
		sendJson,
		writeAudio: send,
	});

	const expiry = setTimeout(() => endSession(), SESSION_MAX_MS);

	socket.on("error", (error) => console.error("voice socket error", error));

	socket.on("close", () => {
		clearTimeout(expiry);
		if (liveSessions.get(user.id) === endSession) liveSessions.delete(user.id);
		session.abort();
	});

	sendJson({ type: "ready", name: user.name });

	socket.on("message", (data, isBinary) => {
		if (session.signal.aborted) return;
		if (isBinary) {
			engine.write(
				Array.isArray(data)
					? Buffer.concat(data)
					: Buffer.isBuffer(data)
						? data
						: Buffer.from(data),
			);
			return;
		}
		const parsed = clientMessage.safeParse(parseJson(String(data)));
		if (!parsed.success) {
			sendJson({ type: "error", code: "bad_message" });
			return;
		}
		const message = parsed.data;
		if (message.type === "ping") sendJson({ type: "pong", t: message.t });
		else if (message.type === "hello")
			engine.setLocation(message.tz, message.coords);
		else if (message.type === "text") engine.startText(message.text);
		else if (message.type === "call") {
			if (message.action === "start") engine.startCall(message.lang);
			else if (message.action === "mute") engine.muteMic();
			else if (message.action === "unmute") engine.unmuteMic();
			else engine.endCall();
		} else
			engine.played(message.turnId, {
				rttMs: message.rttMs,
				playbackMs: message.playbackMs,
			});
	});
}
