import type { Lang, Weather } from "@shared/protocol";
import type { RefObject } from "react";
import { timeLabel } from "@/features/sky/localClock";
import { translate } from "@/i18n/strings";
import { aqiLevel } from "./toolLabels";

type WeatherBodyProps = {
	weather: Weather;
	lang: Lang;
	titleRef: RefObject<HTMLHeadingElement | null>;
};

export const WeatherBody = ({ weather, lang, titleRef }: WeatherBodyProps) => {
	const t = translate(lang);
	return (
		<>
			<div className="weather-current">
				<div>
					<h2 id="weather-title" ref={titleRef} tabIndex={-1}>
						{lang === "ar" ? weather.cityAr : weather.city}
					</h2>
					<div className="temperature" dir="ltr">
						<span id="temperature">{weather.temperature}</span>
						<span className="degrees">°C</span>
					</div>
					<p id="weather-condition">
						{lang === "ar" ? weather.conditionAr : weather.condition}
					</p>
				</div>
				<svg
					className="weather-art"
					viewBox="0 0 112 88"
					aria-hidden="true"
					shapeRendering="crispEdges"
				>
					<path fill="#302d45" d="M0 0h112v88H0z" />
					<path fill="#f0d49b" d="M75 10h14v4h5v15h-5v5H75v-5h-5V14h5z" />
					<path fill="#302d45" d="M82 8h14v17H82v-5h-5v-7h5z" />
					<path
						fill="#c2a7a0"
						d="M14 14h2v2h-2zM46 26h2v2h-2zM24 35h2v2h-2zM99 46h2v2h-2z"
					/>
					<path
						fill="#8b6d79"
						d="M0 60h10v-3h12v-4h18v4h12v4h18v6h22v-4h20v25H0z"
					/>
					<path
						fill="#af8d89"
						d="M0 79h14v-3h14v-4h18v-5h14v-5h20v-4h14v4h18v26H0z"
					/>
					<path fill="#cfab91" d="M60 66h19v-4h15v2H80v4H60z" />
					<path fill="#675368" d="M0 75h14v3h14v4h20v6H0z" />
				</svg>
			</div>
			<dl className="weather-details">
				<div>
					<dt>{t("feelsLike")}</dt>
					<dd id="feels-like" dir="ltr">{`${weather.feelsLike}°`}</dd>
				</div>
				<div>
					<dt>{t("wind")}</dt>
					<dd id="weather-wind">{`${weather.windKmh} ${t("windUnit")}`}</dd>
				</div>
				<div>
					<dt>{t("humidity")}</dt>
					<dd id="weather-humidity" dir="ltr">{`${weather.humidity}%`}</dd>
				</div>
			</dl>
			{weather.air && (
				<p className="air-quality" data-level={aqiLevel(weather.air.aqi)}>
					<span className="air-chip" aria-hidden="true" />
					<span>{`${t("airQuality")}: ${t(aqiLevel(weather.air.aqi))}`}</span>
					<span dir="ltr">{`AQI ${weather.air.aqi}`}</span>
					<span>
						{`${t("dust")} `}
						<bdi dir="ltr">{`${weather.air.dust} µg/m³`}</bdi>
					</span>
				</p>
			)}
			<div id="weather-hours" className="weather-hours">
				{weather.hours.map((hour) => (
					<div key={hour.time}>
						<time dateTime={hour.time}>{timeLabel(hour.time, lang)}</time>
						<span>{`${hour.temperature}°`}</span>
					</div>
				))}
			</div>
			<p className="weather-sample">{t("weatherLive")}</p>
		</>
	);
};
