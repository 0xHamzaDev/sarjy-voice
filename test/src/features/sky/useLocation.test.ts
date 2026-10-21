import { afterEach, expect, test, vi } from "vitest";
import { useLocation as mountLocation } from "@/features/sky/useLocation";

const mocks = vi.hoisted(() => ({
	effect: null as (() => undefined | (() => void)) | null,
	invalidate: vi.fn(),
	setLocation: vi.fn(),
}));

vi.mock("react", () => ({
	useEffect: (effect: () => undefined | (() => void)) => {
		mocks.effect = effect;
	},
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("@/features/sky/sky.functions", () => ({
	setLocation: mocks.setLocation,
}));

type Located = (position: {
	coords: { latitude: number; longitude: number };
}) => Promise<void>;

function mount() {
	let located: Located = async () => {};
	vi.stubGlobal("navigator", {
		geolocation: {
			getCurrentPosition: (success: Located) => {
				located = success;
			},
		},
	});
	mountLocation();
	const cleanup = mocks.effect?.();
	return {
		locate: () =>
			located({ coords: { latitude: 24.71361, longitude: 46.6753 } }),
		cleanup: () => cleanup?.(),
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	mocks.invalidate.mockReset();
	mocks.setLocation.mockReset();
});

test("saves rounded coordinates and reloads the sky when they changed", async () => {
	mocks.setLocation.mockResolvedValue(true);
	await mount().locate();
	expect(mocks.setLocation.mock.calls[0]?.[0].data).toMatchObject({
		lat: 24.714,
		lon: 46.675,
	});
	expect(mocks.invalidate).toHaveBeenCalledOnce();
});

test("a position that arrives after unmount is ignored", async () => {
	const { locate, cleanup } = mount();
	cleanup();
	await locate();
	expect(mocks.setLocation).not.toHaveBeenCalled();
	expect(mocks.invalidate).not.toHaveBeenCalled();
});

test("unmounting while saving skips the reload", async () => {
	let save!: (changed: boolean) => void;
	mocks.setLocation.mockReturnValue(
		new Promise<boolean>((resolve) => {
			save = resolve;
		}),
	);
	const { locate, cleanup } = mount();
	const located = locate();
	cleanup();
	save(true);
	await located;
	expect(mocks.invalidate).not.toHaveBeenCalled();
});

test("a failed save is reported instead of rejecting unhandled", async () => {
	const failure = new Error("offline");
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.setLocation.mockRejectedValue(failure);
	await expect(mount().locate()).resolves.toBeUndefined();
	expect(log).toHaveBeenCalledWith("location save failed", failure);
});
