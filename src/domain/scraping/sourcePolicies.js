class SourcePolicy {
	constructor(config = {}) {
		this.source = config.source || "unknown";
		this.discovery = {
			concurrency: Number(config.discovery?.concurrency || 1),
			minDelayMs: Number(config.discovery?.minDelayMs || 1000),
			maxDelayMs: Number(config.discovery?.maxDelayMs || 2500),
			timeoutMs: Number(config.discovery?.timeoutMs || 20000),
		};
		this.detail = {
			concurrency: Number(config.detail?.concurrency || 1),
			minDelayMs: Number(config.detail?.minDelayMs || 1500),
			maxDelayMs: Number(config.detail?.maxDelayMs || 4000),
			timeoutMs: Number(config.detail?.timeoutMs || 30000),
			retries: Number(config.detail?.retries || 2),
		};
		this.cooldownMs = Number(config.cooldownMs || 30 * 60 * 1000);
		this.useProxy = config.useProxy === true;
		this.waitUntil = config.waitUntil || "domcontentloaded";
	}

	randomDelay(kind = "detail") {
		const policy = this[kind] || this.detail;
		const min = Math.max(0, Number(policy.minDelayMs || 0));
		const max = Math.max(min, Number(policy.maxDelayMs || min));
		return Math.floor(min + Math.random() * (max - min + 1));
	}

	getConcurrency(kind = "detail") {
		return Math.max(1, Number(this[kind]?.concurrency || 1));
	}

	getTimeout(kind = "detail") {
		return Math.max(1000, Number(this[kind]?.timeoutMs || 30000));
	}

	getRetries(kind = "detail") {
		return Math.max(1, Number(this[kind]?.retries || 1));
	}
}

const DEFAULT_POLICIES = {
	elempleo: new SourcePolicy({
		source: "elempleo",
		discovery: { concurrency: 1, minDelayMs: 1200, maxDelayMs: 2400, timeoutMs: 25000 },
		detail: { concurrency: 1, minDelayMs: 1500, maxDelayMs: 3200, timeoutMs: 30000, retries: 2 },
		cooldownMs: 30 * 60 * 1000,
		useProxy: false,
	}),
	opcionempleo: new SourcePolicy({
		source: "opcionempleo",
		discovery: { concurrency: 1, minDelayMs: 1500, maxDelayMs: 3000, timeoutMs: 30000 },
		detail: { concurrency: 1, minDelayMs: 2000, maxDelayMs: 4000, timeoutMs: 35000, retries: 2 },
		cooldownMs: 30 * 60 * 1000,
		useProxy: false,
		waitUntil: "domcontentloaded",
	}),
	computrabajo: new SourcePolicy({
		source: "computrabajo",
		discovery: { concurrency: 1, minDelayMs: 1200, maxDelayMs: 2400, timeoutMs: 25000 },
		detail: { concurrency: 1, minDelayMs: 1400, maxDelayMs: 2800, timeoutMs: 26000, retries: 2 },
		cooldownMs: 30 * 60 * 1000,
		useProxy: false,
		waitUntil: "domcontentloaded",
	}),
};

export const getSourcePolicy = (sourceName) =>
	DEFAULT_POLICIES[String(sourceName || "").toLowerCase()] ||
	new SourcePolicy({ source: String(sourceName || "unknown").toLowerCase() });

export { SourcePolicy };
