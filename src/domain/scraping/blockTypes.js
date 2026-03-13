export const BLOCK_TYPES = {
	RATE_LIMIT: "RATE_LIMIT",
	ACCESS_DENIED: "ACCESS_DENIED",
	CAPTCHA: "CAPTCHA",
	CHALLENGE: "CHALLENGE",
	EMPTY_PAGE: "EMPTY_PAGE",
	SOFT_BLOCK: "SOFT_BLOCK",
	NETWORK: "NETWORK",
};

export class ScrapingBlockedError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "ScrapingBlockedError";
		this.code = "SCRAPING_BLOCKED";
		this.details = details;
	}
}
