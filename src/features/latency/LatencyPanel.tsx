import type { Lang } from "@shared/protocol";
import { useEffect, useRef } from "react";
import type { WaterfallData } from "@/features/voice/voiceState";
import { translate } from "@/i18n/strings";

type LatencyPanelProps = {
	lang: Lang;
	timings: WaterfallData | null;
	note: string;
	onClose: () => void;
};

export const LatencyPanel = ({
	lang,
	timings,
	note,
	onClose,
}: LatencyPanelProps) => {
	const t = translate(lang);
	const closeRef = useRef<HTMLButtonElement>(null);
	useEffect(() => closeRef.current?.focus(), []);
	const total = timings?.rows.reduce((sum, [, ms]) => sum + ms, 0) || 1;
	let offset = 0;
	return (
		<aside id="latency-panel" className="panel">
			<div className="panel-heading">
				<h2>{t("latencyTitle")}</h2>
				<button
					type="button"
					className="quiet close"
					aria-label={t("close")}
					ref={closeRef}
					onClick={onClose}
				>
					×
				</button>
			</div>
			<p>{note}</p>
			<div id="waterfall">
				{timings?.rows.map(([stage, ms]) => {
					const start = offset;
					offset += ms;
					return (
						<div key={stage} className="waterfall-row">
							<span>{stage}</span>
							<div className="waterfall-track">
								<div
									className="waterfall-bar"
									style={{
										width: `${(ms / total) * 100}%`,
										marginInlineStart: `${(start / total) * 100}%`,
									}}
								/>
							</div>
							<span>{`${ms}ms`}</span>
						</div>
					);
				})}
			</div>
			<div className="total">
				<span>TTFA</span>
				<span id="ttfa">
					{timings?.ttfaMs == null ? "—" : `${timings.ttfaMs} ms`}
				</span>
			</div>
		</aside>
	);
};
