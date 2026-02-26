import express from "express";
import { buildScrapingController } from "./scrapingController.js";

export const buildRoutes = (scrapingService) => {
	const router = express.Router();
	const controller = buildScrapingController(scrapingService);

	router.post("/scraping/job", controller.ingestOne);
	router.post("/scraping/jobs", controller.ingestMany);
	router.post("/scraping/start", controller.start);
	router.get("/scraping/sources", controller.getSources);
	router.get("/scraping/status", controller.getStatus);

	return router;
};
