import { BrowserEngine } from "../browser/browserEngine.js";
import { BlockDetector } from "./blockDetector.js";

const browserEngine = new BrowserEngine();
const blockDetector = new BlockDetector();

export default async function fetchPage(url, options = {}) {
	try {
		return await browserEngine.runWithPage(
			{
				sourceName: options.sourceName || "legacy-fetch",
				timeoutMs: Number(options.timeout || 20000),
				reuseContext: options.reuseContext !== false,
			},
			async (page) => {
				const response = await page.goto(url, {
					waitUntil: options.waitUntil || "domcontentloaded",
					timeout: Number(options.timeout || 20000),
				});

				const block = await blockDetector.detect(page, response);
				if (block.detected) {
					handleBlockedResponse(url, `${block.type}: ${block.reason}`, options);
					return null;
				}

				return page.content();
			},
		);
	} catch (error) {
		console.error(`❌ Error navegando ${url}:`, error.message);
		return null;
	}
}

function handleBlockedResponse(url, reason, options) {
	console.warn(`🚫 Posible bloqueo detectado en ${url}: ${reason}`);
	if (typeof options.onBlocked === "function") {
		options.onBlocked(reason);
	}
}

export const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export const randomSleep = (minMs, maxMs) => {
	const delay = minMs + Math.random() * (maxMs - minMs);
	return sleep(delay);
};
