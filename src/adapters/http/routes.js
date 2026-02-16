import express from "express";
import { buildScrapingController } from "./scrapingController.js";

export const buildRoutes = (scrapingService) => {
	const router = express.Router();
	const controller = buildScrapingController(scrapingService);

	router.post("/scraping/job", controller.ingestOne);
	router.post("/scraping/jobs", controller.ingestMany);

	return router;
};
