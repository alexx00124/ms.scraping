import * as cheerio from "cheerio";
import got from "got";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

/**
 * CompuTrabajo Scraper - Migrado desde feat/smart-search-by-career
 * Scraper para co.computrabajo.com
 */
export class ComputrabajoScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		const links = new Set();
		const maxPages = Math.min(Math.ceil(limit / 20), 100);

		try {
			for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
				const formattedQuery = profession.replace(/\s+/g, "-").toLowerCase();
				const url = `https://co.computrabajo.com/trabajo-de-${formattedQuery}?p=${currentPage}`;
				console.log(`🔎 CompuTrabajo - Página ${currentPage}: ${url}`);

				const response = await got(url, {
					timeout: { request: 20000 },
					retry: { limit: 2 },
				});
				const $ = cheerio.load(response.body);

				const pageLinks = $("a.js-o-link.fc_base");
				if (pageLinks.length === 0) break;

				pageLinks.each((_, el) => {
					const href = $(el).attr("href");
					if (href) {
						links.add(normalizeUrl(`https://co.computrabajo.com${href}`));
					}
				});

				console.log(`📊 CompuTrabajo - Total enlaces: ${links.size}`);
				if (links.size >= limit) break;
			}

			console.log(`📊 CompuTrabajo - Total enlaces encontrados: ${links.size}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al scrapear CompuTrabajo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 CompuTrabajo - Obteniendo detalles:", url);

			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title =
				$("h1.fwB.fs24.mb5.box_detail.w100_m").text().trim() ||
				$("h1").first().text().trim() ||
				"Sin titulo";

			const description =
				$("p.mbB").text().replace(/\s+/g, " ").trim() ||
				$(".job-description").text().replace(/\s+/g, " ").trim() ||
				"Sin descripcion";

			// Iterar sobre todos los contenedores para encontrar empresa y ubicación
			let empresaUbicacion = null;

			$(".container").each((_, el) => {
				const texto = $(el).find("p.fs16").first().text().trim();
				if (texto.includes(" - ")) {
					empresaUbicacion = texto;
					return false; // Detiene el loop
				}
			});

			let company = "Empresa no especificada";
			let location = null;

			if (empresaUbicacion) {
				const [empresa, ...ubicacionParts] = empresaUbicacion.split(" - ");
				company = empresa.trim();
				location = ubicacionParts.join(" - ").trim() || null;
			}

			const salaryTag = $("span.tag.base.mb10").filter((_, el) =>
				$(el).text().includes("$"),
			);
			const salary = salaryTag.length > 0 ? salaryTag.first().text().trim() : null;

			console.log(`✅ CompuTrabajo - Trabajo extraído: ${title}`);

			return {
				title,
				company,
				location,
				description: description.substring(0, 5000),
				salary,
				url: normalizeUrl(url),
			};
		} catch (error) {
			console.error(
				`❌ Error obteniendo detalles de CompuTrabajo ${url}:`,
				error.message,
			);
			return null;
		}
	}

	getSourceName() {
		return "computrabajo";
	}
}
