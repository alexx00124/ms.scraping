import {
	DEFAULT_LINKS_PER_SOURCE,
	SCRAPING_SOURCES,
} from "../domain/scrapingSources.js";
import { normalizeUrl } from "../domain/urlNormalization.js";
import { matchJobToProgram } from "../domain/programMatcher.js";
import { areDuplicates } from "../domain/duplicateDetector.js";

const MAX_SOURCES_PER_RUN = Number(process.env.SCRAPING_MAX_SOURCES || 8);
const MAX_LINKS_PER_SOURCE = Number(process.env.SCRAPING_MAX_LINKS_PER_SOURCE || 15);
const SOURCE_TIMEOUT_MS = Number(process.env.SCRAPING_SOURCE_TIMEOUT_MS || 20000);
const DETAIL_TIMEOUT_MS = Number(process.env.SCRAPING_DETAIL_TIMEOUT_MS || 12000);
const DETAIL_CONCURRENCY = Number(process.env.SCRAPING_DETAIL_CONCURRENCY || 5);
const DETAIL_RETRY_ATTEMPTS = Number(process.env.SCRAPING_DETAIL_RETRY_ATTEMPTS || 2);
const MAX_SEARCH_TERMS = Number(process.env.SCRAPING_MAX_SEARCH_TERMS || 6);

export class ScrapingService {
	constructor(
		jobRepository,
		scraperFactory,
		academicProgramRepository,
		scrapingSourceRepository,
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
		
		// Cargar programas activos al iniciar
		this.loadPrograms();
	}
	
	async loadPrograms() {
		try {
			this.programs = await this.academicProgramRepository.listActive();
			console.log(`[ScrapingService] Cargados ${this.programs.length} programas académicos`);
		} catch (error) {
			console.error("[ScrapingService] Error cargando programas:", error.message);
			this.programs = [];
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
		};
	}

	async startScraping({ profession, keywords = [], sources, linksPerSource }) {
		const selectedSources = await this.resolveSources(sources);

		// Construir lista de términos de búsqueda
		// Prioridad: keywords[] > profession (retrocompatible)
		const searchTerms = this.buildSearchTerms(profession, keywords);

		const requestedPerSource = Number(linksPerSource) || DEFAULT_LINKS_PER_SOURCE;
		const perSourceLimit = Math.min(requestedPerSource, Math.max(1, MAX_LINKS_PER_SOURCE));

		// Repartir el budget de links entre los términos de búsqueda
		const linksPerTermPerSource = Math.max(1, Math.ceil(perSourceLimit / searchTerms.length));

		const startedAt = new Date();
		this.lastRun = {
			status: "running",
			startedAt,
			finishedAt: null,
			totals: null,
		};

		const response = {
			profession: profession || searchTerms[0],
			searchTerms,
			startedAt,
			totalLinks: 0,
			totalInserted: 0,
			totalSkipped: 0,
			totalFailed: 0,
			sources: {},
		};

		// Set global para deduplicar URLs encontradas en esta sesión (entre keywords)
		const seenUrls = new Set();

		const sourceResults = await Promise.all(
			selectedSources.map(async (sourceName) => {
			const scraper = this.scraperFactory.getScraper(sourceName);
			if (!scraper?.isAvailable()) {
				return {
					sourceName,
					metrics: {
					links: 0,
					inserted: 0,
					skipped: 0,
					failed: 0,
					success: false,
					error: "Fuente no disponible.",
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
			};

			// Iterar sobre cada término de búsqueda para esta fuente
			for (const term of searchTerms) {
				try {
					const links = await withTimeout(
						scraper.extractJobLinks(term, linksPerTermPerSource),
						SOURCE_TIMEOUT_MS,
						`Timeout extrayendo links en ${sourceName} para "${term}"`,
					);

					// Filtrar links ya vistos en esta sesión
					const newLinks = links.filter((link) => {
						const normalized = normalizeUrl(link) || link;
						if (seenUrls.has(normalized)) return false;
						seenUrls.add(normalized);
						return true;
					});

					metrics.links += newLinks.length;

					await runWithConcurrency(newLinks, DETAIL_CONCURRENCY, async (link) => {
						try {
							let details = null;
							for (let attempt = 1; attempt <= DETAIL_RETRY_ATTEMPTS; attempt++) {
								details = await withTimeout(
									scraper.extractJobDetails(link),
									DETAIL_TIMEOUT_MS,
									`Timeout extrayendo detalle en ${sourceName}`,
								);
								if (!details) {
									continue;
								}

								if (hasMeaningfulDescription(details)) {
									break;
								}

								if (attempt < DETAIL_RETRY_ATTEMPTS) {
									await delay(250 * attempt);
								}
							}

							if (!details) {
								metrics.failed += 1;
								return;
							}

							const payload = toTrabajoPayload(details, sourceName, this.programs);
							const candidates = [
								payload.urlOriginal,
								normalizeUrl(link),
								link,
							].filter(Boolean);

							const exists = await this.jobRepository.findBySourceAndUrls(
								sourceName,
								candidates,
							);
							if (exists) {
								metrics.skipped += 1;
								return;
							}

							await this.jobRepository.create(payload);
							metrics.inserted += 1;
						} catch (error) {
							metrics.failed += 1;
							metrics.errors.push(error.message);
						}
					});
				} catch (error) {
					metrics.errors.push(`[${term}] ${error.message}`);
				}
			}

			return { sourceName, metrics };
			}),
		);

		for (const { sourceName, metrics } of sourceResults) {
			response.totalLinks += metrics.links;
			response.totalInserted += metrics.inserted;
			response.totalSkipped += metrics.skipped;
			response.totalFailed += metrics.failed;
			response.sources[sourceName] = metrics;
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
			},
		};

		return {
			...response,
			finishedAt,
		};
	}

	/**
	 * Construye la lista de términos de búsqueda a partir de profession y/o keywords.
	 * Selecciona un subconjunto variado para maximizar cobertura sin exceder tiempos.
	 */
	buildSearchTerms(profession, keywords) {
		const terms = [];
		const seen = new Set();

		const addTerm = (term) => {
			const normalized = term.trim().toLowerCase();
			if (normalized && !seen.has(normalized)) {
				seen.add(normalized);
				terms.push(normalized);
			}
		};

		// 1. El nombre de la profesión/carrera siempre va primero
		if (profession) addTerm(profession);

		// 2. Agregar keywords adicionales (cargos, sinónimos)
		if (keywords.length > 0) {
			// Seleccionar keywords variados: preferir los más cortos y específicos (cargos)
			// que funcionan mejor como queries de búsqueda en portales de empleo
			const sorted = [...keywords]
				.filter((k) => !seen.has(k.trim().toLowerCase()))
				.sort((a, b) => a.length - b.length);

			for (const kw of sorted) {
				addTerm(kw);
				if (terms.length >= MAX_SEARCH_TERMS) break;
			}
		}

		// Fallback: si no hay nada, usar profession tal cual
		if (terms.length === 0 && profession) {
			terms.push(profession.trim().toLowerCase());
		}

		console.log(`[ScrapingService] Términos de búsqueda (${terms.length}):`, terms);
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

const withTimeout = async (promise, timeoutMs, message) => {
	let timeoutId;
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
	});
	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutId);
	}
};

const delay = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const hasMeaningfulDescription = (details) => {
	if (!details) return false;
	const raw = details.description || details.descripcion;
	if (!raw) return false;
	const normalized = String(raw).trim().toLowerCase();
	if (!normalized) return false;
	if (normalized === "sin descripcion") return false;
	return normalized.length >= 40;
};

const runWithConcurrency = async (items, concurrency, worker) => {
	const queue = [...items];
	const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
		while (queue.length > 0) {
			const item = queue.shift();
			if (item === undefined) {
				return;
			}
			await worker(item);
		}
	});
	await Promise.all(runners);
};

const parseSalaryRange = (salaryText) => {
	if (!salaryText || typeof salaryText !== "string") {
		return { salarioMin: null, salarioMax: null };
	}

	const matches = salaryText.match(/[\d.,]+/g) || [];
	const values = matches
		.map((item) => item.replace(/\./g, "").replace(/,/g, "."))
		.map((item) => Number(item))
		.filter((item) => Number.isFinite(item));

	if (values.length === 0) {
		return { salarioMin: null, salarioMax: null };
	}

	if (values.length === 1) {
		return { salarioMin: values[0], salarioMax: null };
	}

	return {
		salarioMin: Math.min(...values),
		salarioMax: Math.max(...values),
	};
};

const inferModalidad = (text) => {
	if (!text || typeof text !== "string") {
		return null;
	}

	const normalized = normalizeSearchText(text);
	if (
		normalized.includes("hibrid") ||
		normalized.includes("hybrid") ||
		normalized.includes("mixto") ||
		normalized.includes("semi presencial")
	) {
		return "HIBRIDO";
	}
	if (
		normalized.includes("remoto") ||
		normalized.includes("remote") ||
		normalized.includes("teletrabajo") ||
		normalized.includes("home office") ||
		normalized.includes("work from home") ||
		normalized.includes("wfh") ||
		normalized.includes("virtual")
	) {
		return "REMOTO";
	}
	if (
		normalized.includes("presencial") ||
		normalized.includes("onsite") ||
		normalized.includes("on site") ||
		normalized.includes("en oficina")
	) {
		return "PRESENCIAL";
	}

	return null;
};

const normalizeSearchText = (value) =>
	String(value || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim();

const toTrabajoPayload = (details, sourceName, programs) => {
	const now = new Date();
	const salary = parseSalaryRange(details.salary);
	const rawUrl = details.url || details.link || details.urlOriginal;
	const urlOriginal = normalizeUrl(rawUrl);
	
	const titulo = (details.title || details.titulo || "Sin titulo").trim();
	const descripcion = (details.description || details.descripcion || "Sin descripcion").trim();
	
	// Calcular programa relacionado usando programMatcher
	const programaRelacionado = matchJobToProgram(titulo, descripcion, programs);

	return {
		titulo,
		descripcion,
		empresa: (details.company || details.empresa || "Empresa no especificada").trim(),
		ubicacion: details.location || details.ubicacion || null,
		modalidad: inferModalidad(`${details.location || ""} ${details.description || ""}`),
		salarioMin: salary.salarioMin,
		salarioMax: salary.salarioMax,
		requisitos: null,
		habilidadesClave: null,
		fuente: sourceName,
		urlOriginal,
		scrapingId: null,
		programaRelacionado,
		activo: true,
		fechaCreacion: now,
		actualizadoEn: now,
	};
};
