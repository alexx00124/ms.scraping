import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { fetchHtml, sleep } from "../fetchHtml.js";

export class IndeedScraper extends ScraperProvider {
	constructor() {
		super();
		this.baseUrl = "https://co.indeed.com";
	}

	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const maxPages = Math.ceil(limit / 10);

		for (let page = 0; page < maxPages && links.size < limit; page++) {
			const start = page * 10;
			const url = `${this.baseUrl}/jobs?q=${encodeURIComponent(profession)}&start=${start}`;
			const html = await fetchHtml(url);
			const $ = cheerio.load(html);

			$("a.jcs-JobTitle, a[data-testid='jobcard-title'], a[href*='/jobs/viewjob']").each(
				(_, element) => {
					const href = $(element).attr("href");
					if (!href) {
						return;
					}
					const full = href.startsWith("http") ? href : `${this.baseUrl}${href}`;
					links.add(normalizeUrl(full));
				},
			);

			await sleep(500);
		}

		return Array.from(links).slice(0, limit);
	}

	async extractJobDetails(url) {
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);

		const title =
			$("h1[class*='jobsearch-JobInfoHeader-title']").first().text().trim() ||
			$("[data-testid='jobsearch-JobInfoHeader-title']").first().text().trim() ||
			"Sin titulo";

		const company =
			$("[data-testid='inlineHeader-companyName']").first().text().trim() ||
			$(".jobsearch-InlineCompanyRating-companyHeader a").first().text().trim() ||
			"Empresa no especificada";

		const location =
			$("[data-testid='inlineHeader-companyLocation']").first().text().trim() || null;

		const description =
			$("#jobDescriptionText").text().replace(/\s+/g, " ").trim() || "Sin descripcion";

		const salary =
			$("[data-testid='jobsearch-JobMetadataHeader-salary']").first().text().trim() || null;

		return {
			title,
			company,
			location,
			description,
			salary,
			url: normalizeUrl(url),
		};
	}

	getSourceName() {
		return "indeed";
	}
}
