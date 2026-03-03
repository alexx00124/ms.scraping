import "dotenv/config";
import express from "express";
import { prisma } from "../adapters/prismaClient.js";
import { PrismaJobRepository } from "../adapters/prismaJobRepository.js";
import { PrismaAcademicProgramRepository } from "../adapters/prismaAcademicProgramRepository.js";
import { PrismaScrapingSourceRepository } from "../adapters/prismaScrapingSourceRepository.js";
import { ScraperFactory } from "../adapters/scrapers/scraperFactory.js";
import { ScrapingService } from "../application/scrapingService.js";
import { buildRoutes } from "../adapters/http/routes.js";

import { ComputrabajoScraper } from "../adapters/scrapers/sites/computrabajoScraper.js";
import { ElEmpleoScraper } from "../adapters/scrapers/sites/elempleoScraper.js";
import { IndeedScraper } from "../adapters/scrapers/sites/indeedScraper.js";
import { JoobleScraper } from "../adapters/scrapers/sites/joobleScraper.js";
import { LinkedinScraper } from "../adapters/scrapers/sites/linkedinScraper.js";
import { OpcionempleoScraper } from "../adapters/scrapers/sites/opcionempleoScraper.js";
import { TalentScraper } from "../adapters/scrapers/sites/talentScraper.js";
import { ColombiatrabajosScraper } from "../adapters/scrapers/sites/colombiatrabajosScraper.js";

const PORT = process.env.PORT || 6006;

const app = express();
app.use(express.json());

const jobRepository = new PrismaJobRepository(prisma);
const academicProgramRepository = new PrismaAcademicProgramRepository(prisma);
const scrapingSourceRepository = new PrismaScrapingSourceRepository(prisma);

const scraperFactory = new ScraperFactory();
scraperFactory.register("computrabajo", new ComputrabajoScraper());
scraperFactory.register("elempleo", new ElEmpleoScraper());
scraperFactory.register("indeed", new IndeedScraper());
scraperFactory.register("jooble", new JoobleScraper());
scraperFactory.register("linkedin", new LinkedinScraper());
scraperFactory.register("opcionempleo", new OpcionempleoScraper());
scraperFactory.register("talent", new TalentScraper());
scraperFactory.register("colombiatrabajos", new ColombiatrabajosScraper());

const scrapingService = new ScrapingService(
	jobRepository,
	scraperFactory,
	academicProgramRepository,
	scrapingSourceRepository,
);

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
