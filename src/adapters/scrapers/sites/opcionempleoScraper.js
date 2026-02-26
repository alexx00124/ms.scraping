import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { fetchHtml } from "../fetchHtml.js";

export class OpcionempleoScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const query = encodeURIComponent(profession.trim());
		const url = `https://www.opcionempleo.com.co/empleo?s=${query}&l=Colombia`;
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);
		const links = new Set();

		$("article a[href*='/empleo/'], a.offer_link, a[data-offer-id], a[href*='/empleo/']").each(
			(_, element) => {
				const href = $(element).attr("href");
				if (!href || href.includes("javascript:")) {
					return;
				}
				const full = href.startsWith("http") ? href : `https://www.opcionempleo.com.co${href}`;
				links.add(normalizeUrl(full));
			},
		);

		return Array.from(links).slice(0, limit);
	}

	async extractJobDetails(url) {
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);

		return {
			title:
				$("h1").first().text().trim() ||
				$("meta[property='og:title']").attr("content") ||
				"Sin titulo",
			company:
				$(".company-name, .employer, [itemprop='hiringOrganization']").first().text().trim() ||
				"Empresa no especificada",
			location:
				$(".location, [itemprop='jobLocation'], .job-location").first().text().trim() || null,
			description:
				$(".offer-description, .description, #job-description, .job-desc")
					.text()
					.replace(/\s+/g, " ")
					.trim() ||
				$("meta[property='og:description']").attr("content") ||
				"Sin descripcion",
			salary:
				$(".salary, [itemprop='baseSalary'], .compensation").first().text().trim() || null,
			url: normalizeUrl(url),
		};
	}

	getSourceName() {
		return "opcionempleo";
	}
}
