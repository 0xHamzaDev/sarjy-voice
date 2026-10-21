import type { CurrencyCard, Lang } from "@shared/protocol";
import type { RefObject } from "react";
import { LOCALES } from "@/features/sky/localClock";
import { translate } from "@/i18n/strings";

type CurrencyBodyProps = {
	currency: CurrencyCard;
	lang: Lang;
	titleRef: RefObject<HTMLHeadingElement | null>;
};

const MAX_RATE_DIGITS = 4;

const money = (value: number, code: string, lang: Lang) =>
	new Intl.NumberFormat(LOCALES[lang], {
		style: "currency",
		currency: code,
	}).format(value);

export const CurrencyBody = ({
	currency,
	lang,
	titleRef,
}: CurrencyBodyProps) => {
	const t = translate(lang);
	const rate = new Intl.NumberFormat(LOCALES[lang], {
		maximumFractionDigits: MAX_RATE_DIGITS,
	}).format(currency.rate);
	const updated = new Intl.DateTimeFormat(LOCALES[lang], {
		dateStyle: "medium",
	}).format(new Date(currency.updatedAt));
	return (
		<>
			<div className="weather-current">
				<div>
					<h2 id="weather-title" ref={titleRef} tabIndex={-1}>
						{money(currency.amount, currency.from, lang)}
					</h2>
					<p className="currency-result">
						{money(currency.result, currency.to, lang)}
					</p>
				</div>
			</div>
			<dl className="weather-details currency-details">
				<div>
					<dt>{t("exchangeRate")}</dt>
					<dd dir="ltr">{`1 ${currency.from} = ${rate} ${currency.to}`}</dd>
				</div>
				<div>
					<dt>{t("ratesUpdated")}</dt>
					<dd>{updated}</dd>
				</div>
			</dl>
			<p className="weather-sample">{t("currencyLive")}</p>
		</>
	);
};
