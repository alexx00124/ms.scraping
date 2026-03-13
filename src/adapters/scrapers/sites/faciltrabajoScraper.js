import { BaseBrowserScraper } from "../baseBrowserScraper.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

export class FaciltrabajoScraper extends BaseBrowserScraper {
	constructor(deps) {
		super({
			...deps,
			policy: deps?.policy || getSourcePolicy("faciltrabajo"),
		});
		this.baseUrl = "https://www.faciltrabajo.com.co";
	}

	async extractJobLinks(profession, limit = 10) {
		try {
			const slug = slugify(profession);
			const candidates = [
				`${this.baseUrl}/busqueda-empleo-${slug}.html`,
				`${this.baseUrl}/trabajo-${slug}-1.html`,
				`${this.baseUrl}`,
			];

			const found = await this.collectLinksFromUrls(
				candidates,
				(href) => {
					const absolute = toAbsoluteUrl(href, this.baseUrl);
					return absolute.includes("/empleo-") && absolute.endsWith(".html");
				},
				limit,
			);
			const links = found.map((href) => normalizeUrl(toAbsoluteUrl(href, this.baseUrl)));

			console.log(`📊 FacilTrabajo - Enlaces encontrados: ${links.length}`);
			return Array.from(links).slice(0, limit);
		} catch (error) {
			console.error("❌ Error al extraer links de FacilTrabajo:", error.message);
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
						title: selectorsToText(["h1"]) || document.title || "Sin titulo",
						company:
							selectorsToText([
								"a[href*='empresa']",
								".empresa",
								".company",
							]) || "Empresa no especificada",
						location: selectorsToText([
							".ubicacion",
							".location",
							".ciudad",
						]),
						description:
							selectorsToAttr(["meta[name='description']"], "content") ||
							selectorsToText([
								".job-description",
								".descripcion",
								"#descripcion",
								".detalle-oferta",
								".panel-body",
							]) ||
							"Sin descripcion",
						salary: selectorsToText([
							".salary",
							".salario",
						]),
						pageTitle: document.title || "",
					};
				});

				const pageTitle = normalizeText(data.pageTitle);
				return {
					title: normalizeText(data.title) || extractFromTitle(pageTitle) || "Sin titulo",
					company:
						extractCompanyFromTitle(pageTitle) ||
						normalizeText(data.company) ||
						"Empresa no especificada",
					location:
						extractLocationFromTitle(pageTitle) ||
						normalizeText(data.location) ||
						null,
					description: normalizeText(data.description || "Sin descripcion").substring(0, 5000),
					salary: normalizeText(data.salary) || null,
					url: normalizeUrl(url),
				};
			});
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
