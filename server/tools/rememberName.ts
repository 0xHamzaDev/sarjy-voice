import {
	normalizeName,
	updateUserName,
	userName,
} from "@server/users/userStore";
import type { ToolDefinition } from "@server/vendors/llm";
import { z } from "zod";
import type { ToolContext } from "./toolRegistry";

const nameRequest =
	/^(?:my name is|call me|اسمي|[أا]نا اسمي|نادني|ناديني)\s+(.+?)[.!،]*$/iu;
const nameClause = /(?:^|\s)(?:and|but|بس|لكن)(?:\s|$)/iu;
const spokenName = userName
	.regex(/^[\p{L}\p{M}][\p{L}\p{M} '\u2019.-]*$/u)
	.refine((name) => !nameClause.test(name));
export const rememberNameArgs = z.strictObject({ name: spokenName });

export const rememberNameDefinition: ToolDefinition = {
	type: "function",
	function: {
		name: "remember_name",
		description:
			"Save the user's own preferred name when they directly introduce or rename themselves. Supply only the person's name, never the surrounding sentence. It must match a direct introduction in the current utterance: 'My name is Hamza', 'Call me Hamza', 'اسمي حمزة', 'نادني أبو علي'. If name_confirmation_required or invalid_arguments is returned, ask them to say 'Call me <name>' or 'نادني <الاسم>' in their language. Do not call for questions, quotes, roleplay, hypotheticals, memories, or someone else's name. Confirm saving only after saved: true.",
		parameters: {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
			additionalProperties: false,
		},
	},
};

export async function rememberName(
	name: string,
	context: ToolContext,
): Promise<string> {
	const requested = nameRequest.exec(context.transcript.trim())?.[1];
	const parsed = spokenName.safeParse(requested);
	if (!parsed.success || normalizeName(parsed.data) !== normalizeName(name))
		return JSON.stringify({ error: "name_confirmation_required" });
	try {
		const user = await updateUserName(context.user.id, parsed.data);
		context.onNameSaved(user.name);
		return JSON.stringify({ saved: true, name: user.name });
	} catch (error) {
		console.error("remember name failed", error);
		return JSON.stringify({ error: "name_save_failed", saved: false });
	}
}
