export class ScraperFactory {
	constructor() {
		this.scrapers = new Map();
	}

	register(sourceName, scraperInstance) {
		this.scrapers.set(sourceName.toLowerCase(), scraperInstance);
	}

	getScraper(sourceName) {
		return this.scrapers.get(sourceName.toLowerCase()) || null;
	}

	getAvailableSources() {
		return Array.from(this.scrapers.entries())
			.filter(([, scraper]) => scraper?.isAvailable())
			.map(([name]) => name);
	}
}
