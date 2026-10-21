import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import { createAppServer } from "@server/app";
import { WS_MAX_PAYLOAD_BYTES } from "@server/config";
import { db } from "@server/db/client";
import { users } from "@server/db/schema";
import { createUser } from "@server/users/userStore";
import { SESSION_ENDED_CLOSE_CODE } from "@shared/protocol";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import WebSocket from "ws";

const server = createAppServer(null);
let url = "";
let httpBase = "";
let userId = "";

beforeAll(async () => {
	server.listen(0);
	await once(server, "listening");
	const port = (server.address() as AddressInfo).port;
	url = `ws://localhost:${port}/voice`;
	httpBase = `http://localhost:${port}`;
	userId = (await createUser("Test")).id;
});

afterAll(async () => {
	server.close();
	await db.delete(users).where(eq(users.id, userId));
	await db.$client.end();
});

const nextJson = async (socket: WebSocket) =>
	JSON.parse(String((await once(socket, "message"))[0]));

test("GET /healthz returns ok without a Start handler", async () => {
	const response = await fetch(`${httpBase}/healthz`);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("ok");
});

test("rejects a socket without a session cookie", async () => {
	const socket = new WebSocket(url);
	const [, response] = await once(socket, "unexpected-response");
	expect(response.statusCode).toBe(401);
});

test("greets by name, answers ping, rejects bad messages", async () => {
	const socket = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	expect(await nextJson(socket)).toEqual({ type: "ready", name: "Test" });
	socket.send(JSON.stringify({ type: "ping", t: 42 }));
	expect(await nextJson(socket)).toEqual({ type: "pong", t: 42 });
	socket.send("not json");
	expect(await nextJson(socket)).toEqual({
		type: "error",
		code: "bad_message",
	});
	socket.close();
});

test("an oversized frame closes the socket and the server keeps accepting connections", async () => {
	const socket = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	expect(await nextJson(socket)).toEqual({ type: "ready", name: "Test" });
	socket.send(Buffer.alloc(WS_MAX_PAYLOAD_BYTES + 1));
	const [code] = await once(socket, "close");
	expect(code).toBe(1009);

	const next = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	expect(await nextJson(next)).toEqual({ type: "ready", name: "Test" });
	next.close();
});

test("a socket reset during the async user lookup does not crash the server", async () => {
	const { port } = server.address() as AddressInfo;
	const raw = connect(port, "localhost");
	await once(raw, "connect");
	raw.write(
		"GET /voice HTTP/1.1\r\n" +
			"Host: localhost\r\n" +
			"Upgrade: websocket\r\n" +
			"Connection: Upgrade\r\n" +
			"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
			"Sec-WebSocket-Version: 13\r\n" +
			"Cookie: sid=4b0f4c1e-8a57-4c1a-9a8e-000000000000\r\n\r\n",
	);
	raw.destroy();

	const next = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	expect(await nextJson(next)).toEqual({ type: "ready", name: "Test" });
	next.close();
});

test("when two upgrades for one user race, only the newer one stays", async () => {
	const older = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	const olderEnd = new Promise<number>((resolve) => {
		older.once("unexpected-response", (_req, response) =>
			resolve(response.statusCode ?? 0),
		);
		older.once("close", resolve);
	});
	const newer = new WebSocket(url, { headers: { cookie: `sid=${userId}` } });
	expect(await nextJson(newer)).toEqual({ type: "ready", name: "Test" });
	expect([409, SESSION_ENDED_CLOSE_CODE]).toContain(await olderEnd);
	expect(newer.readyState).toBe(WebSocket.OPEN);
	newer.close();
});
