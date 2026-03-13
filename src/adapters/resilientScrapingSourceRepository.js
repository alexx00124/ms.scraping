export class ResilientScrapingSourceRepository {
	constructor(primaryRepository, fallbackRepository) {
		this.primaryRepository = primaryRepository;
		this.fallbackRepository = fallbackRepository;
		this.lastError = null;
		this.activeBackend = "primary";
	}

	async listAll() {
		return this.run("listAll");
	}

	async listEnabled() {
		return this.run("listEnabled");
	}

	async findById(id) {
		return this.run("findById", id);
	}

	async create(data) {
		return this.run("create", data);
	}

	async updateById(id, data) {
		return this.run("updateById", id, data);
	}

	async deleteById(id) {
		return this.run("deleteById", id);
	}

	getStatus() {
		return {
			backend: this.activeBackend,
			lastError: this.lastError,
		};
	}

	async run(method, ...args) {
		try {
			const result = await this.primaryRepository[method](...args);
			this.activeBackend = "primary";
			this.lastError = null;
			return result;
		} catch (error) {
			this.activeBackend = "fallback";
			this.lastError = error.message;
			console.warn(`[ScrapingSourceRepository] Fallback en memoria para ${method}: ${error.message}`);
			return this.fallbackRepository[method](...args);
		}
	}
}
