import {
	GROQ_BASE_URL,
	LLM_MAX_TOKENS,
	LLM_MODEL,
	LLM_REASONING_EFFORT,
} from "@server/config";
import { env } from "@server/env";
import OpenAI from "openai";

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type ToolDefinition = OpenAI.Chat.ChatCompletionTool;
export type ToolCall = {
	id: string;
	name: string;
	arguments: string;
};
export type LlmEvent =
	| { type: "text"; text: string }
	| { type: "tool_calls"; calls: ToolCall[] };

type ChatInput = {
	messages: ChatMessage[];
	tools: ToolDefinition[];
	signal: AbortSignal;
};

const groq = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });

export async function* chat({
	messages,
	tools,
	signal,
}: ChatInput): AsyncGenerator<LlmEvent> {
	const stream = await groq.chat.completions.create(
		{
			model: LLM_MODEL,
			messages,
			tools: tools.length > 0 ? tools : undefined,
			stream: true,
			max_tokens: LLM_MAX_TOKENS,
			reasoning_effort: LLM_REASONING_EFFORT,
		},
		{ signal },
	);
	const calls = new Map<number, ToolCall>();
	for await (const chunk of stream) {
		const delta = chunk.choices[0]?.delta;
		if (delta?.content) yield { type: "text", text: delta.content };
		for (const call of delta?.tool_calls ?? []) {
			const current = calls.get(call.index) ?? {
				id: "",
				name: "",
				arguments: "",
			};
			calls.set(call.index, {
				id: call.id ?? current.id,
				name: current.name + (call.function?.name ?? ""),
				arguments: current.arguments + (call.function?.arguments ?? ""),
			});
		}
	}
	if (calls.size > 0) yield { type: "tool_calls", calls: [...calls.values()] };
}

export async function completeJson({
	model,
	messages,
	schema,
	signal,
}: {
	model: string;
	messages: ChatMessage[];
	schema: { name: string; schema: Record<string, unknown> };
	signal: AbortSignal;
}): Promise<string> {
	const response = await groq.chat.completions.create(
		{
			model,
			messages,
			response_format: {
				type: "json_schema",
				json_schema: { ...schema, strict: true },
			},
			reasoning_effort: LLM_REASONING_EFFORT,
		},
		{ signal },
	);
	return response.choices[0]?.message?.content ?? "";
}
