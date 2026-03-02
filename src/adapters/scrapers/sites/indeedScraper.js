import * as cheerio from "cheerio";
import got from "got";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage, { getRandomUserAgent, randomSleep } from "../fetchPage.js";

/**
 * Indeed Scraper - Migrado y mejorado desde feat/smart-search-by-career
 * 
 * Mejoras implementadas:
 * - Sesión previa para obtener cookies
 * - User-Agents rotativos
 * - Headers completos con Sec-Fetch-*
 * - Delays aleatorios 2-5 segundos
 * - Múltiples selectores para diferentes estructuras de página
 * - Paginación robusta con detección de fin
 */
export class IndeedScraper extends ScraperProvider {
	constructor() {
		super();
		this.baseUrl = "https://co.indeed.com";
	}

	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const maxPages = Math.min(Math.ceil(limit / 10), 20);

		try {
			// IMPORTANTE: Primero hacer request a página principal para obtener cookies/sesión
			console.log(`🔎 Indeed - Obteniendo sesión...`);
			try {
				await got(this.baseUrl, {
					headers: { "User-Agent": getRandomUserAgent() },
					timeout: { request: 15000 },
				});
			} catch (e) {
				// Ignorar errores en request inicial de sesión
			}

			for (let currentPage = 0; currentPage < maxPages; currentPage++) {
				const start = currentPage * 10;
				const encodedQuery = encodeURIComponent(profession);
				const url = `${this.baseUrl}/jobs?q=${encodedQuery}&start=${start}`;

				console.log(`🔎 Indeed - Página ${currentPage + 1}: ${url}`);

				const response = await got(url, {
					headers: {
						"User-Agent": getRandomUserAgent(),
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
						"Accept-Language": "es-ES,es;q=0.9,en;q=0.8,en-US;q=0.7",
						"Accept-Encoding": "gzip, deflate, br",
						DNT: "1",
						Connection: "keep-alive",
						"Upgrade-Insecure-Requests": "1",
						"Sec-Fetch-Dest": "document",
						"Sec-Fetch-Mode": "navigate",
						"Sec-Fetch-Site": "none",
						"Sec-Fetch-User": "?1",
					},
					timeout: { request: 30000 },
					retry: { limit: 2 },
				});

				const $ = cheerio.load(response.body);

				// Múltiples selectores para diferentes estructuras de página
				const jobCards = $(
					".jobsearch-ResultsList > li, .job-card, .job-card-container, [data-testid='jobcard'], .resume-preview-link",
				);

				if (jobCards.length === 0) {
					console.log("📊 Indeed - No se encontraron más trabajos");
					break;
				}

				jobCards.each((_, el) => {
					const link = $(el)
						.find(
							"a.jcs-JobTitle, a.job-card-link, a[data-testid='jobcard-title'], [class*='jobTitle'] a, a[href*='/jobs/viewjob'], a[href*='jk=']",
						)
						.attr("href");

					if (link && !link.includes("indeed.com/rc/clk")) {
						const fullLink = link.startsWith("http")
							? link
							: `${this.baseUrl}${link}`;
						links.add(normalizeUrl(fullLink));
					}
				});

				console.log(
					`📊 Indeed - Total enlaces encontrados hasta ahora: ${links.size}`,
				);

				if (links.size >= limit) break;

				// Delay aleatorio 2-5 segundos entre páginas (comportamiento humano)
				await randomSleep(2000, 5000);
			}

			console.log(`📊 Indeed - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear Indeed:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 Indeed - Obteniendo detalles:", url);

			const html = await fetchPage(url, {
				headers: {
					"User-Agent": getRandomUserAgent(),
					Accept: "text/html,application/xhtml+xml",
					"Accept-Language": "es-ES,es;q=0.9",
				},
			});

			if (!html) return null;

			const $ = cheerio.load(html);

			// Múltiples selectores para diferentes versiones de Indeed
			const title =
				$("h1[class*='jobsearch-JobInfoHeader-title']").first().text().trim() ||
				$("[data-testid='jobsearch-JobInfoHeader-title']")
					.first()
					.text()
					.trim() ||
				$("h1").first().text().trim() ||
				"Sin titulo";

			const company =
				$("[data-testid='inlineHeader-companyName']").first().text().trim() ||
				$(".jobsearch-InlineCompanyRating-companyHeader a")
					.first()
					.text()
					.trim() ||
				$(".companyName").text().trim() ||
				"Empresa no especificada";

			const location =
				$("[data-testid='inlineHeader-companyLocation']")
					.first()
					.text()
					.trim() ||
				$(".companyLocation").text().trim() ||
				null;

			const description =
				$("#jobDescriptionText").text().replace(/\s+/g, " ").trim() ||
				$(".jobsearch-JobComponent-embeddedBody")
					.text()
					.replace(/\s+/g, " ")
					.trim()
					.substring(0, 5000) ||
				"Sin descripcion";

			const salary =
				$("[data-testid='jobsearch-JobMetadataHeader-salary']")
					.first()
					.text()
					.trim() ||
				$(".salaryText").text().trim() ||
				null;

			console.log(`✅ Indeed - Trabajo extraído: ${title} - ${company}`);

			return {
				title,
				company,
				location,
				description,
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error("❌ Error al obtener detalles de Indeed:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "indeed";
	}
}
