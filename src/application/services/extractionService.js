import { normalizeUrl } from "../../domain/urlNormalization.js";

const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export class ExtractionService {
	constructor({ deduplicationService, normalizationService, publishingService }) {
		this.deduplicationService = deduplicationService;
		this.normalizationService = normalizationService;
		this.publishingService = publishingService;
	}

	async processLinks({ scraper, sourceName, links, isExpired, onInserted, onPublished, onExtracted }) {
		const metrics = {
			inserted: 0,
			skipped: 0,
			failed: 0,
			errors: [],
		};

		const concurrency = scraper.getPolicy?.().getConcurrency("detail") || 1;
		await runWithConcurrency(links, concurrency, async (link) => {
			if (isExpired() || !scraper.isAvailable()) {
				metrics.skipped += 1;
				return;
			}

			try {
				const details = await this.extractWithRetries(scraper, link, isExpired);
				if (!details || !hasMeaningfulDescription(details)) {
					metrics.failed += 1;
					return;
				}

				const payload = this.normalizationService.toTrabajoPayload(details, sourceName);
				const candidates = [payload.urlOriginal, normalizeUrl(link), link].filter(Boolean);

				if (typeof onExtracted === "function") {
					onExtracted(payload);
				}

				const exists = await this.deduplicationService.exists(sourceName, candidates);
				if (exists) {
					metrics.skipped += 1;
					return;
				}

				await this.publishingService.publish(payload);
				metrics.inserted += 1;
				if (typeof onInserted === "function") {
					onInserted(payload);
				}
				if (typeof onPublished === "function") {
					onPublished(payload);
				}
			} catch (error) {
				metrics.failed += 1;
				metrics.errors.push(`[${sourceName}] ${error.message}`);
			}
		}, isExpired);

		return metrics;
	}

	async extractWithRetries(scraper, link, isExpired) {
		const retries = scraper.getPolicy?.().getRetries("detail") || 1;
		for (let attempt = 1; attempt <= retries; attempt += 1) {
			if (isExpired()) return null;

			const details = await scraper.extractJobDetails(link);
			if (details && hasMeaningfulDescription(details)) {
				return details;
			}

			if (attempt < retries) {
				await sleep(250 * attempt);
			}
		}

		return null;
	}
}

const hasMeaningfulDescription = (details) => {
	if (!details) return false;
	const raw = details.description || details.descripcion;
	if (!raw) return false;
	const normalized = String(raw).trim().toLowerCase();
	if (!normalized || normalized === "sin descripcion") return false;
	return normalized.length >= 40;
};

const runWithConcurrency = async (items, concurrency, worker, shouldStop = null) => {
	const queue = [...items];
	const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
		while (queue.length > 0) {
			if (typeof shouldStop === "function" && shouldStop()) return;
			const item = queue.shift();
			if (item === undefined) return;
			await worker(item);
		}
	});
	await Promise.all(runners);
};
