import { ScraperProvider } from "../../ports/scraperProvider.js";
import { ScrapingBlockedError } from "../../domain/scraping/blockTypes.js";

const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export class BaseBrowserScraper extends ScraperProvider {
	constructor({ browserEngine, blockDetector, policy }) {
		super();
		this.browserEngine = browserEngine;
		this.blockDetector = blockDetector;
		this.policy = policy;
	}

	getPolicy() {
		return this.policy;
	}

	async withSourcePage(url, options = {}, task) {
		if (!this.isAvailable()) {
			throw new ScrapingBlockedError(`${this.getSourceName()} en cooldown`, {
				reason: this.blockReason,
				blockedUntil: this.blockedUntil,
			});
		}

		const kind = options.kind || "detail";
		await sleep(this.policy.randomDelay(kind));

		return this.browserEngine.runWithPage(
			{
				sourceName: this.getSourceName(),
				timeoutMs: options.timeoutMs || this.policy.getTimeout(kind),
				reuseContext: options.reuseContext !== false,
			},
			async (page) => {
				const response = await page.goto(url, {
					waitUntil: options.waitUntil || this.policy.waitUntil,
					timeout: options.timeoutMs || this.policy.getTimeout(kind),
				});

				const block = await this.blockDetector.detect(page, response);
				if (block.detected) {
					this.block(`${block.type}: ${block.reason}`, this.policy.cooldownMs);
					await this.browserEngine.resetContext(this.getSourceName()).catch(() => {});
					throw new ScrapingBlockedError(`${this.getSourceName()} bloqueado`, block);
				}

				return task(page, response);
			},
		);
	}

	async collectLinksFromUrls(urls, matcher, limit) {
		const links = new Set();
		for (const url of urls) {
			if (links.size >= limit) break;

			const found = await this.withSourcePage(
				url,
				{ kind: "discovery", timeoutMs: this.policy.getTimeout("discovery") },
				async (page) => {
					await page.waitForLoadState("domcontentloaded").catch(() => {});
					return page.$$eval("a[href]", (anchors) =>
						anchors
							.map((anchor) => anchor.href || anchor.getAttribute("href"))
							.filter(Boolean),
					);
				},
			);

			for (const href of found) {
				if (!matcher(href)) continue;
				links.add(href.split("#")[0]);
				if (links.size >= limit) break;
			}
		}

		return Array.from(links).slice(0, limit);
	}
}
