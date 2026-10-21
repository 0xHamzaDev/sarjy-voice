import type { Lang, Word } from "@shared/protocol";
import { translate } from "@/i18n/strings";
import { ReplyCaption } from "./ReplyCaption";

type VoiceStageProps = {
	lang: Lang;
	name: string | null;
	showIdle: boolean;
	thinking: boolean;
	reply: { words: Word[]; startedAt: number | null; text: string } | null;
};

export const VoiceStage = ({
	lang,
	name,
	showIdle,
	thinking,
	reply,
}: VoiceStageProps) => {
	const t = translate(lang);
	return (
		<section className="voice" aria-labelledby="greeting">
			<div id="idle-message" hidden={!showIdle}>
				<h1 id="greeting">{`${t("greeting")} ${name || t("friend")}.`}</h1>
				<p>{t("invitation")}</p>
			</div>
			<div id="reply" dir="auto" hidden={!reply}>
				{reply &&
					(reply.words.length > 0 && reply.startedAt !== null ? (
						<ReplyCaption words={reply.words} startedAt={reply.startedAt} />
					) : (
						reply.text
					))}
			</div>
			<div id="thinking" hidden={!thinking} aria-hidden="true">
				<i />
				<i />
				<i />
			</div>
		</section>
	);
};
