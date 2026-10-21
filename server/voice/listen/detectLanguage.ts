import {
	CODE_SWITCH_MIN_MINORITY_RATIO,
	CODE_SWITCH_MIN_MINORITY_WORDS,
} from "@server/config";
import type { Lang } from "@shared/protocol";

export const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const LATIN_LETTER = /[A-Za-z]/;

function countScripts(text: string) {
	let arabic = 0;
	let latin = 0;
	for (const word of text.split(/\s+/)) {
		if (ARABIC_LETTER.test(word)) arabic++;
		else if (LATIN_LETTER.test(word)) latin++;
	}
	return { arabic, latin };
}

export function detectLanguage(text: string): Lang {
	const { arabic, latin } = countScripts(text);
	return arabic >= latin ? "ar" : "en";
}

export function isCodeSwitched(text: string): boolean {
	const { arabic, latin } = countScripts(text);
	const minority = Math.min(arabic, latin);
	return (
		minority >= CODE_SWITCH_MIN_MINORITY_WORDS &&
		minority / (arabic + latin) >= CODE_SWITCH_MIN_MINORITY_RATIO
	);
}
