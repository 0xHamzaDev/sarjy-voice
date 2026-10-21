import { expect, test } from "vitest";
import {
	placeStars,
	STAR_SLOTS,
	starLinks,
} from "@/features/memories/starSlots";

const memory = (id: number) => ({ id, content: `m${id}` });

test("ids map to stable slots and groups split the sky", () => {
	const stars = placeStars([1, 2, 3, 4].map(memory));
	expect(stars.map(({ x, y, group }) => [x, y, group])).toEqual([
		[10, 23, "home"],
		[28, 14, "home"],
		[42, 26, "home"],
		[64, 15, "daily"],
	]);
});

test("deleting a memory keeps the other stars in place", () => {
	const before = placeStars([5, 6, 7].map(memory));
	const after = placeStars([5, 7].map(memory));
	expect(after[1]).toEqual(before[2]);
});

test("colliding ids probe to the next free slot", () => {
	const [first, second] = placeStars([1, 13].map(memory));
	expect([first?.x, first?.y]).toEqual([10, 23]);
	expect([second?.x, second?.y]).toEqual([28, 14]);
});

test("only the newest twelve memories get stars", () => {
	const stars = placeStars(Array.from({ length: 14 }, (_, i) => memory(i + 1)));
	expect(stars).toHaveLength(STAR_SLOTS.length);
	expect(stars[0]?.id).toBe(3);
	expect(new Set(stars.map((star) => `${star.x},${star.y}`)).size).toBe(12);
});

test("links join consecutive stars within a group", () => {
	const links = starLinks(placeStars([1, 2, 4, 3, 5].map(memory)));
	expect(links.map(({ from, to }) => [from.id, to.id])).toEqual([
		[1, 2],
		[2, 3],
		[4, 5],
	]);
});
