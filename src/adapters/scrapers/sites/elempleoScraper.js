import * as cheerio from "cheerio";
import got from "got";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

/**
 * ElEmpleo Scraper - Migrado desde feat/smart-search-by-career
 * Scraper para elempleo.com.co
 */
export class ElEmpleoScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const maxPages = Math.min(Math.ceil(limit / 20), 20);

		try {
			for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
				const url = `https://www.elempleo.com/co/ofertas-empleo/trabajo-${encodeURIComponent(profession)}`;
				console.log(`🔎 ElEmpleo - Accediendo a página ${currentPage}: ${url}`);

				const response = await got(url, {
					timeout: { request: 20000 },
					retry: { limit: 2 },
				});
				const $ = cheerio.load(response.body);

				let newLinksFound = false;

				$(".article-title, .js-offer-title").each((_, el) => {
					const href = $(el).attr("href") || $(el).find("a").attr("href");
					if (href) {
						const fullUrl = href.startsWith("http")
							? href
							: `https://www.elempleo.com${href}`;

						if (!links.has(fullUrl)) {
							links.add(normalizeUrl(fullUrl));
							newLinksFound = true;
						}
					}
				});

				console.log(`📄 ElEmpleo - Página ${currentPage} - Links acumulados: ${links.size}`);

				// Si ya alcanzamos el límite, terminamos
				if (links.size >= limit) break;

				// Si no hubo nuevos links en esta iteración, paramos
				if (!newLinksFound) break;
			}

			console.log(`✅ ElEmpleo - Total de enlaces únicos encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear ElEmpleo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 ElEmpleo - Obteniendo detalles:", url);

			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const locationRaw = $("span.js-joboffer-city").first().text().trim();
			const locationLines = locationRaw
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			const location = [...new Set(locationLines)].join(" ") || null;

			const salaryRaw = $("span.js-joboffer-salary").first().text().trim();
			const salaryLines = salaryRaw
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			const salary = [...new Set(salaryLines)].join(" ") || null;

			const title =
				$("h1.ee-mod.ee-offer-title.js-offer-title").text().trim() ||
				$("h1").first().text().trim() ||
				"Sin titulo";

			const descriptionFromHtml = normalizeText(
				[
					"div.description-block",
					"div.description-block span",
					".job-description",
					".offer-description",
					".js-joboffer-description",
					"section.job-description",
					"[itemprop='description']",
					"[data-section='description']",
				]
					.map((selector) => $(selector).text())
					.join(" "),
			);

			const descriptionFromJsonLd = normalizeText(extractJsonLdDescription($));
			const descriptionFromMeta = normalizeText(
				$("meta[property='og:description']").attr("content") ||
					$("meta[name='description']").attr("content"),
			);

			const candidates = [
				descriptionFromHtml,
				descriptionFromJsonLd,
				descriptionFromMeta,
			].filter(Boolean);

			const description =
				candidates.find((candidate) => !isMaskedContactOnly(candidate)) ||
				"Sin descripcion";

			const company =
				$(".js-company-link strong").text().trim() ||
				$(".js-company-link").text().trim() ||
				"Empresa no especificada";

			console.log(`✅ ElEmpleo - Trabajo extraído: ${title}`);

			return {
				title,
				company,
				location,
				description: description.substring(0, 5000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error(`❌ Error obteniendo detalles de ElEmpleo ${url}:`, error.message);
			return null;
		}
	}

	getSourceName() {
		return "elempleo";
	}
}

const normalizeText = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim();

const extractJsonLdDescription = ($) => {
	const scripts = $("script[type='application/ld+json']").toArray();
	for (const script of scripts) {
		const raw = $(script).html();
		if (!raw) continue;
		try {
			const parsed = JSON.parse(raw);
			const queue = Array.isArray(parsed) ? parsed : [parsed];
			for (const item of queue) {
				const description =
					item?.description ||
					item?.mainEntity?.description ||
					item?.jobPosting?.description;
				if (description) {
					return description;
				}
			}
		} catch {
			continue;
		}
	}
	return null;
};

const isMaskedContactOnly = (text) => {
	const value = normalizeText(text).toLowerCase();
	if (!value) return true;
	return /^[*\s._-]+@[*\s._-]+\.[*\s._-]+$/.test(value);
};
