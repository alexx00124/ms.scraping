import { BLOCK_TYPES } from "../../domain/scraping/blockTypes.js";

const BLOCK_PATTERNS = [
	{ pattern: /too many requests|rate limit|demasiadas solicitudes/i, type: BLOCK_TYPES.RATE_LIMIT },
	{ pattern: /access denied|forbidden|denied/i, type: BLOCK_TYPES.ACCESS_DENIED },
	{ pattern: /captcha|recaptcha|g-recaptcha/i, type: BLOCK_TYPES.CAPTCHA },
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
		const html = await page.content().catch(() => "");
		const snapshot = `${title}\n${html.slice(0, 6000)}`;

		for (const entry of BLOCK_PATTERNS) {
			if (entry.pattern.test(snapshot)) {
				return this.blocked(entry.type, `Pattern matched: ${entry.pattern}`);
			}
		}

		const plainText = stripHtml(snapshot).trim();
		if (!plainText || plainText.length < 40) {
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

const stripHtml = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
