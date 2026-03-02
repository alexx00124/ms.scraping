import got from "got";

const USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0 Safari/537.36",
];

export function getRandomUserAgent() {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch mejorado usando got con user-agents rotativos, reintentos y mejor manejo de errores
 * Migrado desde feat/smart-search-by-career:scraping_udc_talento-main/utils/fetchPage.js
 */
export default async function fetchPage(url, options = {}) {
	try {
		console.log("📥 Fetching:", url);

		const response = await got(url, {
			headers: {
				"User-Agent": options.userAgent || getRandomUserAgent(),
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Encoding": "gzip, deflate, br",
				"Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Upgrade-Insecure-Requests": "1",
				...options.headers,
			},
			timeout: {
				request: options.timeout || 20000,
			},
			retry: {
				limit: options.retryLimit || 2,
				methods: ["GET"],
			},
			followRedirect: true,
			...options,
		});

		return response.body;
	} catch (error) {
		console.error(`❌ Error en ${url}:`, error.message);
		return null;
	}
}

/**
 * Sleep helper para delays entre requests
 */
export const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

/**
 * Sleep con tiempo aleatorio para simular comportamiento humano
 */
export const randomSleep = (minMs, maxMs) => {
	const delay = minMs + Math.random() * (maxMs - minMs);
	return sleep(delay);
};
