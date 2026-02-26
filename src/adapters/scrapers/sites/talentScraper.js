import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { fetchHtml } from "../fetchHtml.js";

export class TalentScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const query = encodeURIComponent(profession.trim());
		const url = `https://www.talent.com/jobs?k=${query}&l=Colombia`;
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);
		const links = new Set();

		$("a[href*='/view?id='], a.card__job-link, a.link--block, a[href*='/view']").each(
			(_, element) => {
				const href = $(element).attr("href");
				if (!href) {
					return;
				}
				const full = href.startsWith("http") ? href : `https://www.talent.com${href}`;
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
				$(".card__job-empname-text, .employer, h2.card__job-empname").first().text().trim() ||
				"Empresa no especificada",
			location:
				$(".card__job-location, .location, [itemprop='jobLocation']").first().text().trim() || null,
			description:
				$(".card__job-description, .job__description, #job-description, .description")
					.text()
					.replace(/\s+/g, " ")
					.trim() ||
				$("meta[property='og:description']").attr("content") ||
				"Sin descripcion",
			salary:
				$(".card__job-salary-info, .salary, [itemprop='baseSalary']").first().text().trim() ||
				null,
			url: normalizeUrl(url),
		};
	}

	getSourceName() {
		return "talent";
	}
}
