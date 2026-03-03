import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

/**
 * Talent.com Scraper - Migrado desde feat/smart-search-by-career
 */
export class TalentScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();

		try {
			const formattedQuery = encodeURIComponent(profession.trim());
			const url = `https://www.talent.com/jobs?k=${formattedQuery}&l=Colombia`;
			console.log(`🔎 Talent.com - Buscando: ${url}`);

			const html = await fetchPage(url);
			if (!html) return [];

			const $ = cheerio.load(html);

			// Talent.com usa cards con links a las ofertas
			$('a[href*="/view?id="], a.card__job-link, a.link--block').each((_, el) => {
				const href = $(el).attr("href");
				if (href) {
					const fullUrl = href.startsWith("http")
						? href
						: `https://www.talent.com${href}`;
					links.add(normalizeUrl(fullUrl));
				}
				if (links.size >= limit) return false;
			});

			// Fallback: buscar links que contengan /view
			if (links.size === 0) {
				$('a[href*="/view"]').each((_, el) => {
					const href = $(el).attr("href");
					if (href && href.includes("/view")) {
						const fullUrl = href.startsWith("http")
							? href
							: `https://www.talent.com${href}`;
						links.add(normalizeUrl(fullUrl));
					}
					if (links.size >= limit) return false;
				});
			}

			console.log(`📊 Talent.com - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear Talent.com:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 Talent.com - Obteniendo detalles:", url);

			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				$("h1").first().text().trim() ||
				$('meta[property="og:title"]').attr("content") ||
				"Sin titulo";

			const descriptionFromHeading = normalizeText(extractDescriptionByHeading($));

			const descriptionFromSelectors = normalizeText(
				[
					".card__job-description",
					".job__description",
					"#job-description",
					".description",
					".job-description",
					".job-details-description",
					"[itemprop='description']",
				]
					.map((selector) => $(selector).text())
					.join(" "),
			);

			const descriptionFromHtml = normalizeText(
				[descriptionFromHeading, descriptionFromSelectors].filter(Boolean).join(" "),
			);

			const descriptionFromJsonLd = normalizeText(extractJsonLdDescription($));
			const descriptionFromMeta = normalizeText(
				$('meta[property="og:description"]').attr("content") ||
					$("meta[name='description']").attr("content"),
			);

			const description =
				descriptionFromHtml ||
				descriptionFromJsonLd ||
				descriptionFromMeta ||
				"Sin descripcion";

			const company =
				$(".card__job-empname-text, .employer, h2.card__job-empname")
					.first()
					.text()
					.trim() || "Empresa no especificada";

			const location =
				$(".card__job-location, .location, [itemprop='jobLocation']")
					.first()
					.text()
					.replace(/\s+/g, " ")
					.trim() || null;

			const salary =
				$(".card__job-salary-info, .salary, [itemprop='baseSalary']")
					.first()
					.text()
					.trim() || null;

			console.log(`✅ Talent.com - Trabajo extraído: ${title}`);

			return {
				title,
				company,
				location,
				description: description.substring(0, 2000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error("❌ Error obteniendo detalles de Talent.com:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "talent";
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

const extractDescriptionByHeading = ($) => {
	const headingNodes = $("span, h2, h3, strong").toArray();
	for (const node of headingNodes) {
		const headingText = normalizeText($(node).text()).toLowerCase();
		if (
			headingText !== "job description" &&
			headingText !== "description" &&
			headingText !== "descripción del cargo"
		) {
			continue;
		}

		const nextDivText = normalizeText($(node).next("div").text());
		if (nextDivText.length > 120) {
			return nextDivText;
		}

		const parentDivText = normalizeText($(node).parent().children("div").first().text());
		if (parentDivText.length > 120) {
			return parentDivText;
		}
	}

	return null;
};
