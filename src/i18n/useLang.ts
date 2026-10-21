import { LANGS, type Lang } from "@shared/protocol";
import { useEffect } from "react";
import { useStored } from "@/lib/storage";

const LANG_STORAGE_KEY = "sarjy.lang";

export function useLang() {
	const [lang, setLang] = useStored<Lang>(LANG_STORAGE_KEY, "ar", LANGS);
	useEffect(() => {
		document.documentElement.lang = lang;
		document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
	}, [lang]);
	return [lang, setLang] as const;
}
