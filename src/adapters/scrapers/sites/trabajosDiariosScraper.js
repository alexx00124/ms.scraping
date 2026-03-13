import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://co.trabajosdiarios.com";

export class TrabajosDiariosScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("trabajosdiarios"),
		});
	}

	getSourceName() {
		return "trabajosdiarios";
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
					await page.waitForSelector("script[type='application/ld+json'], a[href^='/trabajo/']", {
						timeout: 12000,
					}).catch(() => {});
					await page.waitForTimeout(600).catch(() => {});

					return page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim();

						const parseJsonLd = () => {
							const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
							for (const script of scripts) {
								try {
									const parsed = JSON.parse(script.textContent || "null");
									const graph = Array.isArray(parsed)
										? parsed
										: Array.isArray(parsed?.["@graph"])
											? parsed["@graph"]
											: [parsed];
									const list = graph.find((item) => item?.["@type"] === "ItemList" && Array.isArray(item?.itemListElement));
									if (!list) continue;
									return list.itemListElement
										.map((item) => ({
											title: text(item?.name),
											href: text(item?.url),
										}))
										.filter((item) => item.href && item.title);
								} catch {
									// ignore invalid blocks
								}
							}
							return [];
						};

						const fromJsonLd = parseJsonLd();
						if (fromJsonLd.length > 0) return fromJsonLd;

						return Array.from(document.querySelectorAll("a[href^='/trabajo/']"))
							.map((anchor) => ({
								title: text(anchor.querySelector("h2, h3")?.textContent || anchor.textContent),
								href: anchor.href || anchor.getAttribute("href") || "",
							}))
							.filter((item) => item.href && item.title);
					});
				},
			).catch((error) => {
				console.error(`❌ Trabajos Diarios - Error en discovery: ${error.message}`);
				return [];
			});

			for (const result of results) {
				const haystack = normalizeSearchText(result.title);
				if (!matchesGroups(haystack, groups)) continue;
				if (looksNoise(result.title)) continue;

				const fullUrl = result.href.startsWith("http")
					? result.href
					: `${BASE_URL}${result.href}`;
				links.add(normalizeUrl(fullUrl));
				if (links.size >= limit) break;
			}
		}

		console.log(`📊 Trabajos Diarios - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail"), reuseContext: false },
				async (page) => {
					await page.waitForSelector("script[type='application/ld+json'], #job-desc, h1", {
						timeout: 12000,
					}).catch(() => {});
					await page.waitForTimeout(600).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;
						const parseJsonLd = () => {
							const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
							for (const script of scripts) {
								try {
									const parsed = JSON.parse(script.textContent || "null");
									const graph = Array.isArray(parsed)
										? parsed
										: Array.isArray(parsed?.["@graph"])
											? parsed["@graph"]
											: [parsed];
									const jobPosting = graph.find((item) => item?.["@type"] === "JobPosting");
									if (jobPosting) return jobPosting;
								} catch {
									// ignore invalid blocks
								}
							}
							return null;
						};

						const job = parseJsonLd();
						const title =
							text(job?.title) ||
							text(document.querySelector("#titulo_oferta")?.textContent) ||
							text(document.querySelector("h1")?.textContent);
						const company =
							text(job?.hiringOrganization?.name) ||
							text(document.querySelector("a[href*='/empresa/']")?.textContent);
						const location =
							text(job?.jobLocation?.address?.addressLocality) && text(job?.jobLocation?.address?.addressRegion)
								? `${text(job?.jobLocation?.address?.addressLocality)}, ${text(job?.jobLocation?.address?.addressRegion)}`
								: text(document.querySelector(".bi-geo-alt")?.closest(".row")?.textContent);
						const description =
							text(job?.description) ||
							text(document.querySelector("#job-desc")?.innerText) ||
							text(document.body?.innerText);
						const salaryValue = job?.baseSalary?.value?.value;
						const salary = salaryValue ? `COP $${salaryValue}` : text(document.querySelector(".bi-cash-stack")?.closest(".row")?.textContent);

						return { title, company, location, description, salary };
					});

					return {
						title: cleanTitle(data.title) || "Sin titulo",
						company: cleanCompany(data.company) || "Empresa no especificada",
						location: cleanLocation(data.location) || null,
						description: cleanDescription(data.description) || "Sin descripcion",
						salary: cleanSalary(data.salary) || null,
						url: normalizeUrl(url),
					};
				},
			);
		} catch (error) {
			console.error(`❌ Error al extraer detalle de Trabajos Diarios: ${error.message}`);
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
	psicologia: ["psicologo", "seleccion", "talento humano"],
	derecho: ["abogado", "juridico", "legal"],
	administracion: ["administrador", "administrativa", "gestion"],
	empresas: ["administracion", "empresarial"],
	programacion: ["desarrollador", "software", "developer"],
	desarrollador: ["programacion", "software", "developer", "fullstack", "backend", "frontend"],
	software: ["programacion", "desarrollador", "sistemas"],
	sistemas: ["software", "programacion", "tecnologia"],
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
	const slugCandidates = buildSlugCandidates(profession);
	const maxPages = Math.max(1, Math.min(3, Math.ceil(limit / 12)));
	const urls = [];
	for (const slug of slugCandidates) {
		for (let page = 1; page <= maxPages; page += 1) {
			urls.push(page === 1 ? `${BASE_URL}/ofertas-trabajo/de-${slug}` : `${BASE_URL}/ofertas-trabajo/de-${slug}?page=${page}`);
		}
	}
	return Array.from(new Set(urls));
};

const buildSlugCandidates = (profession) => {
	const normalized = normalizeSearchText(profession);
	const direct = DIRECT_SLUGS[normalized];
	const candidates = [];
	if (direct) candidates.push(...direct);

	const tokens = tokenize(profession);
	for (const token of tokens) {
		if (DIRECT_SLUGS[token]) candidates.push(...DIRECT_SLUGS[token]);
		candidates.push(token);
	}

	if (normalized && !direct) {
		candidates.push(normalized.replace(/\s+/g, "-"));
	}

	return Array.from(new Set(candidates.filter(Boolean)));
};

const DIRECT_SLUGS = {
	"desarrollador de software": ["programacion"],
	"ingenieria de software": ["programacion"],
	"ingenieria de sistemas": ["programacion"],
	software: ["programacion"],
	programacion: ["programacion"],
	psicologia: ["psicologia"],
	psicologo: ["psicologia"],
	derecho: ["derecho"],
	juridico: ["derecho"],
	legal: ["derecho"],
	"administracion de empresas": ["administracion"],
	administracion: ["administracion"],
	administrador: ["administracion"],
};

const looksNoise = (title) => /publicar empleo|hazte premium|reclutadores/i.test(String(title || ""));

const stripUiNoise = (value) =>
	String(value || "")
		.replace(/postularse a la oferta|postularme al trabajo|leer mas|reportar empleo/gi, " ")
		.replace(/\s+/g, " ")
		.trim();

const cleanTitle = (value) => stripUiNoise(value) || null;

const cleanCompany = (value) => stripUiNoise(value) || null;

const cleanLocation = (value) => {
	const normalized = stripUiNoise(value)
		.replace(/^ubicacion:\s*/i, "")
		.replace(/^ubicación:\s*/i, "");
	return normalized || null;
};

const cleanDescription = (value) => stripUiNoise(value) || null;

const cleanSalary = (value) => {
	const normalized = stripUiNoise(value)
		.replace(/^salario:\s*/i, "")
		.replace(/\/ mensual/i, "")
		.trim();
	if (!normalized) return null;
	return normalized;
};
