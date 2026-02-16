import express from "express";
import { prisma } from "../adapters/prismaClient.js";
import { PrismaJobRepository } from "../adapters/prismaJobRepository.js";
import { ScrapingService } from "../application/scrapingService.js";
import { buildRoutes } from "../adapters/http/routes.js";

const PORT = process.env.PORT || 6006;

const app = express();
app.use(express.json());

const jobRepository = new PrismaJobRepository(prisma);
const scrapingService = new ScrapingService(jobRepository);

app.use(buildRoutes(scrapingService));

app.get("/health", (_req, res) => {
	res.json({ ok: true, service: "ms-scraping" });
});

app.listen(PORT, () => {
	console.log(`ms-scraping escuchando en puerto ${PORT}`);
});
