export class PublishingService {
	constructor(jobRepository) {
		this.jobRepository = jobRepository;
	}

	async publish(payload) {
		return this.jobRepository.create(payload);
	}

	async publishMany(items) {
		return this.jobRepository.createMany(items);
	}
}
