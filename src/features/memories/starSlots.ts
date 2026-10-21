export const STAR_SLOTS = [
	[10, 23],
	[28, 14],
	[42, 26],
	[64, 15],
	[90, 14],
	[74, 38],
	[89, 50],
	[18, 47],
	[49, 44],
	[57, 8],
	[35, 56],
	[8, 65],
] as const;

const HOME_MAX_X = 50;

export type Memory = { id: number; content: string; contentAr?: string };

export type Star = Memory & { x: number; y: number; group: "home" | "daily" };

export function placeStars(memories: Memory[]): Star[] {
	const taken = new Set<number>();
	return memories.slice(-STAR_SLOTS.length).map((memory) => {
		let slot = (memory.id - 1) % STAR_SLOTS.length;
		while (taken.has(slot)) slot = (slot + 1) % STAR_SLOTS.length;
		taken.add(slot);
		const [x, y] = STAR_SLOTS[slot] ?? STAR_SLOTS[0];
		return { ...memory, x, y, group: x < HOME_MAX_X ? "home" : "daily" };
	});
}

export function starLinks(stars: Star[]) {
	return (["home", "daily"] as const).flatMap((group) => {
		const members = stars.filter((star) => star.group === group);
		return members.slice(1).flatMap((to, index) => {
			const from = members[index];
			return from ? [{ from, to }] : [];
		});
	});
}
