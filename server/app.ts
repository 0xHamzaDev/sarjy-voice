import { createServer, STATUS_CODES } from "node:http";
import { fileURLToPath } from "node:url";
import { findUser, sessionIdFromCookieHeader } from "@server/users/userStore";
import { startVoiceSession } from "@server/voice/session/voiceSession";
import express from "express";
import { WebSocketServer } from "ws";
import { WS_MAX_PAYLOAD_BYTES } from "./config";
import { locationFromCookieHeader } from "./location";
import {
	type FetchHandler,
	sendFetchResponse,
	toFetchRequest,
} from "./tanstackBridge";

const CLIENT_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));

export function createAppServer(startHandler: FetchHandler | null) {
	const app = express();
	app.set("trust proxy", true);
	app.get("/healthz", (_req, res) => {
		res.send("ok");
	});
	if (startHandler) {
		app.use(express.static(CLIENT_DIR, { index: false }));
		app.use(async (req, res, next) => {
			try {
				sendFetchResponse(await startHandler.fetch(toFetchRequest(req)), res);
			} catch (error) {
				next(error);
			}
		});
	}

	const server = createServer(app);
	const sockets = new WebSocketServer({
		noServer: true,
		maxPayload: WS_MAX_PAYLOAD_BYTES,
	});
	const latestUpgrade = new Map<string, symbol>();

	server.on("upgrade", async (req, socket, head) => {
		socket.on("error", (error) => {
			console.error("voice upgrade socket error", error);
			socket.destroy();
		});
		const refuse = (status: number) => {
			socket.end(
				`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`,
			);
		};
		if (new URL(req.url ?? "/", "http://localhost").pathname !== "/voice") {
			socket.destroy();
			return;
		}
		const id = sessionIdFromCookieHeader(req.headers.cookie);
		const request = Symbol();
		if (id) latestUpgrade.set(id, request);
		try {
			const user = id ? await findUser(id) : null;
			if (!user) return refuse(401);
			if (latestUpgrade.get(user.id) !== request) return refuse(409);
			sockets.handleUpgrade(req, socket, head, (ws) =>
				startVoiceSession(
					ws,
					user,
					locationFromCookieHeader(req.headers.cookie),
				),
			);
		} catch (error) {
			console.error("voice upgrade failed", error);
			refuse(503);
		} finally {
			if (id && latestUpgrade.get(id) === request) latestUpgrade.delete(id);
		}
	});

	return server;
}
