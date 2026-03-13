import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../adapters/prismaClient.js";
import { HttpJobsClient } from "../adapters/httpJobsClient.js";
import { MemoryScrapingSourceRepository } from "../adapters/memoryScrapingSourceRepository.js";
import { PrismaScrapingSourceRepository } from "../adapters/prismaScrapingSourceRepository.js";
import { ResilientScrapingSourceRepository } from "../adapters/resilientScrapingSourceRepository.js";
import { ScraperFactory } from "../adapters/scrapers/scraperFactory.js";
import { BrowserEngine } from "../adapters/browser/browserEngine.js";
import { BlockDetector } from "../adapters/scrapers/blockDetector.js";
import { ScrapingService } from "../application/scrapingService.js";
import { buildRoutes } from "../adapters/http/routes.js";

import { ElempleoScraper } from "../adapters/scrapers/sites/elempleoScraper.js";

const PORT = process.env.PORT || 6006;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

const httpJobsClient = new HttpJobsClient();
const jobRepository = httpJobsClient; // Job ingestion via ms-jobs API
const academicProgramRepository = {
	listActive: () => httpJobsClient.listActivePrograms(),
	listAll: () => httpJobsClient.listAllPrograms(),
	findById: (id) => httpJobsClient.findProgramById(id),
	findByName: (name) => httpJobsClient.findProgramByName(name),
};
const browserEngine = new BrowserEngine();
const blockDetector = new BlockDetector();

const scraperFactory = new ScraperFactory();
scraperFactory.register(
	"elempleo",
	new ElempleoScraper({ browserEngine, blockDetector }),
);

const DEFAULT_SCRAPING_SOURCES = [
	{ nombre: "Elempleo", urlBase: "https://www.elempleo.com" },
];

const scrapingSourceRepository = new ResilientScrapingSourceRepository(
	new PrismaScrapingSourceRepository(prisma),
	new MemoryScrapingSourceRepository(DEFAULT_SCRAPING_SOURCES),
);

const scrapingService = new ScrapingService(
	jobRepository,
	scraperFactory,
	academicProgramRepository,
	scrapingSourceRepository,
);

const ensureDefaultSources = async () => {
	if (!process.env.DATABASE_URL) {
		console.warn(
			"[ms-scraping] DATABASE_URL no configurada. Se omite inicializacion de fuentes en BD.",
		);
		return;
	}

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
			await scrapingSourceRepository.deleteById(source.id);
		}

		if (stale.length > 0) {
			console.log(
				`[ms-scraping] Fuentes anteriores eliminadas: ${stale.length}`,
			);
		}
	} catch (error) {
		console.error(
			"[ms-scraping] Error inicializando fuentes por defecto:",
			error.message,
		);
	}
};

if (!process.env.MS_JOBS_URL) {
	console.warn(
		"[ms-scraping] MS_JOBS_URL no configurada. Se usara http://localhost:6003.",
	);
}

ensureDefaultSources();

function normalizeSourceName(name) {
	return String(name || "").trim().toLowerCase();
}

app.use(buildRoutes(scrapingService, scrapingSourceRepository));

app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		service: "ms-scraping",
		dependencies: {
			msJobs: httpJobsClient.getStatus(),
			sourcesRepository: scrapingSourceRepository.getStatus(),
		},
	});
});

app.get("/", (_req, res) => {
	res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, _req, res, _next) => {
	console.error("ms-scraping unhandled error:", err.message);
	res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error interno." } });
});

app.listen(PORT, () => {
	console.log(`ms-scraping escuchando en puerto ${PORT}`);
});

const shutdown = async () => {
	await browserEngine.stop().catch(() => {});
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
