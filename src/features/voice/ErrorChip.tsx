import type { Lang } from "@shared/protocol";
import { ERRORS, type ErrorKey, translate } from "@/i18n/strings";

type ErrorChipProps = {
	code: ErrorKey | null;
	lang: Lang;
	onRetry: (() => void) | null;
};

export const ErrorChip = ({ code, lang, onRetry }: ErrorChipProps) => {
	if (!code) return null;
	const [ar, en, retry] = ERRORS[code];
	return (
		<div id="error-chip" role="alert">
			<span id="error-message">{lang === "ar" ? ar : en}</span>
			{onRetry && (
				<button id="retry" type="button" onClick={onRetry}>
					{translate(lang)(retry === "reload" ? "reload" : "retry")}
				</button>
			)}
		</div>
	);
};
