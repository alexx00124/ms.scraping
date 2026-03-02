import * as cheerio from "cheerio";
import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";
import fetchPage from "../fetchPage.js";

/**
 * ColombiaTrabajos Scraper - Migrado desde feat/smart-search-by-career
 * Scraper para colombia.trabajos.com
 */
export class ColombiatrabajosScraper extends ScraperProvider {
	async extractJobLinks(profession, limit = 10) {
		try {
			const encodedQuery = encodeURIComponent(profession.trim());
			const searchUrl = `https://colombia.trabajos.com/bolsa-empleo/?IDPAIS=40&BUSCAR.x=0&BUSCAR.y=0&CADENA=${encodedQuery}`;

			console.log("🔍 ColombiaTrabajos - Buscando (solo primera página):", searchUrl);
			const html = await fetchPage(searchUrl);
			if (!html) return [];

			const $ = cheerio.load(html);
			const links = new Set();

			$('a.oferta.j4m_link[href*="/bolsa-empleo/"]').each((_, el) => {
				const href = $(el).attr("href");
				const fullUrl = href.startsWith("http")
					? href
					: `https://colombia.trabajos.com${href}`;

				links.add(normalizeUrl(fullUrl));

				// Solo hasta completar el límite definido
				if (links.size >= limit) return false;
			});

			console.log(`📍 ColombiaTrabajos - ${links.size} enlaces obtenidos`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error en ColombiaTrabajos:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			console.log("📄 ColombiaTrabajos - Obteniendo detalles:", url);

			const html = await fetchPage(url);
			if (!html) return null;

			const $ = cheerio.load(html);

			const title = $("h2.nombre").text().trim() || $("h1").first().text().trim() || "Sin titulo";

			const description =
				$("div.subtitulo p").text().trim().replace(/\s+/g, " ") ||
				$(".job-description").text().replace(/\s+/g, " ").trim() ||
				"Sin descripcion";

			const location =
				$("div.localizacion").text().replace(/\s+/g, " ").trim() || null;

			const salary =
				$("div.detalle h4:contains('Salario') + strong").text().trim() || null;

			const company = $("a.empresa").text().trim() || "Empresa no especificada";

			console.log(`✅ ColombiaTrabajos - Trabajo extraído: ${title}`);

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
				`❌ Error obteniendo detalles de ColombiaTrabajos ${url}:`,
				error.message,
			);
			return null;
		}
	}

	getSourceName() {
		return "colombiatrabajos";
	}
}
