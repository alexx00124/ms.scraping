import { BLOCK_TYPES } from "../../domain/scraping/blockTypes.js";

const TEXT_BLOCK_PATTERNS = [
	{ pattern: /too many requests|rate limit|demasiadas solicitudes/i, type: BLOCK_TYPES.RATE_LIMIT },
	{ pattern: /access denied|forbidden|permission denied/i, type: BLOCK_TYPES.ACCESS_DENIED },
	{ pattern: /cloudflare|challenge-platform|verify you are human|attention required/i, type: BLOCK_TYPES.CHALLENGE },
	{ pattern: /unusual traffic|automated queries|bot detection/i, type: BLOCK_TYPES.SOFT_BLOCK },
];

export class BlockDetector {
	async detect(page, response) {
		const status = response?.status?.() ?? null;
		if (status === 429) {
			return this.blocked(BLOCK_TYPES.RATE_LIMIT, `HTTP ${status}`);
		}
		if (status === 403) {
			return this.blocked(BLOCK_TYPES.ACCESS_DENIED, `HTTP ${status}`);
		}

		const title = await page.title().catch(() => "");
		const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
		const normalizedText = normalizeText(`${title}\n${bodyText}`);

		if (await hasVisibleCaptcha(page)) {
			return this.blocked(BLOCK_TYPES.CAPTCHA, "Visible captcha challenge detected");
		}

		for (const entry of TEXT_BLOCK_PATTERNS) {
			if (entry.pattern.test(normalizedText)) {
				return this.blocked(entry.type, `Pattern matched: ${entry.pattern}`);
			}
		}

		if (!normalizedText || normalizedText.length < 40) {
			return this.blocked(BLOCK_TYPES.EMPTY_PAGE, "Rendered content too small");
		}

		return { detected: false, type: null, reason: null, status };
	}

	blocked(type, reason) {
		return {
			detected: true,
			type,
			reason,
		};
	}
}

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const hasVisibleCaptcha = async (page) =>
	page
		.evaluate(() => {
			const selectors = [
				".g-recaptcha",
				"iframe[src*='recaptcha']",
				"iframe[src*='hcaptcha']",
				"[data-sitekey]",
				"#captcha",
				".h-captcha",
			];
			const isVisible = (element) => {
				if (!element) return false;
				const style = window.getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					style.display !== "none" &&
					style.visibility !== "hidden" &&
					style.opacity !== "0" &&
					rect.width > 8 &&
					rect.height > 8
				);
			};

			return selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some(isVisible));
		})
		.catch(() => false);
