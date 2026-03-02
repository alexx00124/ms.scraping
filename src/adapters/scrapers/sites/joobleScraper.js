import * as cheerio from "cheerio";
import got from "got";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage, { getRandomUserAgent } from "../fetchPage.js";

/**
 * Jooble Scraper - Migrado y mejorado desde feat/smart-search-by-career
 */
export class JoobleScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const maxPages = Math.min(Math.ceil(limit / 10), 15);

		try {
			const encodedQuery = encodeURIComponent(profession);
			const baseUrl = `https://co.jooble.org/jobs-${encodedQuery}`;

			console.log(`🔎 Jooble - Iniciando búsqueda: ${baseUrl}`);

			for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
				const pageUrl =
					currentPage === 1 ? baseUrl : `${baseUrl}?page=${currentPage}`;
				console.log(`🔎 Jooble - Página ${currentPage}: ${pageUrl}`);

				try {
					const response = await got(pageUrl, {
						headers: {
							"User-Agent": getRandomUserAgent(),
							"Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
						},
						timeout: { request: 15000 },
						retry: { limit: 2 },
					});

					const $ = cheerio.load(response.body);
					const jobCards = $("a[href*='/jobs/']");

					if (jobCards.length === 0) {
						console.log("📊 Jooble - No se encontraron más trabajos");
						break;
					}

					jobCards.each((_, el) => {
						const href = $(el).attr("href");
						if (href && href.includes("/jobs/")) {
							const fullUrl = href.startsWith("http")
								? href
								: `https://co.jooble.org${href}`;
							links.add(normalizeUrl(fullUrl));
						}
					});

					console.log(`📊 Jooble - Total enlaces: ${links.size}`);
					if (links.size >= limit) break;
				} catch (pageError) {
					console.log(`⚠️ Jooble - Error en página ${currentPage}: ${pageError.message}`);
					break;
				}
			}

			console.log(`📊 Jooble - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear Jooble:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 Jooble - Obteniendo detalles:", url);

			const html = await fetchPage(url, {
				headers: { "User-Agent": getRandomUserAgent() },
				timeout: 15000,
			});

			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				$("h1").first().text().trim() ||
				$("[data-name='vacancy-title']").text().trim() ||
				"Sin titulo";

			const company =
				$("[data-name='company-name']").text().trim() ||
				$(".company-name").text().trim() ||
				"Empresa no especificada";

			const location =
				$("[data-name='location']").text().trim() ||
				$(".location").text().trim() ||
				null;

			const description =
				$("[data-name='vacancy-body']").text() ||
				$(".vacancy-body").text() ||
				$("body").text();

			const cleanDescription = description.replace(/\s+/g, " ").trim().substring(0, 5000);

			const salary =
				$("[data-name='salary']").text().trim() ||
				$(".salary").text().trim() ||
				null;

			console.log(`✅ Jooble - Trabajo extraído: ${title} - ${company}`);

			return {
				title,
				company,
				location,
				description: cleanDescription || "Sin descripcion",
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error("❌ Error al obtener detalles de Jooble:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "jooble";
	}
}
