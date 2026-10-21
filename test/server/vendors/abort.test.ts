import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer, type Socket } from "node:net";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const hung = vi.hoisted(() => ({ url: "" }));

vi.mock("@server/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@server/config")>();
	return {
		...actual,
		get ELEVENLABS_URL() {
			return hung.url;
		},
	};
});

const { tts } = await import("@server/vendors/textToSpeech");

const sockets: Socket[] = [];
const server = createServer((socket) => sockets.push(socket));

beforeAll(async () => {
	server.listen(0);
	await once(server, "listening");
	hung.url = `ws://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
	for (const socket of sockets) socket.destroy();
	server.close();
});

async function* none(): AsyncGenerator<string> {}

const abortSoon = () => {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 50);
	return controller.signal;
};

test("aborting before the ElevenLabs socket connects rejects without crashing", async () => {
	const stream = tts({
		sentences: none(),
		lang: "ar",
		signal: abortSoon(),
	});
	await expect(stream.next()).rejects.toThrow();
});
