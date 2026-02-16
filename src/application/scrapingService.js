export class ScrapingService {
	constructor(jobRepository) {
		this.jobRepository = jobRepository;
	}

	async ingestOne(payload) {
		return this.jobRepository.create(payload);
	}

	async ingestMany(items) {
		return this.jobRepository.createMany(items);
	}
}
