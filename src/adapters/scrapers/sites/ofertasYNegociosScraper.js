import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://ofertasynegocios.co";

export class OfertasYNegociosScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("ofertasynegocios"),
		});
	}

	getSourceName() {
		return "ofertasynegocios";
	}

	async extractJobLinks(profession, limit = 10) {
		const groups = buildKeywordGroups(profession);
		const links = new Set();
		const searchUrls = buildSearchUrls(profession, limit);

		for (const url of searchUrls) {
			if (links.size >= limit) break;

			const results = await this.withSourcePage(
				url,
				{ kind: "discovery", timeoutMs: this.getPolicy().getTimeout("discovery"), reuseContext: false },
				async (page) => {
					await page.waitForSelector("article.latestPost.excerpt, h1.postsby", { timeout: 12000 }).catch(() => {});
					await page.waitForTimeout(700).catch(() => {});

					return page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
						return Array.from(document.querySelectorAll("article.latestPost.excerpt"))
							.map((card) => {
								const anchor = card.querySelector("h2.title a");
								const href = anchor?.href || anchor?.getAttribute("href") || "";
								const title = text(anchor?.textContent);
								const snippet = text(card.querySelector(".front-view-content")?.textContent);
								return { href, title, snippet };
							})
							.filter((item) => item.href && item.title);
					});
				},
			).catch((error) => {
				console.error(`❌ Ofertas y Negocios - Error en discovery: ${error.message}`);
				return [];
			});

			for (const result of results) {
				const haystack = normalizeSearchText(`${result.title} ${result.snippet}`);
				if (!matchesGroups(haystack, groups)) continue;
				if (looksNoise(result.title, result.snippet)) continue;

				const fullUrl = result.href.startsWith("http") ? result.href : `${BASE_URL}${result.href}`;
				links.add(normalizeUrl(fullUrl));
				if (links.size >= limit) break;
			}
		}

		console.log(`📊 Ofertas y Negocios - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail"), reuseContext: false },
				async (page) => {
					await page.waitForSelector("h1.single-title, .thecontent, script[type='application/ld+json']", {
						timeout: 12000,
					}).catch(() => {});
					await page.waitForTimeout(700).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;
						const parseArticle = () => {
							const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
							for (const script of scripts) {
								try {
									const parsed = JSON.parse(script.textContent || "null");
									const graph = Array.isArray(parsed)
										? parsed
										: Array.isArray(parsed?.["@graph"])
											? parsed["@graph"]
											: [parsed];
									const article = graph.find((item) => item?.["@type"] === "Article");
									if (article) return article;
								} catch {
									// ignore invalid blocks
								}
							}
							return null;
						};

						const article = parseArticle();
						const title =
							text(article?.headline || article?.name) ||
							text(document.querySelector("h1.single-title")?.textContent) ||
							text(document.querySelector("h1")?.textContent);
						const description =
							text(document.querySelector(".thecontent")?.innerText) ||
							text(article?.description) ||
							text(document.querySelector("meta[name='description']")?.getAttribute("content")) ||
							text(document.body?.innerText);
						const metaDescription = text(document.querySelector("meta[name='description']")?.getAttribute("content"));
						const publishedAt = text(document.querySelector(".post-info .thetime span")?.textContent);

						return {
							title,
							description,
							metaDescription,
							publishedAt,
						};
					});

					return {
						title: cleanTitle(data.title) || "Sin titulo",
						company: extractCompany(data.description, data.metaDescription) || "Empresa no especificada",
						location: extractLocation(data.description, data.metaDescription),
						description: cleanDescription(data.description) || "Sin descripcion",
						salary: null,
						url: normalizeUrl(url),
					};
				},
			);
		} catch (error) {
			console.error(`❌ Error al extraer detalle de Ofertas y Negocios: ${error.message}`);
			return null;
		}
	}
}

const STOPWORDS = new Set([
	"de", "del", "la", "las", "el", "los", "en", "y", "o", "para", "con", "sin", "por", "un", "una", "al", "se",
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
	psicologia: ["psicologo", "psicologia", "psicopedagogia"],
	derecho: ["abogado", "juridico", "legal"],
	administracion: ["administracion", "administrativo", "finanzas", "gestion"],
	empresas: ["administracion", "empresarial"],
	desarrollador: ["software", "programador", "developer", "full stack"],
	software: ["desarrollador", "sistemas", "java", "aplicaciones"],
	sistemas: ["software", "desarrollador", "tecnologia"],
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

const buildSearchUrls = (profession, limit) => {
	const terms = buildSearchTerms(profession);
	const maxPages = Math.max(1, Math.min(3, Math.ceil(limit / 8)));
	const urls = [];
	for (const term of terms) {
		const encoded = encodeURIComponent(term);
		for (let page = 1; page <= maxPages; page += 1) {
			urls.push(page === 1 ? `${BASE_URL}/?s=${encoded}` : `${BASE_URL}/page/${page}?s=${encoded}`);
		}
	}
	return Array.from(new Set(urls));
};

const buildSearchTerms = (profession) => {
	const normalized = normalizeSearchText(profession);
	const tokens = tokenize(profession);
	const terms = [];
	if (normalized) terms.push(normalized);
	for (const token of tokens) {
		terms.push(token);
		for (const alias of TOKEN_ALIASES[token] || []) {
			terms.push(alias);
		}
	}
	return Array.from(new Set(terms.filter(Boolean))).slice(0, 3);
};

const looksNoise = (title, snippet) =>
	/estrategias digitales|buy adspace|hide ads|archivo|contacto/i.test(`${title} ${snippet}`);

const stripUiNoise = (value) =>
	String(value || "")
		.replace(/whatsapp|compartir|twittear|telegram|email|pin/gi, " ")
		.replace(/\b\d+\b/g, " ")
		.replace(/\bcompartir\b/gi, " ")
		.replace(/read more\.{3}/gi, " ")
		.replace(/comparta la informacion utilizando los botones de las redes sociales\.?/gi, " ")
		.replace(/\s+/g, " ")
		.trim();

const cleanTitle = (value) => stripUiNoise(value) || null;

const cleanDescription = (value) => stripUiNoise(value) || null;

const extractCompany = (...values) => {
	const haystack = values.filter(Boolean).join(" ");
	const match = haystack.match(/([A-ZÁÉÍÓÚÑ][^.!?]{2,120}?)\s+requiere/i);
	if (match?.[1]) {
		return stripUiNoise(match[1])
			.replace(/^la\s+/i, "")
			.replace(/^el\s+/i, "")
			.replace(/^compartir\s+/i, "") || null;
	}
	return null;
};

const extractLocation = (...values) => {
	const haystack = values.filter(Boolean).join(" ");
	const match = haystack.match(/(Bogotá(?:\s*D\.C\.)?|Medell[ií]n|Cali|Barranquilla|Cartagena|Bucaramanga|Monter[ií]a|Cúcuta|Pereira|Manizales|Ibagu[eé]|Remoto|Colombia)/i);
	return match?.[1] ? stripUiNoise(match[1]) : null;
};
