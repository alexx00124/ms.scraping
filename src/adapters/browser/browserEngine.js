import { chromium } from "playwright";

const DEFAULT_NAVIGATION_TIMEOUT_MS = Number(
	process.env.SCRAPING_BROWSER_TIMEOUT_MS || 30000,
);

const DEFAULT_USER_AGENT =
	process.env.SCRAPING_BROWSER_USER_AGENT ||
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class BrowserEngine {
	constructor(options = {}) {
		this.headless = options.headless ?? process.env.SCRAPING_HEADLESS !== "false";
		this.defaultTimeoutMs = Number(options.defaultTimeoutMs || DEFAULT_NAVIGATION_TIMEOUT_MS);
		this.proxy = resolveProxy(options.proxy);
		this.browser = null;
		this.contexts = new Map();
	}

	async start() {
		if (this.browser) return this.browser;
		const launchOptions = {
			headless: this.headless,
			proxy: this.proxy || undefined,
		};

		if (process.env.SCRAPING_BROWSER_EXECUTABLE_PATH) {
			launchOptions.executablePath = process.env.SCRAPING_BROWSER_EXECUTABLE_PATH;
		} else if (process.env.SCRAPING_BROWSER_CHANNEL) {
			launchOptions.channel = process.env.SCRAPING_BROWSER_CHANNEL;
		}

		this.browser = await chromium.launch(launchOptions);
		return this.browser;
	}

	async stop() {
		for (const [sourceName, context] of this.contexts.entries()) {
			await context.close().catch(() => {});
			this.contexts.delete(sourceName);
		}

		if (this.browser) {
			await this.browser.close().catch(() => {});
			this.browser = null;
		}
	}

	async resetContext(sourceName) {
		const key = normalizeSourceName(sourceName);
		const context = this.contexts.get(key);
		if (!context) return;
		await context.close().catch(() => {});
		this.contexts.delete(key);
	}

	async runWithPage(options = {}, task) {
		const context = await this.getContext(options);
		const page = await context.newPage();
		page.setDefaultTimeout(Number(options.timeoutMs || this.defaultTimeoutMs));

		try {
			return await task(page, context);
		} finally {
			await page.close().catch(() => {});
		}
	}

	async getContext(options = {}) {
		await this.start();
		const sourceName = normalizeSourceName(options.sourceName);
		const shouldReuse = options.reuseContext !== false;

		if (shouldReuse && this.contexts.has(sourceName)) {
			return this.contexts.get(sourceName);
		}

		const context = await this.browser.newContext({
			locale: options.locale || "es-CO",
			timezoneId: options.timezoneId || "America/Bogota",
			viewport: options.viewport || { width: 1366, height: 768 },
			userAgent: options.userAgent || DEFAULT_USER_AGENT,
			javaScriptEnabled: true,
			ignoreHTTPSErrors: true,
			extraHTTPHeaders: {
				"Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
				...(options.headers || {}),
			},
		});

		await context.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => undefined });
		});

		if (shouldReuse) {
			this.contexts.set(sourceName, context);
		}

		return context;
	}
}

const normalizeSourceName = (value) => String(value || "default").trim().toLowerCase();

function resolveProxy(proxy) {
	if (proxy) return proxy;
	if (!process.env.SCRAPING_PROXY_SERVER) return null;
	return {
		server: process.env.SCRAPING_PROXY_SERVER,
		username: process.env.SCRAPING_PROXY_USERNAME || undefined,
		password: process.env.SCRAPING_PROXY_PASSWORD || undefined,
	};
}
