import { normalizeUrl } from "../../domain/urlNormalization.js";

export class DeduplicationService {
	constructor(jobRepository) {
		this.jobRepository = jobRepository;
	}

	filterSessionUrls(urls, seenUrls) {
		const result = [];
		for (const url of Array.isArray(urls) ? urls : []) {
			const normalized = normalizeUrl(url) || url;
			if (!normalized || seenUrls.has(normalized)) continue;
			seenUrls.add(normalized);
			result.push(normalized);
		}
		return result;
	}

	async exists(sourceName, candidates = []) {
		if (!this.jobRepository?.findBySourceAndUrls) {
			return false;
		}
		const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
		if (uniqueCandidates.length === 0) return false;
		return Boolean(
			await this.jobRepository.findBySourceAndUrls(sourceName, uniqueCandidates),
		);
	}
}
