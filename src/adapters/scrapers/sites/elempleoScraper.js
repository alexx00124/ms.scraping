import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const BASE_URL = "https://www.elempleo.com";
const LISTING_URL = `${BASE_URL}/co/ofertas-empleo/`;

export class ElempleoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("elempleo"),
		});
	}

	getSourceName() {
		return "elempleo";
	}

	async extractJobLinks(profession, limit = 10) {
		const groups = buildKeywordGroups(profession);
		const pages = Math.max(1, Math.min(5, Math.ceil(limit / 4) + 1));
		const links = new Set();
		const searchBaseUrl = buildSearchUrl(profession);

		for (let pageIndex = 1; pageIndex <= pages && links.size < limit; pageIndex += 1) {
			const url = pageIndex === 1 ? searchBaseUrl : `${searchBaseUrl}/${pageIndex}`;
			const results = await this.withSourcePage(
				url,
				{ kind: "discovery", timeoutMs: this.getPolicy().getTimeout("discovery") },
				async (page) => {
					await page.waitForTimeout(1500).catch(() => {});
					return page.evaluate(() =>
						Array.from(document.querySelectorAll("a[href]"))
							.map((anchor) => {
								const href = anchor.href || "";
								const title = anchor.textContent?.replace(/\s+/g, " ").trim() || "";
								const card = anchor.closest("article, li, .result-item, .job-item, .card, .box");
								const text = card?.textContent?.replace(/\s+/g, " ").trim() || title;
								return { href, title, text };
							})
							.filter((item) => item.href.includes("/co/ofertas-trabajo/") && item.title),
					);
				},
			);

			for (const result of results) {
				const haystack = normalizeSearchText(`${result.title} ${result.text}`);
				if (!matchesGroups(haystack, groups)) continue;
				if (looksNoise(result.title)) continue;
				links.add(normalizeUrl(result.href));
				if (links.size >= limit) break;
			}
		}

		console.log(`📊 Elempleo - Enlaces encontrados: ${links.size}`);
		return Array.from(links);
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(
				url,
				{ kind: "detail", timeoutMs: this.getPolicy().getTimeout("detail") },
				async (page) => {
					await page.waitForTimeout(1800).catch(() => {});

					const data = await page.evaluate(() => {
						const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;
						const title =
							text(document.querySelector(".js-offer-detail-container h1")?.textContent) ||
							text(document.querySelector(".ee-offer-detail-modal-title")?.textContent) ||
							text(document.querySelector("h1")?.textContent) ||
							document.title;
						const company =
							text(document.querySelector(".js-offer-detail-container h2.text-white")?.textContent)?.replace(/^Trabaja en\s+/i, "") ||
							text(document.querySelector(".ee-company-title")?.textContent) ||
							text(Array.from(document.querySelectorAll("h2,h3,span,div")).find((el) => /Trabaja en /i.test(el.textContent || ""))?.textContent)?.replace(/^Trabaja en\s+/i, "") ||
							null;
						const location =
							text(document.querySelector(".js-joboffer-city")?.textContent) ||
							extraerDato("Ubicación") ||
							null;
						const salary =
							extraerDato("Salario") ||
							text(document.body?.innerText?.match(/\$\s?[\d.,]+\s*a\s*\$\s?[\d.,]+\s*(?:millones|COP)?|\$\s?[\d.,]+\s*(?:millones|COP)?/i)?.[0]) ||
							null;

						const descriptionHeading = Array.from(document.querySelectorAll("h1,h2,h3")).find((el) =>
							/Descripci[oó]n del cargo/i.test(el.textContent || ""),
						);
						let description = null;
						if (descriptionHeading) {
							const bucket = [];
							let current = descriptionHeading.nextElementSibling;
							while (current && bucket.length < 25) {
								const segment = text(current.textContent);
								if (segment && !/Cargos relacionados|Compartir oferta|B[uú]squedas r[aá]pidas/i.test(segment)) {
									bucket.push(segment);
								}
								if (/Cargos relacionados|Compartir oferta/i.test(segment || "")) break;
								current = current.nextElementSibling;
							}
							description = text(bucket.join(" "));
						}

					return {
						title: text(title),
						company: text(company),
						location: text(location),
						description: description || text(document.body?.innerText)?.slice(0, 5000),
						salary: text(salary),
					};

						function extraerDato(label) {
							const labels = Array.from(document.querySelectorAll(".info-label"));
							const found = labels.find((el) => (el.textContent || "").trim() === label);
							return text(found?.parentElement?.textContent?.replace(label, ""));
						}
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
			console.error("❌ Error al extraer detalle de Elempleo:", error.message);
			return null;
		}
	}
}

const STOPWORDS = new Set([
	"de","del","la","las","el","los","en","y","o","para","con","sin","por","un","una","al","se",
]);

const tokenize = (value) =>
	normalizeSearchText(value)
		.split(" ")
		.filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const normalizeSearchText = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

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
	const slug = slugifyForElempleo(profession);
	return slug ? `${LISTING_URL}trabajo-${slug}` : LISTING_URL;
};

const slugifyForElempleo = (value) =>
	normalizeSearchText(value)
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const TOKEN_ALIASES = {
	desarrollador: ["developer", "programador", "full stack", "backend", "frontend"],
	software: ["developer", "desarrollo", "aplicaciones", "sistemas", "full stack"],
	analista: ["analyst"],
	datos: ["data"],
	ingeniero: ["engineer"],
	sistemas: ["software", "ti", "informacion", "tecnologia", "soporte"],
};

const looksNoise = (title) => /ver oferta|postularme|compartir/i.test(String(title || ""));

const cleanTitle = (value) =>
	String(value || "")
		.replace(/^trabaja en\s+/i, "")
		.replace(/\s+/g, " ")
		.trim() || null;

const cleanCompany = (value) =>
	String(value || "")
		.replace(/^trabaja en\s+/i, "")
		.replace(/\s+/g, " ")
		.trim() || null;

const cleanLocation = (value) => {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.replace(/\s*-\s*h[ií]brido$/i, "")
		.trim();
	return normalized || null;
};

const cleanSalary = (value) => {
	const normalized = String(value || "").replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	if (/^confidencial(?:\s+salario)?$/i.test(normalized)) {
		return null;
	}
	return normalized.replace(/\s+salario$/i, "").trim() || null;
};

const cleanDescription = (value) => {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.replace(/Postularme a oferta.*?Correo\s*/i, "")
		.replace(/Cargos relacionados.*$/i, "")
		.trim();
	return normalized || null;
};
