export class DiscoveryService {
	async discover({ scraper, sourceName, searchTerms, limitPerTerm, isExpired, deduplicationService, seenUrls }) {
		const links = [];
		const errors = [];

		for (const term of searchTerms) {
			if (isExpired()) break;

			try {
				const discovered = await scraper.extractJobLinks(term, limitPerTerm);
				const unique = deduplicationService.filterSessionUrls(discovered, seenUrls);
				links.push(...unique);
			} catch (error) {
				errors.push(`[${sourceName}:${term}] ${error.message}`);
				if (!scraper.isAvailable()) {
					break;
				}
			}
		}

		return { links, errors };
	}
}
