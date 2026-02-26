import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import { fetchHtml } from "../fetchHtml.js";

export class LinkedinScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(profession)}&location=Colombia`;
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);
		const links = new Set();

		$("a.base-card__full-link, a[href*='/jobs/view/']").each((_, element) => {
			const href = $(element).attr("href");
			if (!href || !href.includes("/jobs/view/")) {
				return;
			}
			const full = href.startsWith("http") ? href : `https://www.linkedin.com${href}`;
			links.add(normalizeUrl(full.split("?")[0]));
		});

		return Array.from(links).slice(0, limit);
	}

	async extractJobDetails(url) {
		const html = await fetchHtml(url);
		const $ = cheerio.load(html);

		let jsonLd = null;
		$("script[type='application/ld+json']").each((_, element) => {
			try {
				const parsed = JSON.parse($(element).html());
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
			return {
				title: jsonLd.title || "Sin titulo",
				company: jsonLd.hiringOrganization?.name || "Empresa no especificada",
				location:
					jsonLd.jobLocation?.address?.addressLocality ||
					jsonLd.jobLocation?.name ||
					null,
				description: (jsonLd.description || "")
					.replace(/<[^>]*>/g, " ")
					.replace(/\s+/g, " ")
					.trim(),
				salary: null,
				url: normalizeUrl(url),
			};
		}

		return {
			title:
				$("h1.top-card-layout__title, h2.top-card-layout__title, h1").first().text().trim() ||
				"Sin titulo",
			company:
				$(".topcard__org-name-link, .top-card-layout__company-url").first().text().trim() ||
				"Empresa no especificada",
			location: $(".topcard__flavor--bullet, .top-card-layout__bullet").first().text().trim() || null,
			description:
				$(".description__text, .show-more-less-html__markup, .job-description")
					.text()
					.replace(/\s+/g, " ")
					.trim() || "Sin descripcion",
			salary: null,
			url: normalizeUrl(url),
		};
	}

	getSourceName() {
		return "linkedin";
	}
}
