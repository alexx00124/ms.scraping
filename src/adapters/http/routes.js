import express from "express";
import { buildScrapingController } from "./scrapingController.js";
import { buildScrapingSourceController } from "./scrapingSourceController.js";

export const buildRoutes = (scrapingService, scrapingSourceRepository) => {
	const router = express.Router();
	const controller = buildScrapingController(scrapingService);
	const sourceController = buildScrapingSourceController(scrapingSourceRepository);

	router.post("/scraping/job", controller.ingestOne);
	router.post("/scraping/jobs", controller.ingestMany);
	router.post("/scraping/start", controller.start);
	router.get("/scraping/sources", controller.getSources);
	router.get("/scraping/status", controller.getStatus);

	// CRUD de fuentes de scraping (admin)
	router.get("/scraping/sources-db", sourceController.list);
	router.get("/scraping/sources-db/:id", sourceController.getById);
	router.post("/scraping/sources-db", sourceController.create);
	router.put("/scraping/sources-db/:id", sourceController.update);
	router.delete("/scraping/sources-db/:id", sourceController.remove);

	return router;
};
