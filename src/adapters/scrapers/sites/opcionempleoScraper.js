import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

/**
 * OpcionEmpleo Scraper - Migrado desde feat/smart-search-by-career
 */

export class OpcionempleoScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();

		try {
			const formattedQuery = encodeURIComponent(profession.trim());
			const url = `https://www.opcionempleo.com.co/empleo?s=${formattedQuery}&l=Colombia`;
			console.log(`🔎 OpcionEmpleo - Buscando: ${url}`);

			const html = await fetchPage(url);
			if (!html) return [];

			const $ = cheerio.load(html);

			$("article a[href*='/empleo/'], a.offer_link, a[data-offer-id]").each((_, el) => {
				const href = $(el).attr("href");
				if (href && !href.includes("javascript:")) {
					const fullUrl = href.startsWith("http")
						? href
						: `https://www.opcionempleo.com.co${href}`;
					links.add(normalizeUrl(fullUrl));
				}
				if (links.size >= limit) return false;
			});

			// Fallback: buscar cualquier link que parezca una oferta
			if (links.size === 0) {
				$('a[href*="/empleo/"]').each((_, el) => {
					const href = $(el).attr("href");
					if (href && href.includes("/empleo/") && !href.includes("?s=")) {
						const fullUrl = href.startsWith("http")
							? href
							: `https://www.opcionempleo.com.co${href}`;
						links.add(normalizeUrl(fullUrl));
					}
					if (links.size >= limit) return false;
				});
			}

			console.log(`📊 OpcionEmpleo - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear OpcionEmpleo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 OpcionEmpleo - Obteniendo detalles:", url);

			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				$("h1").first().text().trim() ||
				$("meta[property='og:title']").attr("content") ||
				"Sin titulo";

			const description =
				$(".offer-description, .description, #job-description, .job-desc")
					.text()
					.replace(/\s+/g, " ")
					.trim() ||
				$("meta[property='og:description']").attr("content") ||
				$("meta[name='description']").attr("content") ||
				"Sin descripcion";

			const company =
				$(".company-name, .employer, [itemprop='hiringOrganization']")
					.first()
					.text()
					.trim() || "Empresa no especificada";

			const location =
				$(".location, [itemprop='jobLocation'], .job-location")
					.first()
					.text()
					.replace(/\s+/g, " ")
					.trim() || null;

			const salary =
				$(".salary, [itemprop='baseSalary'], .compensation")
					.first()
					.text()
					.trim() || null;

			console.log(`✅ OpcionEmpleo - Trabajo extraído: ${title}`);

			return {
				title,
				company,
				location,
				description: description.substring(0, 2000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error(`❌ Error obteniendo detalles de OpcionEmpleo ${url}:`, error.message);
			return null;
		}
	}

	getSourceName() {
		return "opcionempleo";
	}
}
