export class ScraperProvider {
	constructor() {
		this.blockedUntil = null;
		this.blockReason = null;
	}

	async extractJobLinks(_profession, _limit) {
		throw new Error("Not implemented");
	}

	async extractJobDetails(_url) {
		throw new Error("Not implemented");
	}

	getSourceName() {
		throw new Error("Not implemented");
	}

	getPolicy() {
		return null;
	}

	isAvailable() {
		if (!this.blockedUntil) {
			return true;
		}

		if (Date.now() >= this.blockedUntil) {
			this.blockedUntil = null;
			this.blockReason = null;
			return true;
		}

		return false;
	}

	block(reason, cooldownMs = Number(process.env.SCRAPING_BLOCK_COOLDOWN_MS || 21600000)) {
		this.blockedUntil = Date.now() + Math.max(60000, cooldownMs);
		this.blockReason = reason || "Fuente bloqueada temporalmente";
	}

	getBlockInfo() {
		if (this.isAvailable()) {
			return null;
		}

		return {
			reason: this.blockReason,
			blockedUntil: new Date(this.blockedUntil).toISOString(),
		};
	}
}
