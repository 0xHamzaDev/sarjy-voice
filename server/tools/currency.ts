import {
	EXCHANGE_RATES_CACHE_MS,
	EXCHANGE_RATES_URL,
	TOOL_TIMEOUT_MS,
} from "@server/config";
import type { ToolDefinition } from "@server/vendors/llm";
import { withTimeout } from "@server/withTimeout";
import type { CurrencyCard } from "@shared/protocol";
import { z } from "zod";
import type { ToolContext } from "./toolRegistry";

const MAX_AMOUNT = 1e12;
const RESULT_DECIMALS = 2;
const RATE_DECIMALS = 4;

const ratesResponse = z.object({
	result: z.literal("success"),
	time_last_update_utc: z.string(),
	rates: z.record(z.string(), z.number()),
});

type Rates = z.infer<typeof ratesResponse>;

const cache = new Map<string, { at: number; rates: Rates }>();

async function ratesFor(base: string, signal: AbortSignal): Promise<Rates> {
	const cached = cache.get(base);
	if (cached && Date.now() - cached.at < EXCHANGE_RATES_CACHE_MS)
		return cached.rates;
	const response = await fetch(`${EXCHANGE_RATES_URL}/${base}`, { signal });
	if (!response.ok) throw new Error(`exchange rates ${response.status}`);
	const rates = ratesResponse.parse(await response.json());
	cache.set(base, { at: Date.now(), rates });
	return rates;
}

const round = (value: number, digits: number) =>
	Math.round(value * 10 ** digits) / 10 ** digits;

async function convertCurrency(
	amount: number,
	from: string,
	to: string,
	signal: AbortSignal,
): Promise<CurrencyCard | null> {
	const { rates, time_last_update_utc } = await ratesFor(from, signal);
	const rate = rates[to];
	if (rate === undefined) return null;
	return {
		amount,
		from,
		to,
		result: round(amount * rate, RESULT_DECIMALS),
		rate: round(rate, RATE_DECIMALS),
		updatedAt: new Date(time_last_update_utc).toISOString(),
	};
}

const currencyCode = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/);

export const currencyArgs = z.object({
	amount: z.number().positive().max(MAX_AMOUNT).default(1),
	from: currencyCode,
	to: currencyCode.default("SAR"),
});

export const currencyDefinition: ToolDefinition = {
	type: "function",
	function: {
		name: "currency",
		description:
			"Convert an amount between currencies with live exchange rates. Use ISO 4217 codes (SAR for riyal, USD for dollar, EUR, AED, EGP, GBP...). Call only when the user asks to convert money or asks for an exchange rate. The conversion is shown on screen, so speak the result briefly.",
		parameters: {
			type: "object",
			properties: {
				amount: { type: "number" },
				from: { type: "string" },
				to: { type: "string" },
			},
			required: ["from"],
		},
	},
};

export async function currencyTool(
	args: z.infer<typeof currencyArgs>,
	context: ToolContext,
): Promise<string> {
	const signal = withTimeout(context.signal, TOOL_TIMEOUT_MS);
	try {
		const card = await convertCurrency(args.amount, args.from, args.to, signal);
		if (!card) return JSON.stringify({ error: "unknown_currency" });
		context.onResult({ kind: "currency", currency: card });
		return JSON.stringify(card);
	} catch (error) {
		if (context.signal.aborted) throw error;
		console.error("currency failed", error);
		return JSON.stringify({ error: "currency_unavailable" });
	}
}
