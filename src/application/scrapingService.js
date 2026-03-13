import {
	DEFAULT_LINKS_PER_SOURCE,
	SCRAPING_SOURCES,
} from "../domain/scrapingSources.js";
import { DiscoveryService } from "./services/discoveryService.js";
import { ExtractionService } from "./services/extractionService.js";
import { DeduplicationService } from "./services/deduplicationService.js";
import { NormalizationService } from "./services/normalizationService.js";
import { PublishingService } from "./services/publishingService.js";

const MAX_SOURCES_PER_RUN = Number(process.env.SCRAPING_MAX_SOURCES || 4);
const MAX_LINKS_PER_SOURCE = Number(process.env.SCRAPING_MAX_LINKS_PER_SOURCE || 8);
const MAX_SEARCH_TERMS = Number(process.env.SCRAPING_MAX_SEARCH_TERMS || 4);
const MAX_DURATION_MS = Number(process.env.SCRAPING_MAX_DURATION_MS || 70000);

export class ScrapingService {
	constructor(
		jobRepository,
		scraperFactory,
		academicProgramRepository,
		scrapingSourceRepository,
		services = {},
	) {
		this.jobRepository = jobRepository;
		this.scraperFactory = scraperFactory;
		this.academicProgramRepository = academicProgramRepository;
		this.scrapingSourceRepository = scrapingSourceRepository;
		this.programs = [];
		this.lastRun = {
			status: "idle",
			startedAt: null,
			finishedAt: null,
			totals: null,
		};

		this.deduplicationService =
			services.deduplicationService || new DeduplicationService(jobRepository);
		this.normalizationService =
			services.normalizationService || new NormalizationService([]);
		this.publishingService =
			services.publishingService || new PublishingService(jobRepository);
		this.discoveryService =
			services.discoveryService || new DiscoveryService();
		this.extractionService =
			services.extractionService ||
			new ExtractionService({
				deduplicationService: this.deduplicationService,
				normalizationService: this.normalizationService,
				publishingService: this.publishingService,
			});

		this.loadPrograms();
	}

	async loadPrograms() {
		try {
			this.programs = await this.academicProgramRepository.listActive();
			this.normalizationService.setPrograms(this.programs);
			console.log(`[ScrapingService] Cargados ${this.programs.length} programas academicos`);
		} catch (error) {
			console.error("[ScrapingService] Error cargando programas:", error.message);
			this.programs = [];
			this.normalizationService.setPrograms([]);
		}
	}

	async ingestOne(payload) {
		return this.jobRepository.create(payload);
	}

	async ingestMany(items) {
		return this.jobRepository.createMany(items);
	}

	getAvailableSources() {
		return this.scraperFactory.getAvailableSources();
	}

	getStatus() {
		return {
			...this.lastRun,
			sources: this.getAvailableSources(),
			blockedSources: this.scraperFactory.getBlockedSources(),
		};
	}

	getProgramsCount() {
		return Array.isArray(this.programs) ? this.programs.length : 0;
	}

	async ensureProgramsLoaded() {
		if (this.getProgramsCount() > 0) {
			return this.programs;
		}

		await this.loadPrograms();
		return this.programs;
	}

	async startScraping({
		profession,
		keywords = [],
		sources,
		linksPerSource,
		allPrograms = false,
	}) {
		if (allPrograms) {
			return this.startScrapingAllPrograms({ sources, linksPerSource });
		}

		await this.ensureProgramsLoaded();
		const selectedSources = await this.resolveSources(sources);
		const startedAt = new Date();
		const deadlineAt = Date.now() + Math.max(15000, MAX_DURATION_MS);
		const isExpired = () => Date.now() >= deadlineAt;
		const searchTerms = this.buildSearchTerms(profession, keywords);

		const requestedPerSource = Number(linksPerSource) || DEFAULT_LINKS_PER_SOURCE;
		const perSourceLimit = Math.min(requestedPerSource, Math.max(1, MAX_LINKS_PER_SOURCE));
		const linksPerTermPerSource = Math.max(1, Math.ceil(perSourceLimit / Math.max(1, searchTerms.length)));

		this.lastRun = {
			status: "running",
			startedAt,
			finishedAt: null,
			insertedSoFar: 0,
			totals: null,
		};

		const response = {
			profession: profession || searchTerms[0] || null,
			searchTerms,
			startedAt,
			totalLinks: 0,
			totalInserted: 0,
			totalSkipped: 0,
			totalFailed: 0,
			timedOut: false,
			sources: {},
		};

		const seenUrls = new Set();

		for (const sourceName of selectedSources) {
			if (isExpired()) {
				response.timedOut = true;
				break;
			}

			const sourceResult = await this.processSource({
				sourceName,
				searchTerms,
				linksPerTermPerSource,
				seenUrls,
				isExpired,
			});

			response.totalLinks += sourceResult.metrics.links;
			response.totalInserted += sourceResult.metrics.inserted;
			response.totalSkipped += sourceResult.metrics.skipped;
			response.totalFailed += sourceResult.metrics.failed;
			response.sources[sourceName] = sourceResult.metrics;
			response.timedOut = response.timedOut || sourceResult.timedOut;
		}

		const finishedAt = new Date();
		this.lastRun = {
			status: "idle",
			startedAt,
			finishedAt,
			totals: {
				links: response.totalLinks,
				inserted: response.totalInserted,
				skipped: response.totalSkipped,
				failed: response.totalFailed,
				timedOut: response.timedOut,
			},
		};

		return {
			...response,
			finishedAt,
		};
	}

	async processSource({ sourceName, searchTerms, linksPerTermPerSource, seenUrls, isExpired }) {
		const scraper = this.scraperFactory.getScraper(sourceName);
		if (!scraper?.isAvailable()) {
			return {
				timedOut: false,
				metrics: {
					links: 0,
					inserted: 0,
					skipped: 0,
					failed: 0,
					success: false,
					errors: ["Fuente no disponible o en cooldown"],
					searchTermsUsed: searchTerms,
				},
			};
		}

		const metrics = {
			links: 0,
			inserted: 0,
			skipped: 0,
			failed: 0,
			success: true,
			errors: [],
			searchTermsUsed: searchTerms,
			policy: scraper.getPolicy?.() || null,
		};

		const discovered = await this.discoveryService.discover({
			scraper,
			sourceName,
			searchTerms,
			limitPerTerm: linksPerTermPerSource,
			isExpired,
			deduplicationService: this.deduplicationService,
			seenUrls,
		});

		metrics.links = discovered.links.length;
		metrics.errors.push(...discovered.errors);

		const extracted = await this.extractionService.processLinks({
			scraper,
			sourceName,
			links: discovered.links,
			isExpired,
			onInserted: () => {
				this.lastRun.insertedSoFar += 1;
			},
		});

		metrics.inserted += extracted.inserted;
		metrics.skipped += extracted.skipped;
		metrics.failed += extracted.failed;
		metrics.errors.push(...extracted.errors);
		metrics.success = scraper.isAvailable() && metrics.failed === 0;

		if (!scraper.isAvailable()) {
			metrics.success = false;
			metrics.errors.push("Fuente pausada por bloqueo detectado");
		}

		return {
			timedOut: isExpired(),
			metrics,
		};
	}

	async startScrapingAllPrograms({ sources, linksPerSource }) {
		await this.ensureProgramsLoaded();

		const activePrograms = dedupeProgramsByName(this.programs).filter(
			(program) => program?.activo !== false,
		);

		if (activePrograms.length === 0) {
			const startedAt = new Date();
			const finishedAt = new Date();
			this.lastRun = {
				status: "idle",
				startedAt,
				finishedAt,
				message: "No hay programas activos disponibles en ms-jobs para ejecutar allPrograms.",
				totals: {
					links: 0,
					inserted: 0,
					skipped: 0,
					failed: 1,
					timedOut: false,
				},
			};

			return {
				profession: "all-programs",
				searchTerms: [],
				startedAt,
				finishedAt,
				totalLinks: 0,
				totalInserted: 0,
				totalSkipped: 0,
				totalFailed: 1,
				timedOut: false,
				sources: {},
				programsProcessed: 0,
				programsTotal: 0,
				message: "No hay programas activos disponibles en ms-jobs para ejecutar allPrograms.",
			};
		}

		const startedAt = new Date();
		const response = {
			profession: "all-programs",
			searchTerms: activePrograms.map((program) => program.nombre),
			startedAt,
			totalLinks: 0,
			totalInserted: 0,
			totalSkipped: 0,
			totalFailed: 0,
			timedOut: false,
			sources: {},
			programsProcessed: 0,
			programsTotal: activePrograms.length,
		};

		this.lastRun = {
			status: "running",
			startedAt,
			finishedAt: null,
			insertedSoFar: 0,
			totals: null,
		};

		for (const program of activePrograms) {
			try {
				const result = await this.startScraping({
					profession: program.nombre,
					keywords: Array.isArray(program.keywords) ? program.keywords : [],
					sources,
					linksPerSource,
					allPrograms: false,
				});

				response.totalLinks += result.totalLinks || 0;
				response.totalInserted += result.totalInserted || 0;
				response.totalSkipped += result.totalSkipped || 0;
				response.totalFailed += result.totalFailed || 0;
				response.timedOut = response.timedOut || Boolean(result.timedOut);

				for (const [sourceName, metrics] of Object.entries(result.sources || {})) {
					if (!response.sources[sourceName]) {
						response.sources[sourceName] = {
							links: 0,
							inserted: 0,
							skipped: 0,
							failed: 0,
							success: true,
							errors: [],
						};
					}

					response.sources[sourceName].links += metrics.links || 0;
					response.sources[sourceName].inserted += metrics.inserted || 0;
					response.sources[sourceName].skipped += metrics.skipped || 0;
					response.sources[sourceName].failed += metrics.failed || 0;
					response.sources[sourceName].success =
						response.sources[sourceName].success && metrics.success !== false;
					if (Array.isArray(metrics.errors) && metrics.errors.length > 0) {
						response.sources[sourceName].errors.push(...metrics.errors);
					}
				}
			} catch (_error) {
				response.totalFailed += 1;
			}

			response.programsProcessed += 1;
		}

		const finishedAt = new Date();
		this.lastRun = {
			status: "idle",
			startedAt,
			finishedAt,
			totals: {
				links: response.totalLinks,
				inserted: response.totalInserted,
				skipped: response.totalSkipped,
				failed: response.totalFailed,
				timedOut: response.timedOut,
			},
		};

		return {
			...response,
			finishedAt,
		};
	}

	buildSearchTerms(profession, keywords) {
		const terms = [];
		const seen = new Set();

		const addTerm = (term) => {
			const normalized = String(term || "").trim().toLowerCase();
			if (normalized && !seen.has(normalized)) {
				seen.add(normalized);
				terms.push(normalized);
			}
		};

		if (profession) addTerm(profession);

		if (keywords.length > 0) {
			const sorted = [...keywords]
				.filter((k) => !seen.has(k.trim().toLowerCase()))
				.sort((a, b) => a.length - b.length);

			for (const kw of sorted) {
				addTerm(kw);
				if (terms.length >= MAX_SEARCH_TERMS) break;
			}
		}

		if (terms.length === 0 && profession) {
			terms.push(profession.trim().toLowerCase());
		}

		console.log(`[ScrapingService] Terminos de busqueda (${terms.length}):`, terms);
		return terms;
	}

	async resolveSources(requestedSources) {
		const availableSources = this.getAvailableSources();
		const availableSet = new Set(availableSources);
		const configured = await this.getConfiguredEnabledSources();

		const normalizedConfigured = configured.filter((source) =>
			availableSet.has(source),
		);

		const basePool = normalizedConfigured.length > 0 ? normalizedConfigured : availableSources;
		const requested =
			requestedSources?.length > 0
				? requestedSources.map((source) => String(source).toLowerCase())
				: basePool;

		return requested
			.filter((source) => SCRAPING_SOURCES.includes(source) && availableSet.has(source))
			.slice(0, Math.max(1, MAX_SOURCES_PER_RUN));
	}

	async getConfiguredEnabledSources() {
		if (!this.scrapingSourceRepository?.listEnabled) {
			return [];
		}
		try {
			const rows = await this.scrapingSourceRepository.listEnabled();
			return rows
				.map((row) => normalizeSourceKey(row?.nombre))
				.filter(Boolean);
		} catch (error) {
			console.error("[ScrapingService] Error leyendo fuentes habilitadas:", error.message);
			return [];
		}
	}
}

const normalizeSourceKey = (value) => String(value || "").trim().toLowerCase();

const dedupeProgramsByName = (programs) => {
	const seen = new Set();
	const result = [];
	for (const program of Array.isArray(programs) ? programs : []) {
		const name = String(program?.nombre || "").trim();
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(program);
	}
	return result;
};
