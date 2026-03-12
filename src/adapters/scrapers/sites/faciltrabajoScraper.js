import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

export class FaciltrabajoScraper extends ScraperProvider {
	constructor() {
		super();
		this.baseUrl = "https://www.faciltrabajo.com.co";
	}

	async extractJobLinks(profession, limit = 10) {
		const links = new Set();

		try {
			const slug = slugify(profession);
			const candidates = [
				`${this.baseUrl}/busqueda-empleo-${slug}.html`,
				`${this.baseUrl}/trabajo-${slug}-1.html`,
				`${this.baseUrl}`,
			];

			for (const url of candidates) {
				const html = await fetchPage(url);
				if (!html) continue;

				const $ = cheerio.load(html);
				$("a[href*='empleo-'][href$='.html']").each((_, el) => {
					const href = $(el).attr("href");
					if (!href) return;
					const absolute = toAbsoluteUrl(href, this.baseUrl);
					if (absolute.includes("/empleo-") && absolute.endsWith(".html")) {
						links.add(normalizeUrl(absolute));
					}
					if (links.size >= limit) return false;
					return;
				});

				if (links.size >= limit) break;
			}

			console.log(`📊 FacilTrabajo - Enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al extraer links de FacilTrabajo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				$("h1").first().text().trim() ||
				extractFromTitle($("title").text()) ||
				"Sin titulo";

			const company =
				extractCompanyFromTitle($("title").text()) ||
				normalizeText(
					$("a[href*='empresa'], .empresa, .company, strong:contains('Empresa')")
						.first()
						.text(),
				) ||
				"Empresa no especificada";

			const location =
				extractLocationFromTitle($("title").text()) ||
				normalizeText(
					$(".ubicacion, .location, .ciudad, span:contains('Ubicación')")
						.first()
						.text(),
				) ||
				null;

			const description =
				normalizeText($("meta[name='description']").attr("content")) ||
				normalizeText(
					$(
						".job-description, .descripcion, #descripcion, .detalle-oferta, .panel-body",
					)
						.first()
						.text(),
				) ||
				"Sin descripcion";

			const salary =
				normalizeText(
					$(".salary, .salario, span:contains('$'), span:contains('COP')")
						.first()
						.text(),
				) || null;

			return {
				title,
				company,
				location,
				description: description.substring(0, 5000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error("❌ Error al extraer detalle de FacilTrabajo:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "faciltrabajo";
	}
}

const toAbsoluteUrl = (href, baseUrl) => {
	if (href.startsWith("http")) return href;
	if (href.startsWith("/")) return `${baseUrl}${href}`;
	return `${baseUrl}/${href}`;
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
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "") || "empleo";

const extractFromTitle = (title) => {
	const normalized = normalizeText(title);
	if (!normalized) return null;
	return normalized.split(" en ")[0].replace(/^Trabajos de\s+/i, "").trim();
};

const extractCompanyFromTitle = (title) => {
	const normalized = normalizeText(title);
	const match = normalized.match(/ en (.+?) en [^|]+\|/i);
	return match?.[1]?.trim() || null;
};

const extractLocationFromTitle = (title) => {
	const normalized = normalizeText(title);
	const match = normalized.match(/ en [^|]+ en ([^|]+)\|/i);
	return match?.[1]?.trim() || null;
};
