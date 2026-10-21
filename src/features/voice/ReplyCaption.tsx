import type { Word } from "@shared/protocol";
import { Fragment, useEffect, useState } from "react";
import { wordFrame } from "./wordFrame";

export const ReplyCaption = ({
	words,
	startedAt,
}: {
	words: Word[];
	startedAt: number;
}) => {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		let frame = 0;
		const tick = (now: number) => {
			setElapsed(now - startedAt);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [startedAt]);

	const { pageWords, activeIndex } = wordFrame(words, elapsed);
	return pageWords.map((word, index) => (
		<Fragment key={`${word.startMs}-${word.text}`}>
			<span
				className={[
					elapsed >= word.startMs && "revealed",
					index === activeIndex && "active",
				]
					.filter(Boolean)
					.join(" ")}
			>
				{word.text}
			</span>{" "}
		</Fragment>
	));
};
