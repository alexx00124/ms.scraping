import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://www.opcionempleo.com.co";

export class OpcionempleoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("opcionempleo"),
		});
	}

	getSourceName() {
		return "opcionempleo";
	}

	async extractJobLinks(profession, limit = 10) {
		const groups = buildKeywordGroups(profession);
		const links = new Set();
		const searchUrl = buildSearchUrl(profession);

		// Opcionempleo carga los resultados en la primera página via HTML estático.
		// La paginación es JS-driven (botón "Siguiente página"), pero con 20 resultados
		// por página la primera página es suficiente para el límite por carrera.
		const results = await this.withSourcePage(
			searchUrl,
			{ kind: "discovery", timeoutMs: this.getPolicy().getTimeout("discovery") },
			async (page) => {
				// Esperar a que los listings carguen
				await page.waitForSelector("article.job", { timeout: 15000 }).catch(() => {});
				await page.waitForTimeout(1200).catch(() => {});

				return page.evaluate(() => {
					const cards = Array.from(document.querySelectorAll("article.job.clicky"));
					return cards.map((card) => {
						const anchor = card.querySelector("h2 a");
						const href = anchor?.href || card.getAttribute("data-url") || "";
						const title = anchor?.getAttribute("title") || anchor?.textContent?.replace(/\s+/g, " ").trim() || "";
						const company = card.querySelector("p.company")?.textContent?.replace(/\s+/g, " ").trim() || "";
						const location = card.querySelector("ul.location li")?.textContent?.replace(/\s+/g, " ").trim() || "";
						const desc = card.querySelector("div.desc")?.textContent?.replace(/\s+/g, " ").trim() || "";
						return { href, title, company, location, desc };
					}).filter((item) => item.href && item.title);
				});
			},
		).catch((err) => {
			console.error(`❌ Opcionempleo - Error en discovery: ${err.message}`);
			return [];
		});

		for (const result of results) {
			const haystack = normalizeSearchText(
				`${result.title} ${result.company} ${result.desc}`,
			);
			if (!matchesGroups(haystack, groups)) continue;
			if (looksNoise(result.title)) continue;

			// La URL puede ser relativa (/jobad/co...) o absoluta
			const fullUrl = result.href.startsWith("http")
				? result.href
				: `${BASE_URL}${result.href}`;
			links.add(normalizeUrl(fullUrl));
			if (links.size >= limit) break;
		}

		console.log(`📊 Opcionempleo - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail") },
				async (page) => {
					await page.waitForTimeout(1500).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) =>
							String(value || "")
								.replace(/\s+/g, " ")
								.trim() || null;

						// Título — Opcionempleo redirige al origen externo; intentamos h1 primero
						const title =
							text(document.querySelector("h1")?.textContent) ||
							document.title?.split("|")[0]?.trim() ||
							null;

						// Empresa — puede estar en varios lugares según el origen
						const company =
							text(document.querySelector(".company")?.textContent) ||
							text(document.querySelector("[class*='company']")?.textContent) ||
							text(document.querySelector("[class*='employer']")?.textContent) ||
							null;

						// Ubicación
						const location =
							text(document.querySelector(".location")?.textContent) ||
							text(document.querySelector("[class*='location']")?.textContent) ||
							null;

						// Descripción — tomar el bloque de texto más largo de la página
						const descCandidates = Array.from(
							document.querySelectorAll("div, section, article"),
						)
							.filter((el) => {
								const t = (el.textContent || "").replace(/\s+/g, " ").trim();
								return t.length > 200 && t.length < 15000;
							})
							.sort((a, b) => b.textContent.length - a.textContent.length);

						const description =
							text(descCandidates[0]?.textContent)?.slice(0, 5000) ||
							text(document.body?.innerText)?.slice(0, 5000);

						return { title, company, location, description };
					});

					return {
						title: cleanTitle(data.title) || "Sin titulo",
						company: cleanCompany(data.company) || "Empresa no especificada",
						location: cleanLocation(data.location) || null,
						description: cleanDescription(data.description) || "Sin descripcion",
						salary: null,
						url: normalizeUrl(url),
					};
				},
			);
		} catch (error) {
			console.error(`❌ Error al extraer detalle de Opcionempleo: ${error.message}`);
			return null;
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	"de","del","la","las","el","los","en","y","o","para","con","sin","por","un","una","al","se",
]);

const normalizeSearchText = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const tokenize = (value) =>
	normalizeSearchText(value)
		.split(" ")
		.filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const TOKEN_ALIASES = {
	desarrollador: ["developer", "programador", "full stack", "backend", "frontend"],
	software: ["developer", "desarrollo", "aplicaciones", "sistemas", "full stack"],
	analista: ["analyst"],
	datos: ["data"],
	ingeniero: ["engineer"],
	sistemas: ["software", "ti", "informacion", "tecnologia", "soporte"],
};

const buildKeywordGroups = (profession) => {
	const tokens = tokenize(profession);
	if (tokens.length === 0) return [];
	return tokens.map((token) => new Set([token, ...(TOKEN_ALIASES[token] || [])]));
};

const matchesGroups = (haystack, groups) => {
	if (groups.length === 0) return true;
	let matchedGroups = 0;
	for (const group of groups) {
		const matched = Array.from(group).some((term) => haystack.includes(term));
		if (matched) matchedGroups += 1;
	}
	return matchedGroups >= requiredMatches(groups.length);
};

const requiredMatches = (groupCount) => {
	if (groupCount <= 1) return 1;
	if (groupCount === 2) return 2;
	return Math.max(2, Math.ceil(groupCount / 2));
};

const buildSearchUrl = (profession) => {
	const slug = slugify(profession);
	return slug
		? `${BASE_URL}/trabajo-${slug}`
		: `${BASE_URL}/trabajo`;
};

const slugify = (value) =>
	normalizeSearchText(value)
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const looksNoise = (title) =>
	/ver oferta|postularme|compartir|guardar|siguiente/i.test(String(title || ""));

const cleanTitle = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim() || null;

const cleanCompany = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim() || null;

const cleanLocation = (value) => {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.replace(/\s*-\s*h[ií]brido$/i, "")
		.trim();
	return normalized || null;
};

const cleanDescription = (value) => {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.trim();
	return normalized || null;
};
