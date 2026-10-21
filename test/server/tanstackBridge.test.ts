import type { AddressInfo } from "node:net";
import { sendFetchResponse, toFetchRequest } from "@server/tanstackBridge";
import express from "express";
import { afterAll, expect, test } from "vitest";

const app = express();
app.get("/broken", (_req, res) => {
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("partial"));
			controller.error(new Error("render failed"));
		},
	});
	sendFetchResponse(new Response(body), res);
});
app.use(async (req, res) => {
	const request = toFetchRequest(req);
	const body = request.method === "POST" ? await request.text() : "";
	const headers = new Headers({ "content-type": "text/plain" });
	headers.append("set-cookie", "a=1; Path=/");
	headers.append("set-cookie", "b=2; Path=/");
	sendFetchResponse(
		new Response(`${request.method} ${new URL(request.url).pathname} ${body}`, {
			status: 201,
			headers,
		}),
		res,
	);
});
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

test("forwards method, path, and body, and returns every set-cookie", async () => {
	const response = await fetch(`${base}/hello?x=1`, {
		method: "POST",
		body: "payload",
	});
	expect(response.status).toBe(201);
	expect(await response.text()).toBe("POST /hello payload");
	expect(response.headers.getSetCookie()).toEqual([
		"a=1; Path=/",
		"b=2; Path=/",
	]);
});

test("a failing response stream aborts that response and the server keeps serving", async () => {
	await expect(
		fetch(`${base}/broken`).then((response) => response.text()),
	).rejects.toThrow();
	expect((await fetch(`${base}/after`)).status).toBe(201);
});
