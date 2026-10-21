import type { ToolCall, ToolDefinition } from "@server/vendors/llm";
import type { TurnContext } from "@server/voice/reply/runTurn";
import type { ToolResult } from "@shared/protocol";
import type { z } from "zod";
import { currencyArgs, currencyDefinition, currencyTool } from "./currency";
import {
	prayerArgs,
	prayerTimesDefinition,
	prayerTimesTool,
	todayIn,
} from "./prayerTimes";
import { qiblaDefinition, qiblaTool } from "./qibla";
import {
	rememberName,
	rememberNameArgs,
	rememberNameDefinition,
} from "./rememberName";
import { weatherArgs, weatherDefinition, weatherTool } from "./weather";

export type ToolContext = Pick<
	TurnContext,
	"user" | "transcript" | "coords" | "tz" | "signal" | "onNameSaved"
> & { onResult(result: ToolResult): void };

export const toolDefinitions: ToolDefinition[] = [
	rememberNameDefinition,
	prayerTimesDefinition,
	weatherDefinition,
	currencyDefinition,
	qiblaDefinition,
];

function parseArgs<T>(schema: z.ZodType<T>, raw: string): T | null {
	try {
		const parsed = schema.safeParse(JSON.parse(raw || "{}"));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export async function runTool(
	call: ToolCall,
	caller: ToolContext,
): Promise<string> {
	caller.signal.throwIfAborted();
	const context: ToolContext = {
		...caller,
		onResult: (result) => {
			if (!caller.signal.aborted) caller.onResult(result);
		},
	};
	if (call.name === "remember_name") {
		const args = parseArgs(rememberNameArgs, call.arguments);
		if (!args) return JSON.stringify({ error: "invalid_arguments" });
		return rememberName(args.name, context);
	}
	if (call.name === "prayer_times") {
		const args = parseArgs(prayerArgs, call.arguments);
		if (!args) return JSON.stringify({ error: "invalid_arguments" });
		return prayerTimesTool(
			args.date ?? todayIn(context.tz, new Date()),
			context,
		);
	}
	if (call.name === "weather") {
		const args = parseArgs(weatherArgs, call.arguments);
		if (!args) return JSON.stringify({ error: "invalid_arguments" });
		return weatherTool(args.city, context);
	}
	if (call.name === "currency") {
		const args = parseArgs(currencyArgs, call.arguments);
		if (!args) return JSON.stringify({ error: "invalid_arguments" });
		return currencyTool(args, context);
	}
	if (call.name === "qibla") return qiblaTool(context);
	return JSON.stringify({ error: "unknown_tool" });
}
