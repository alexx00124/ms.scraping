import {
	DEFAULT_LINKS_PER_SOURCE,
	SCRAPING_SOURCES,
} from "../domain/scrapingSources.js";
import { normalizeUrl } from "../domain/urlNormalization.js";
import { matchJobToProgram } from "../domain/programMatcher.js";

export class ScrapingService {
	constructor(jobRepository, scraperFactory, academicProgramRepository) {
		this.jobRepository = jobRepository;
		this.scraperFactory = scraperFactory;
		this.academicProgramRepository = academicProgramRepository;
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

	async startScraping({ profession, sources, linksPerSource }) {
		const selectedSources = (sources?.length
			? sources.map((item) => item.toLowerCase())
			: this.getAvailableSources()
		).filter((item) => SCRAPING_SOURCES.includes(item));

		const perSourceLimit = Number(linksPerSource) || DEFAULT_LINKS_PER_SOURCE;
		const startedAt = new Date();
		this.lastRun = {
			status: "running",
			startedAt,
			finishedAt: null,
			totals: null,
		};

		const response = {
			profession,
			startedAt,
			totalLinks: 0,
			totalInserted: 0,
			totalSkipped: 0,
			totalFailed: 0,
			sources: {},
		};

		for (const sourceName of selectedSources) {
			const scraper = this.scraperFactory.getScraper(sourceName);
			if (!scraper?.isAvailable()) {
				response.sources[sourceName] = {
					links: 0,
					inserted: 0,
					skipped: 0,
					failed: 0,
					success: false,
					error: "Fuente no disponible.",
				};
				continue;
			}

			const metrics = {
				links: 0,
				inserted: 0,
				skipped: 0,
				failed: 0,
				success: true,
				errors: [],
			};

			try {
				const links = await scraper.extractJobLinks(profession, perSourceLimit);
				metrics.links = links.length;
				response.totalLinks += links.length;

				for (const link of links) {
					try {
						const details = await scraper.extractJobDetails(link);
						if (!details) {
							metrics.failed += 1;
							continue;
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
							continue;
						}

						await this.jobRepository.create(payload);
						metrics.inserted += 1;
					} catch (error) {
						metrics.failed += 1;
						metrics.errors.push(error.message);
					}
				}
			} catch (error) {
				metrics.success = false;
				metrics.errors.push(error.message);
			}

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
}

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

	const normalized = text.toLowerCase();
	if (normalized.includes("hibrid")) {
		return "HIBRIDO";
	}
	if (normalized.includes("remoto") || normalized.includes("remote")) {
		return "REMOTO";
	}
	if (normalized.includes("presencial")) {
		return "PRESENCIAL";
	}

	return null;
};

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
