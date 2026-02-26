export class ScraperProvider {
	async extractJobLinks(_profession, _limit) {
		throw new Error("Not implemented");
	}

	async extractJobDetails(_url) {
		throw new Error("Not implemented");
	}

	getSourceName() {
		throw new Error("Not implemented");
	}

	isAvailable() {
		return true;
	}
}
