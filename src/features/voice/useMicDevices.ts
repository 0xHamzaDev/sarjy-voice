import { useCallback, useEffect, useRef, useState } from "react";
import { readStored, store } from "@/lib/storage";
import { listMics } from "./mic";

const MIC_STORAGE_KEY = "sarjy.mic";

export function useMicDevices() {
	const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
	const [micId, setMicId] = useState("");
	const micIdRef = useRef("");

	const refreshMics = useCallback(() => {
		listMics().then(setMics, () => {});
	}, []);

	useEffect(() => {
		const stored = readStored(MIC_STORAGE_KEY) ?? "";
		micIdRef.current = stored;
		setMicId(stored);
		refreshMics();
		navigator.mediaDevices?.addEventListener("devicechange", refreshMics);
		return () =>
			navigator.mediaDevices?.removeEventListener("devicechange", refreshMics);
	}, [refreshMics]);

	const selectMic = useCallback((deviceId: string) => {
		micIdRef.current = deviceId;
		setMicId(deviceId);
		store(MIC_STORAGE_KEY, deviceId);
	}, []);

	return { mics, micId, micIdRef, selectMic, refreshMics };
}
