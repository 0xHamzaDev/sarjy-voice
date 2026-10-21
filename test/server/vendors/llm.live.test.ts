import { chat, type LlmEvent } from "@server/vendors/llm";
import { expect, test } from "vitest";

const remember = {
	type: "function" as const,
	function: {
		name: "remember",
		description: "Save a lasting fact about the user.",
		parameters: {
			type: "object",
			properties: { fact: { type: "string" } },
			required: ["fact"],
		},
	},
};

const run = async (content: string, withTools: boolean) => {
	const events: LlmEvent[] = [];
	for await (const event of chat({
		messages: [
			{
				role: "system",
				content:
					"You are Sarjy. Reply in 1 short sentence. Reply in the user's language.",
			},
			{ role: "user", content },
		],
		tools: withTools ? [remember] : [],
		signal: AbortSignal.timeout(15000),
	}))
		events.push(event);
	return events;
};

test.skipIf(!process.env.LIVE)(
	"streams an Arabic reply",
	async () => {
		const events = await run("هلا، كيف حالك؟", false);
		const text = events
			.flatMap((event) => (event.type === "text" ? [event.text] : []))
			.join("");
		expect(text).toMatch(/[؀-ۿ]/);
	},
	20000,
);

test.skipIf(!process.env.LIVE)(
	"calls remember for a personal fact",
	async () => {
		const events = await run(
			"My favorite color is blue. Please remember that.",
			true,
		);
		const calls = events.flatMap((event) =>
			event.type === "tool_calls" ? event.calls : [],
		);
		expect(calls[0]?.name).toBe("remember");
		expect(JSON.parse(calls[0]?.arguments ?? "{}").fact).toMatch(/blue/i);
	},
	20000,
);
