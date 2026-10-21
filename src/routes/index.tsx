import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CampScreen } from "@/features/camp/CampScreen";
import { getMemories } from "@/features/memories/memories.functions";
import { getSky } from "@/features/sky/sky.functions";
import { ErrorChip } from "@/features/voice/ErrorChip";
import { getCurrentUser } from "@/features/welcome/user.functions";
import { useLang } from "@/i18n/useLang";

async function loadCamp() {
	const [user, sky] = await Promise.all([getCurrentUser(), getSky()]);
	const memories = user ? await getMemories() : [];
	return { user, sky, memories };
}

type CampData = Awaited<ReturnType<typeof loadCamp>>;

const EMPTY_CAMP: CampData = {
	user: null,
	sky: { times: null, place: null },
	memories: [],
};

export const Route = createFileRoute("/")({
	loader: async ({ cause }) => {
		const data = loadCamp();
		if (cause === "stay") await data;
		return { data };
	},
	component: Home,
	errorComponent: LoadError,
});

function LoadError() {
	const router = useRouter();
	const [lang] = useLang();
	return (
		<main id="world">
			<ErrorChip
				code="load_failed"
				lang={lang}
				onRetry={() => router.invalidate()}
			/>
		</main>
	);
}

function Home() {
	const { data: pending } = Route.useLoaderData();
	const [data, setData] = useState<CampData | null>(null);
	const [error, setError] = useState<{ cause: unknown } | null>(null);

	useEffect(() => {
		let current = true;
		void pending.then(
			(value) => current && setData(value),
			(cause) => current && setError({ cause }),
		);
		return () => {
			current = false;
		};
	}, [pending]);

	if (error) throw error.cause;
	return <CampScreen {...(data ?? EMPTY_CAMP)} loading={data === null} />;
}
