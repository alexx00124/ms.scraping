import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

export class AcciontrabajoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("acciontrabajo"),
		});
		this.baseUrl = "https://col.acciontrabajo.com";
	}

	async extractJobLinks(profession, limit = 10) {
		try {
			const slug = slugify(profession);
			const urls = [
				`${this.baseUrl}/empleos-de-${slug}-en-colombia`,
				`${this.baseUrl}/ofertas-de-trabajo-en-colombia`,
			];
			const found = await this.collectLinksFromUrls(
				urls,
				(href) => looksLikeJobLink(toRelativeOrAbsolute(href, this.baseUrl)),
				limit,
			);
			const links = found.map((href) => normalizeUrl(toAbsoluteUrl(href, this.baseUrl)));

			console.log(`📊 AccionTrabajo - Enlaces encontrados: ${links.length}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al extraer links de AccionTrabajo:", error.message);
			return [];
		}
	}

	async extractJobDetails(url) {
		try {
			return await this.withSourcePage(url, {
				kind: "detail",
				timeoutMs: this.getPolicy().getTimeout("detail"),
			}, async (page) => {
				await page.waitForLoadState("domcontentloaded").catch(() => {});
				await page.waitForTimeout(400).catch(() => {});

				const data = await page.evaluate(() => {
					const selectorsToText = (selectors) => {
						for (const selector of selectors) {
							const element = document.querySelector(selector);
							const text = element?.textContent?.replace(/\s+/g, " ").trim();
							if (text) return text;
						}
						return null;
					};

					const selectorsToAttr = (selectors, attr) => {
						for (const selector of selectors) {
							const value = document.querySelector(selector)?.getAttribute(attr)?.trim();
							if (value) return value;
						}
						return null;
					};

					return {
						title:
							selectorsToText(["h1"]) ||
							selectorsToAttr(["meta[property='og:title']"], "content") ||
							document.title ||
							"Sin titulo",
						company:
							selectorsToText([
								"[itemprop='hiringOrganization']",
								".company",
								".empresa",
								"[class*='company']",
								"[class*='empresa']",
							]) || "Empresa no especificada",
						location: selectorsToText([
							"[itemprop='jobLocation']",
							".location",
							".ubicacion",
							"[class*='location']",
							"[class*='ubicacion']",
						]),
						description:
							selectorsToAttr(["meta[name='description']"], "content") ||
							selectorsToText([
								"[itemprop='description']",
								".description",
								".job-description",
								"[class*='description']",
							]) ||
							"Sin descripcion",
						salary: selectorsToText([
							"[itemprop='baseSalary']",
							".salary",
							"[class*='salary']",
						]),
						pageTitle: document.title || "",
					};
				});

				return {
					title: sanitizeTitle(normalizeText(data.title)),
					company: normalizeText(data.company) || "Empresa no especificada",
					location: normalizeText(data.location) || extractLocationFromTitle(data.pageTitle) || null,
					description: normalizeText(data.description || "Sin descripcion").substring(0, 5000),
					salary: normalizeText(data.salary) || null,
					url: normalizeUrl(url),
				};
			});
		} catch (error) {
			console.error("❌ Error al extraer detalle de AccionTrabajo:", error.message);
			return null;
		}
	}

	getSourceName() {
		return "acciontrabajo";
	}
}

const toRelativeOrAbsolute = (href, baseUrl) => {
	if (!href) return href;
	if (href.startsWith("http")) {
		return href.replace(baseUrl, "");
	}
	return href;
};

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
