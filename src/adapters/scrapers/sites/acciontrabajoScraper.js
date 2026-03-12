import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

export class AcciontrabajoScraper extends ScraperProvider {
	constructor() {
		super();
		this.baseUrl = "https://col.acciontrabajo.com";
	}

	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		try {
			const slug = slugify(profession);
			const urls = [
				`${this.baseUrl}/empleos-de-${slug}-en-colombia`,
				`${this.baseUrl}/ofertas-de-trabajo-en-colombia`,
			];

			for (const url of urls) {
				const html = await fetchPage(url);
				if (!html) continue;

				const $ = cheerio.load(html);
				$("a[href]").each((_, el) => {
					const href = $(el).attr("href");
					if (!href) return;

					if (!looksLikeJobLink(href)) {
						return;
					}

					const fullUrl = toAbsoluteUrl(href, this.baseUrl).split("#")[0];
					links.add(normalizeUrl(fullUrl));
					if (links.size >= limit) return false;
					return;
				});

				if (links.size >= limit) break;
			}

			console.log(`📊 AccionTrabajo - Enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al extraer links de AccionTrabajo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				normalizeText($("h1").first().text()) ||
				normalizeText($("meta[property='og:title']").attr("content")) ||
				normalizeText($("title").text()) ||
				"Sin titulo";

			const company =
				normalizeText(
					$(
						"[itemprop='hiringOrganization'], .company, .empresa, [class*='company'], [class*='empresa']",
					)
						.first()
						.text(),
				) || "Empresa no especificada";

			const location =
				normalizeText(
					$(
						"[itemprop='jobLocation'], .location, .ubicacion, [class*='location'], [class*='ubicacion']",
					)
						.first()
						.text(),
				) ||
				extractLocationFromTitle($("title").text()) ||
				null;

			const description =
				normalizeText($("meta[name='description']").attr("content")) ||
				normalizeText(
					$(
						"[itemprop='description'], .description, .job-description, [class*='description']",
					)
						.first()
						.text(),
				) ||
				"Sin descripcion";

			const salary =
				normalizeText(
					$("[itemprop='baseSalary'], .salary, [class*='salary'], span:contains('$')")
						.first()
						.text(),
				) || null;

			return {
				title: sanitizeTitle(title),
				company,
				location,
				description: description.substring(0, 5000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error("❌ Error al extraer detalle de AccionTrabajo:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "acciontrabajo";
	}
}

const toAbsoluteUrl = (href, baseUrl) => {
	if (href.startsWith("http")) return href;
	if (href.startsWith("/")) return `${baseUrl}${href}`;
	return `${baseUrl}/${href}`;
};

const looksLikeJobLink = (href) => {
	if (!href) return false;
	if (
		href.includes("/publicar-empleos") ||
		href.includes("/empleos-de-") ||
		href.includes("/ofertas-de-trabajo-en-")
	) {
		return false;
	}
	return /^\/trabajo-[^/]+\/.+/i.test(href);
};

const normalizeText = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim();

const slugify = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "empleo";

const extractLocationFromTitle = (title) => {
	const match = normalizeText(title).match(/ en ([^|]+) -/i);
	return match?.[1]?.trim() || null;
};

const sanitizeTitle = (title) => {
	const normalized = normalizeText(title);
	return normalized.replace(/^Trabajos de\s+/i, "").trim();
};
