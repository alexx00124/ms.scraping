import "dotenv/config";
import express from "express";
import { prisma } from "../adapters/prismaClient.js";
import { HttpJobsClient } from "../adapters/httpJobsClient.js";
import { PrismaScrapingSourceRepository } from "../adapters/prismaScrapingSourceRepository.js";
import { ScraperFactory } from "../adapters/scrapers/scraperFactory.js";
import { ScrapingService } from "../application/scrapingService.js";
import { buildRoutes } from "../adapters/http/routes.js";

import { AcciontrabajoScraper } from "../adapters/scrapers/sites/acciontrabajoScraper.js";
import { FaciltrabajoScraper } from "../adapters/scrapers/sites/faciltrabajoScraper.js";

const PORT = process.env.PORT || 6006;

const app = express();
app.use(express.json());

const httpJobsClient = new HttpJobsClient();
const jobRepository = httpJobsClient; // Job ingestion via ms-jobs API
const academicProgramRepository = {
	listActive: () => httpJobsClient.listActivePrograms(),
	listAll: () => httpJobsClient.listAllPrograms(),
	findById: (id) => httpJobsClient.findProgramById(id),
	findByName: (name) => httpJobsClient.findProgramByName(name),
};
const scrapingSourceRepository = new PrismaScrapingSourceRepository(prisma);

const scraperFactory = new ScraperFactory();
scraperFactory.register("acciontrabajo", new AcciontrabajoScraper());
scraperFactory.register("faciltrabajo", new FaciltrabajoScraper());

const scrapingService = new ScrapingService(
	jobRepository,
	scraperFactory,
	academicProgramRepository,
	scrapingSourceRepository,
);

const DEFAULT_SCRAPING_SOURCES = [
	{ nombre: "AccionTrabajo", urlBase: "https://col.acciontrabajo.com" },
	{ nombre: "FacilTrabajo", urlBase: "https://www.faciltrabajo.com.co" },
];

const ensureDefaultSources = async () => {
	try {
		const existing = await scrapingSourceRepository.listAll();
		const existingNames = new Set(
			existing.map((source) => normalizeSourceName(source.nombre)),
		);
		const missing = DEFAULT_SCRAPING_SOURCES.filter(
			(source) => !existingNames.has(normalizeSourceName(source.nombre)),
		);

		const defaultNames = new Set(
			DEFAULT_SCRAPING_SOURCES.map((source) => normalizeSourceName(source.nombre)),
		);
		const stale = existing.filter(
			(source) => !defaultNames.has(normalizeSourceName(source.nombre)),
		);

		for (const source of missing) {
			await scrapingSourceRepository.create({
				nombre: source.nombre,
				urlBase: source.urlBase,
				habilitada: true,
			});
		}

		if (missing.length > 0) {
			console.log(
				`[ms-scraping] Fuentes por defecto creadas: ${missing.length}`,
			);
		}

		for (const source of stale) {
			if (!source.habilitada) continue;
			await scrapingSourceRepository.updateById(source.id, { habilitada: false });
		}

		if (stale.length > 0) {
			console.log(
				`[ms-scraping] Fuentes anteriores deshabilitadas: ${stale.length}`,
			);
		}
	} catch (error) {
		console.error(
			"[ms-scraping] Error inicializando fuentes por defecto:",
			error.message,
		);
	}
};

ensureDefaultSources();

function normalizeSourceName(name) {
	return String(name || "").trim().toLowerCase();
}

app.use(buildRoutes(scrapingService, scrapingSourceRepository));

app.get("/health", (_req, res) => {
	res.json({ ok: true, service: "ms-scraping" });
});

app.use((err, _req, res, _next) => {
	console.error("ms-scraping unhandled error:", err.message);
	res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error interno." } });
});

app.listen(PORT, () => {
	console.log(`ms-scraping escuchando en puerto ${PORT}`);
});
