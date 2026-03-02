import * as cheerio from "cheerio";
import got from "got";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { getRandomUserAgent } from "../fetchPage.js";

/**
 * LinkedIn Scraper - Migrado desde feat/smart-search-by-career
 * 
 * LinkedIn tiene una vista pública de empleos que no requiere login.
 * Mejoras implementadas:
 * - Extracción de JSON-LD (más confiable)
 * - Fallback a extracción HTML
 * - User-agents rotativos
 * - Mejor manejo de errores
 */
export class LinkedinScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();

		try {
			const formattedQuery = encodeURIComponent(profession.trim());
			const url = `https://www.linkedin.com/jobs/search?keywords=${formattedQuery}&location=Colombia&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0`;
			
			console.log(`🔎 LinkedIn - Buscando: ${url}`);

			const response = await got(url, {
				headers: {
					"User-Agent": getRandomUserAgent(),
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
					"Accept-Encoding": "gzip, deflate, br",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
				timeout: { request: 20000 },
				retry: { limit: 2 },
				followRedirect: true,
			});

			const $ = cheerio.load(response.body);

			// LinkedIn público usa estos selectores para las tarjetas de empleo
			$('a.base-card__full-link, a[href*="/jobs/view/"]').each((_, el) => {
				const href = $(el).attr("href");
				if (href && href.includes("/jobs/view/")) {
					// Limpiar tracking parameters
					const cleanUrl = href.split("?")[0];
					const fullUrl = cleanUrl.startsWith("http")
						? cleanUrl
						: `https://www.linkedin.com${cleanUrl}`;
					links.add(normalizeUrl(fullUrl));
				}
				if (links.size >= limit) return false;
			});

			// Fallback: buscar en el JSON-LD embebido
			if (links.size === 0) {
				$('script[type="application/ld+json"]').each((_, el) => {
					try {
						const jsonData = JSON.parse($(el).html());
						if (Array.isArray(jsonData.itemListElement)) {
							for (const item of jsonData.itemListElement) {
								if (item.url && item.url.includes("/jobs/view/")) {
									links.add(normalizeUrl(item.url.split("?")[0]));
								}
								if (links.size >= limit) break;
							}
						}
					} catch {
						// JSON inválido, ignorar
					}
				});
			}

			console.log(`📊 LinkedIn - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear LinkedIn:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 LinkedIn - Obteniendo detalles:", url);

			const response = await got(url, {
				headers: {
					"User-Agent": getRandomUserAgent(),
					Accept: "text/html,application/xhtml+xml",
					"Accept-Language": "es-CO,es;q=0.9",
				},
				timeout: { request: 20000 },
				retry: { limit: 2 },
				followRedirect: true,
			});

			const $ = cheerio.load(response.body);

			// Intentar extraer datos del JSON-LD primero (más confiable)
			let jsonLd = null;
			$('script[type="application/ld+json"]').each((_, el) => {
				try {
					const parsed = JSON.parse($(el).html());
					if (parsed?.["@type"] === "JobPosting") {
						jsonLd = parsed;
						return false;
					}
				} catch {
					return true;
				}
				return true;
			});

			if (jsonLd) {
				const description = (jsonLd.description || "")
					.replace(/<[^>]*>/g, " ")
					.replace(/\s+/g, " ")
					.trim();

				const salary = jsonLd.baseSalary?.value
					? `${jsonLd.baseSalary.value.minValue || ""}-${jsonLd.baseSalary.value.maxValue || ""} ${jsonLd.baseSalary.currency || "COP"}`
					: null;

				console.log(`✅ LinkedIn - Trabajo extraído (JSON-LD): ${jsonLd.title}`);

				return {
					title: jsonLd.title || "Sin titulo",
					company: jsonLd.hiringOrganization?.name || "Empresa no especificada",
					location:
						jsonLd.jobLocation?.address?.addressLocality ||
						jsonLd.jobLocation?.name ||
						null,
					description: description.substring(0, 2000),
					salary,
					url: normalizeUrl(url),
				};
			}

			// Fallback: extraer del HTML
			const title =
				$("h1.top-card-layout__title, h2.top-card-layout__title, h1")
					.first()
					.text()
					.trim() || "Sin titulo";

			const description = $(".description__text, .show-more-less-html__markup, .job-description")
				.text()
				.replace(/\s+/g, " ")
				.trim()
				.substring(0, 2000) || "Sin descripcion";

			const company =
				$(".topcard__org-name-link, a.topcard__org-name-link, .top-card-layout__company-url")
					.first()
					.text()
					.trim() || "Empresa no especificada";

			const location =
				$(".topcard__flavor--bullet, .top-card-layout__bullet")
					.first()
					.text()
					.trim() || null;

			console.log(`✅ LinkedIn - Trabajo extraído (HTML): ${title}`);

			return {
				title,
				company,
				location,
				description,
				salary: null,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error(
				`❌ Error obteniendo detalles de LinkedIn ${url}:`,
				error.message,
			);
			return null;
		}
	}

	getSourceName() {
		return "linkedin";
	}
}
