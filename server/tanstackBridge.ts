import { pipeline, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";

export type FetchHandler = {
	fetch(request: Request): Response | Promise<Response>;
};

export function toFetchRequest(req: ExpressRequest): Request {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value))
			for (const item of value) headers.append(key, item);
		else if (value !== undefined) headers.set(key, value);
	}
	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	const init: RequestInit & { duplex: "half" } = {
		method: req.method,
		headers,
		body: hasBody
			? (Readable.toWeb(req) as ReadableStream<Uint8Array>)
			: undefined,
		duplex: "half",
	};
	return new Request(
		new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`),
		init,
	);
}

export function sendFetchResponse(
	response: Response,
	res: ExpressResponse,
): void {
	res.status(response.status);
	response.headers.forEach((value, key) => {
		if (key !== "set-cookie") res.setHeader(key, value);
	});
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
	if (!response.body) {
		res.end();
		return;
	}
	pipeline(
		Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
		res,
		(error) => {
			if (error) console.error("start response stream failed", error);
		},
	);
}
