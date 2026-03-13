import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://co.computrabajo.com";

export class ComputrabajoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("computrabajo"),
		});
	}

	getSourceName() {
		return "computrabajo";
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
					await page.waitForSelector("#offersGridOfferContainer article.box_offer, script[type='application/ld+json']", { timeout: 15000 }).catch(() => {});
					await page.waitForTimeout(900).catch(() => {});

					return page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
						return Array.from(document.querySelectorAll("#offersGridOfferContainer article.box_offer[data-offers-grid-offer-item-container]"))
							.map((card) => {
								const anchor = card.querySelector("a.js-o-link[href*='/ofertas-de-trabajo/']");
								const title = text(anchor?.textContent);
								const href = anchor?.href || anchor?.getAttribute("href") || "";
								const company = text(card.querySelector("p.fc_base.t_ellipsis")?.textContent);
								const location = text(card.querySelector("p.fs16.fc_base")?.textContent);
								const description = text(card.querySelector("p.mb10")?.textContent);
								const freshness = text(card.querySelector("p.fs13.fc_aux.mt15")?.textContent);
								return { title, href, company, location, description, freshness };
							})
							.filter((item) => item.href && item.title);
					});
				},
			).catch((error) => {
				console.error(`❌ CompuTrabajo - Error en discovery: ${error.message}`);
				return [];
			});

			for (const result of results) {
				const haystack = normalizeSearchText(`${result.title} ${result.company} ${result.description}`);
				if (!matchesGroups(haystack, groups)) continue;
				if (!isFreshEnough(result.freshness)) continue;
				if (looksNoise(result.title, result.description)) continue;

				const fullUrl = result.href.startsWith("http") ? result.href : `${BASE_URL}${result.href}`;
				links.add(normalizeUrl(stripHash(fullUrl)));
				if (links.size >= limit) break;
			}
		}

		console.log(`📊 CompuTrabajo - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail"), reuseContext: false },
				async (page) => {
					await page.waitForSelector("main.detail_fs h1.box_detail, div[div-link='oferta']", { timeout: 15000 }).catch(() => {});
					await page.waitForTimeout(1000).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;
						const title = text(document.querySelector("main.detail_fs h1.box_detail")?.textContent);
						const companyLocation = text(document.querySelector("main.detail_fs h1.box_detail + p.fs16")?.textContent);
						const description = text(document.querySelector("div[div-link='oferta'] > p.mbB")?.innerText) || text(document.querySelector("div[div-link='oferta']")?.innerText);
						const freshness = text(document.querySelector("div[div-link='oferta'] > p.fc_aux.fs13:last-of-type")?.textContent);
						return { title, companyLocation, description, freshness };
					});

					if (!isFreshEnough(data.freshness)) {
						return null;
					}

					const { company, location } = splitCompanyLocation(data.companyLocation);

					return {
						title: cleanText(data.title) || "Sin titulo",
						company: cleanText(company) || "Empresa no especificada",
						location: cleanText(location) || null,
						description: cleanDescription(data.description) || "Sin descripcion",
						salary: null,
						url: normalizeUrl(url),
					};
				},
			);
		} catch (error) {
			console.error(`❌ Error al extraer detalle de CompuTrabajo: ${error.message}`);
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
	psicologia: ["psicologo", "psicologia", "psicosocial", "seleccion"],
	derecho: ["abogado", "juridico", "legal"],
	administracion: ["administrativo", "gestion", "administrativa"],
	empresas: ["administracion", "empresarial"],
	desarrollador: ["software", "programador", "developer", "full stack"],
	software: ["desarrollador", "sistemas", "developer"],
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
	const maxPages = Math.max(1, Math.min(2, Math.ceil(limit / 20)));
	const urls = [];
	for (const term of terms) {
		const slug = slugify(term);
		if (!slug) continue;
		for (let page = 1; page <= maxPages; page += 1) {
			urls.push(page === 1 ? `${BASE_URL}/trabajo-de-${slug}` : `${BASE_URL}/trabajo-de-${slug}?p=${page}`);
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

const slugify = (value) => normalizeSearchText(value).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const stripHash = (value) => String(value || "").split("#")[0];

const looksNoise = (title, description) => /sponsored|patrocinado|ocultar oferta/i.test(`${title} ${description}`);

const isFreshEnough = (label) => {
	const value = String(label || "").toLowerCase().trim();
	if (!value) return false;
	if (value.includes("hace") || value.includes("ayer") || value.includes("actualizada")) return true;
	const yearMatch = value.match(/20\d{2}/);
	if (!yearMatch) return false;
	return Number(yearMatch[0]) >= 2025;
};

const splitCompanyLocation = (value) => {
	const normalized = cleanText(value);
	if (!normalized) return { company: null, location: null };
	const parts = normalized.split(" - ");
	if (parts.length < 2) return { company: normalized, location: null };
	return {
		company: parts[0]?.trim() || null,
		location: parts.slice(1).join(" - ").trim() || null,
	};
};

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;

const cleanDescription = (value) => cleanText(value)?.slice(0, 5000) || null;
