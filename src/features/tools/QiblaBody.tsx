import type { Lang, QiblaCard } from "@shared/protocol";
import type { RefObject } from "react";
import { LOCALES } from "@/features/sky/localClock";
import { translate } from "@/i18n/strings";
import { compassPoint } from "./toolLabels";

type QiblaBodyProps = {
	qibla: QiblaCard;
	lang: Lang;
	titleRef: RefObject<HTMLHeadingElement | null>;
};

const CENTER = 48;
const TICKS = Array.from({ length: 16 }, (_, i) => i * 22.5);

export const QiblaBody = ({ qibla, lang, titleRef }: QiblaBodyProps) => {
	const t = translate(lang);
	const number = new Intl.NumberFormat(LOCALES[lang]);
	const bearing = `${number.format(qibla.bearing)}°`;
	return (
		<>
			<div className="weather-current">
				<div>
					<h2 id="weather-title" ref={titleRef} tabIndex={-1}>
						{lang === "ar" ? qibla.cityAr : qibla.city}
					</h2>
					<p className="qibla-heading">
						<span dir="ltr">{bearing}</span> {t(compassPoint(qibla.bearing))}
					</p>
				</div>
				<svg
					className="qibla-compass"
					viewBox="0 0 96 96"
					role="img"
					aria-label={`${t("qiblaTitle")}: ${qibla.bearing}°`}
					shapeRendering="crispEdges"
				>
					<path fill="#302d45" d="M0 0h96v96H0z" />
					<circle cx={CENTER} cy={CENTER} r="40" fill="#221f33" />
					{TICKS.map((angle) => (
						<rect
							key={angle}
							x={CENTER - 1}
							y="9"
							width="2"
							height={angle % 90 === 0 ? 6 : 3}
							fill={angle === 0 ? "#e8c48b" : "#716374"}
							transform={`rotate(${angle} ${CENTER} ${CENTER})`}
						/>
					))}
					<text x={CENTER} y="24" textAnchor="middle" className="qibla-north">
						N
					</text>
					<g
						className="qibla-needle"
						transform={`rotate(${qibla.bearing} ${CENTER} ${CENTER})`}
					>
						<path fill="#e8c48b" d="M46 26h4v22h-4z" />
						<path fill="#716374" d="M46 48h4v14h-4z" />
						<path fill="#e8c48b" d="M40 12h16v16H40z" />
						<path fill="#11101a" d="M42 14h12v12H42z" />
						<path fill="#e8c48b" d="M42 17h12v2H42z" />
					</g>
					<path fill="#f2e5c9" d="M45 45h6v6h-6z" />
				</svg>
			</div>
			<dl className="weather-details qibla-details">
				<div>
					<dt>{t("qiblaBearing")}</dt>
					<dd dir="ltr">{bearing}</dd>
				</div>
				<div>
					<dt>{t("qiblaDistance")}</dt>
					<dd>{`${number.format(qibla.distanceKm)} ${t("kilometers")}`}</dd>
				</div>
			</dl>
			<p className="weather-sample">{t("qiblaNote")}</p>
		</>
	);
};
