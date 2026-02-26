import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { fetchHtml } from "../fetchHtml.js";

export class JoobleScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const base = `https://co.jooble.org/jobs-${encodeURIComponent(profession)}`;

		for (let page = 1; page <= 3 && links.size < limit; page++) {
			const pageUrl = page === 1 ? base : `${base}?page=${page}`;
			const html = await fetchHtml(pageUrl);
			const $ = cheerio.load(html);

			$("a[href*='/jobs/']").each((_, element) => {
				const href = $(element).attr("href");
				if (!href || !href.includes("/jobs/")) {
					return;
				}
				const full = href.startsWith("http") ? href : `https://co.jooble.org${href}`;
				links.add(normalizeUrl(full));
			});
		}

		return Array.from(links).slice(0, limit);
	}

	async extractJobDetails(url) {
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);

		return {
			title:
				$("h1").first().text().trim() ||
				$("[data-name='vacancy-title']").first().text().trim() ||
				"Sin titulo",
			company:
				$("[data-name='company-name']").first().text().trim() ||
				$(".company-name").first().text().trim() ||
				"Empresa no especificada",
			location:
				$("[data-name='location']").first().text().trim() ||
				$(".location").first().text().trim() ||
				null,
			description:
				$("[data-name='vacancy-body']").text().replace(/\s+/g, " ").trim() ||
				$(".vacancy-body").text().replace(/\s+/g, " ").trim() ||
				"Sin descripcion",
			salary:
				$("[data-name='salary']").first().text().trim() ||
				$(".salary").first().text().trim() ||
				null,
			url: normalizeUrl(url),
		};
	}

	getSourceName() {
		return "jooble";
	}
}
