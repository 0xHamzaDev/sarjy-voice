import type { Lang } from "@shared/protocol";
import { useEffect, useRef, useState } from "react";
import { translate } from "@/i18n/strings";
import { type Star, starLinks } from "./starSlots";

type ConstellationProps = {
	stars: Star[];
	lang: Lang;
	selected: number | null;
	onSelect: (id: number | null) => void;
	newId: number | null;
	referencedId: number | null;
	onNewStar: (point: { x: number; y: number }) => void;
};

const contentOf = (star: Star, lang: Lang) =>
	lang === "ar" ? (star.contentAr ?? star.content) : star.content;

export const Constellation = ({
	stars,
	lang,
	selected,
	onSelect,
	newId,
	referencedId,
	onNewStar,
}: ConstellationProps) => {
	const t = translate(lang);
	const sectionRef = useRef<HTMLElement>(null);
	const formedRef = useRef<number | null>(null);
	const [dismissed, setDismissed] = useState<number | null>(null);

	useEffect(() => {
		if (
			newId === null ||
			formedRef.current === newId ||
			!stars.some((star) => star.id === newId)
		)
			return;
		const star = sectionRef.current?.querySelector(`[data-id="${newId}"]`);
		const world = sectionRef.current?.closest("#world");
		if (!star || !world) return;
		formedRef.current = newId;
		const point = star.getBoundingClientRect();
		const frame = world.getBoundingClientRect();
		onNewStar({
			x: ((point.left + point.width / 2 - frame.left) / frame.width) * 100,
			y: ((point.top + point.height / 2 - frame.top) / frame.height) * 100,
		});
	}, [newId, stars, onNewStar]);

	return (
		<section id="constellation" ref={sectionRef} aria-label={t("memoryLabel")}>
			<svg
				id="star-lines"
				aria-hidden="true"
				preserveAspectRatio="none"
				viewBox="0 0 100 100"
			>
				{starLinks(stars).map(({ from, to }) => (
					<line
						key={`${from.id}-${to.id}`}
						x1={from.x}
						y1={from.y}
						x2={to.x}
						y2={to.y}
						data-group={to.group}
						className={to.id === newId ? "new-link" : undefined}
					/>
				))}
			</svg>
			<div id="stars">
				{stars.map((star) => {
					const open = selected === star.id;
					const content = contentOf(star, lang);
					const classes = [
						"memory-star",
						star.id === newId && "new",
						star.id === referencedId && "referenced",
						star.id === dismissed && "dismissed",
					];
					return (
						<button
							key={star.id}
							type="button"
							className={classes.filter(Boolean).join(" ")}
							data-id={star.id}
							data-group={star.group}
							style={{ left: `${star.x}%`, top: `${star.y}%` }}
							aria-label={`${t("starLabel")}: ${content}`}
							aria-expanded={open}
							onPointerEnter={() => setDismissed(null)}
							onFocus={() => setDismissed(null)}
							onClick={() => {
								setDismissed(open ? star.id : null);
								onSelect(open ? null : star.id);
							}}
						>
							<span className="pixel-star" aria-hidden="true" />
							<span className="memory-tooltip" aria-hidden="true">
								<small>{t("starLabel")}</small>
								{content}
							</span>
						</button>
					);
				})}
			</div>
		</section>
	);
};
