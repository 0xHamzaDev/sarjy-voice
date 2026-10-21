import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "@/styles/index.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "theme-color",
				content: "#151525",
			},
			{
				title: "Sarjy — a little closer to the stars",
			},
		],
		links: [
			{
				rel: "icon",
				href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23e6c790' d='M6 0h4v6h6v4h-6v6H6v-6H0V6h6z'/%3E%3C/svg%3E",
			},
			{
				rel: "stylesheet",
				href: "/assets/fonts.css",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "preload",
				as: "image",
				href: "/assets/saudi-host-speaking-v1.png",
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ar" dir="rtl">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
