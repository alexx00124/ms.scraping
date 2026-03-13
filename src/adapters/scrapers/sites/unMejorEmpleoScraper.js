import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://www.unmejorempleo.com.co";

export class UnMejorEmpleoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("unmejorempleo"),
		});
	}

	getSourceName() {
		return "unmejorempleo";
	}

	async extractJobLinks(profession, limit = 10) {
		const groups = buildKeywordGroups(profession);
		const links = new Set();

		const results = await this.withSourcePage(
			`${BASE_URL}/`,
			{ kind: "discovery", timeoutMs: this.getPolicy().getTimeout("discovery"), reuseContext: false },
			async (page) => {
				await page.waitForSelector("form[name='form1'], input[name='palabra_clave']", { timeout: 12000 });
				await page.locator("input[name='palabra_clave']").first().fill(profession);
				const submit = page.locator("form[name='form1'] button[type='submit'], form[name='form1'] #enviarb, form[name='form1'] .btn-primary").first();
				await Promise.all([
					page.waitForLoadState("domcontentloaded"),
					submit.click(),
				]);
				await page.waitForSelector(".item-destacado h3 a, .item-normal h3 a", { timeout: 12000 }).catch(() => {});
				await page.waitForTimeout(700).catch(() => {});

				return page.evaluate(() =>
					Array.from(document.querySelectorAll(".item-destacado, .item-normal"))
						.map((card) => {
							if (card.classList.contains("advert")) return null;
							const anchor = card.querySelector("h3 a[href]");
							const summaryItems = Array.from(card.querySelectorAll("ul.list-unstyled > li"));
							return {
								href: anchor?.href || anchor?.getAttribute("href") || "",
								title: anchor?.textContent?.replace(/\s+/g, " ").trim() || "",
								location: summaryItems[0]?.textContent?.replace(/\s+/g, " ").trim() || "",
								description: summaryItems[1]?.textContent?.replace(/\s+/g, " ").trim() || "",
								meta: summaryItems[2]?.textContent?.replace(/\s+/g, " ").trim() || "",
							};
						})
						.filter(Boolean)
						.filter((item) => item.href && item.title),
				);
			},
		).catch((error) => {
			console.error(`❌ Un Mejor Empleo - Error en discovery: ${error.message}`);
			return [];
		});

		for (const result of results) {
			const haystack = normalizeSearchText(
				`${result.title} ${result.location} ${result.description} ${result.meta}`,
			);
			if (!matchesGroups(haystack, groups)) continue;
			if (looksNoise(result.title, result.description)) continue;

			const fullUrl = result.href.startsWith("http") ? result.href : `${BASE_URL}/${stripLeadingSlash(result.href)}`;
			links.add(normalizeUrl(fullUrl));
			if (links.size >= limit) break;
		}

		console.log(`📊 Un Mejor Empleo - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail"), reuseContext: false },
				async (page) => {
					await page.waitForTimeout(900).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;
						const pickValueAfterHeading = (headingText) => {
							const headings = Array.from(document.querySelectorAll("h4"));
							const heading = headings.find((item) => (item.textContent || "").toLowerCase().includes(headingText));
							if (!heading) return null;
							const parts = [];
							let current = heading.nextSibling;
							while (current) {
								if (current.nodeType === Node.ELEMENT_NODE && current.tagName === "H4") break;
								if (current.nodeType === Node.TEXT_NODE) {
									const value = text(current.textContent);
									if (value) parts.push(value);
								}
								if (current.nodeType === Node.ELEMENT_NODE) {
									const value = text(current.textContent);
									if (value) parts.push(value);
								}
								current = current.nextSibling;
							}
							return text(parts.join(" "));
						};

						const jsonLd = Array.from(document.querySelectorAll("script[type='application/ld+json']"))
							.map((node) => node.textContent || "")
							.map((raw) => {
								try {
									return JSON.parse(raw);
								} catch {
									return null;
								}
							})
							.find((item) => item && (item["@type"] === "JobPosting" || item.title || item.description));

						const title =
							text(jsonLd?.title) ||
							text(document.querySelector("header h1")?.textContent) ||
							text(document.querySelector("h1")?.textContent) ||
							document.title;

						const company =
							text(jsonLd?.hiringOrganization?.name || jsonLd?.hiringOrganization) ||
							text(document.querySelector("article.trabajo a[href*='empresa-empleo']")?.textContent) ||
							pickValueAfterHeading("empresa");

						const department =
							text(jsonLd?.jobLocation?.address?.addressLocality) ||
							pickValueAfterHeading("departamento");

						const locality =
							text(jsonLd?.jobLocation?.address?.addressRegion) ||
							pickValueAfterHeading("localidad");

						const salary =
							text(jsonLd?.baseSalary?.value?.value) ||
							pickValueAfterHeading("salario");

						const description =
							text(jsonLd?.description) ||
							pickValueAfterHeading("descripción de la plaza") ||
							pickValueAfterHeading("descripcion de la plaza") ||
							text(document.querySelector("article.trabajo")?.innerText)?.slice(0, 5000);

						return {
							title,
							company,
							location: [locality, department].filter(Boolean).join(", ") || null,
							description,
							salary,
						};
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
			console.error(`❌ Error al extraer detalle de Un Mejor Empleo: ${error.message}`);
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
	desarrollador: ["developer", "programador", "full stack", "backend", "frontend"],
	software: ["developer", "desarrollo", "aplicaciones", "sistemas", "full stack"],
	analista: ["analyst"],
	datos: ["data"],
	ingeniero: ["engineer"],
	sistemas: ["software", "ti", "informacion", "tecnologia", "soporte"],
	psicologia: ["psicologo", "psicologia organizacional", "seleccion"],
	derecho: ["juridico", "abogado", "legal"],
	administracion: ["administrativo", "administrativa", "gestion"],
	empresas: ["empresarial", "administrativo"],
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

const stripLeadingSlash = (value) => String(value || "").replace(/^\/+/, "");

const looksNoise = (title, description) =>
	/ver mas ofertas|publicar empleo|buscar empleo|registro de candidatos/i.test(`${title} ${description}`);

const stripUiNoise = (value) =>
	String(value || "")
		.replace(/\(adsbygoogle\s*=\s*window\.adsbygoogle\s*\|\|\s*\[\]\)\.push\(\{\}\);?/gi, " ")
		.replace(/\s+/g, " ")
		.trim();

const cleanTitle = (value) => stripUiNoise(value) || null;

const cleanCompany = (value) =>
	stripUiNoise(value)
		.replace(/\s*ver todas las vacantes$/i, "")
		.trim() || null;

const cleanLocation = (value) => {
	const normalized = stripUiNoise(value);
	if (!normalized) return null;
	const parts = normalized.split(",").map((item) => item.trim()).filter(Boolean);
	return Array.from(new Set(parts)).join(", ") || null;
};

const cleanDescription = (value) =>
	stripUiNoise(value)
		.trim() || null;

const cleanSalary = (value) => {
	const normalized = stripUiNoise(value);
	if (!normalized || /^-+$/.test(normalized)) return null;
	return normalized;
};
