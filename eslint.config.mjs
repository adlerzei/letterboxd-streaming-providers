import js from "@eslint/js";
import globals from "globals";

export default [
	{
		ignores: ["node_modules/**", "builds/**"],
	},
	js.configs.recommended,
	{
		// extension/worker.js runs as an MV3 service worker: it has extension
		// APIs (chrome/browser) plus fetch/crypto/console/atob/btoa, but no DOM
		// (no document/window).
		files: ["extension/worker.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.webextensions,
				...globals.serviceworker,
				// These files polyfill their own `browser` binding (`const browser
				// = chrome;`) for cross-browser compatibility, so the built-in
				// WebExtensions `browser` global must be turned off here to avoid
				// a false no-redeclare error on that polyfill.
				browser: "off",
			},
		},
	},
	{
		// Content scripts and the popup script run in a real DOM (document/window)
		// plus extension APIs (chrome/browser).
		files: ["extension/scripts/**/*.js", "extension/popup/**/*.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
				...globals.webextensions,
				// Same polyfill situation as worker.js above.
				browser: "off",
			},
		},
	},
];
