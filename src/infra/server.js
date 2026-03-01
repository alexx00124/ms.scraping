import express from "express";
import { prisma } from "../adapters/prismaClient.js";
import { PrismaJobRepository } from "../adapters/prismaJobRepository.js";
import { PrismaScrapingSourceRepository } from "../adapters/prismaScrapingSourceRepository.js";
import { ScrapingService } from "../application/scrapingService.js";
import { buildRoutes } from "../adapters/http/routes.js";
import { ScraperFactory } from "../adapters/scrapers/scraperFactory.js";
import { IndeedScraper } from "../adapters/scrapers/sites/indeedScraper.js";
import { LinkedinScraper } from "../adapters/scrapers/sites/linkedinScraper.js";
import { JoobleScraper } from "../adapters/scrapers/sites/joobleScraper.js";
import { OpcionempleoScraper } from "../adapters/scrapers/sites/opcionempleoScraper.js";
import { TalentScraper } from "../adapters/scrapers/sites/talentScraper.js";

const PORT = process.env.PORT || 6006;

const app = express();
app.use(express.json());

const jobRepository = new PrismaJobRepository(prisma);
const scrapingSourceRepository = new PrismaScrapingSourceRepository(prisma);
const scraperFactory = new ScraperFactory();
scraperFactory.register("indeed", new IndeedScraper());
scraperFactory.register("linkedin", new LinkedinScraper());
scraperFactory.register("jooble", new JoobleScraper());
scraperFactory.register("opcionempleo", new OpcionempleoScraper());
scraperFactory.register("talent", new TalentScraper());

const scrapingService = new ScrapingService(jobRepository, scraperFactory);

app.use(buildRoutes(scrapingService, scrapingSourceRepository));

app.get("/health", (_req, res) => {
	res.json({ ok: true, service: "ms-scraping" });
});

app.listen(PORT, () => {
	console.log(`ms-scraping escuchando en puerto ${PORT}`);
});
