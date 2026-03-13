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
				{ preserveHash: true },
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
				await page.waitForTimeout(250).catch(() => {});

				const data = await page.evaluate((targetUrl) => {
					const current = new URL(targetUrl);
					const fragmentId = current.hash.replace(/^#/, "").trim();
					const text = (value) => String(value || "").replace(/\s+/g, " ").trim() || null;

					const resolveCard = () => {
						if (!fragmentId) return null;
						const directCard = document.getElementById(`${fragmentId}-url`);
						if (directCard) return directCard;
						const shareNode = document.getElementById(fragmentId);
						if (shareNode?.closest(".listing_url")) {
							return shareNode.closest(".listing_url");
						}
						const titleNode = document.getElementById(`${fragmentId}-title`);
						if (titleNode?.closest(".listing_url")) {
							return titleNode.closest(".listing_url");
						}
						return null;
					};

					const card = resolveCard();
					if (card) {
						const descriptionNode = fragmentId
							? document.getElementById(`${fragmentId}-id`) || card.querySelector("span[id$='-id']")
							: card.querySelector("span[id$='-id']");
						const titleNode = fragmentId
							? document.getElementById(`${fragmentId}-title`) || card.querySelector("h2")
							: card.querySelector("h2");
						const locationNode = fragmentId
							? document.getElementById(`${fragmentId}-city`) || card.querySelector("div[id$='-city']")
							: card.querySelector("div[id$='-city']");

						const companyCandidate =
							text(card.querySelector("b")?.textContent) ||
							text(card.querySelector("strong")?.textContent) ||
							text(card.querySelector("[itemprop='hiringOrganization']")?.textContent);

						return {
							title: text(titleNode?.textContent) || document.title || "Sin titulo",
							company: companyCandidate || "Empresa no especificada",
							location: text(locationNode?.textContent),
							description: text(descriptionNode?.textContent) || text(card.textContent) || "Sin descripcion",
							salary:
								text(card.querySelector("[itemprop='baseSalary']")?.textContent) ||
								text(card.querySelector(".salary")?.textContent) ||
								text(card.textContent)?.match(/\$\s?[\d.,]+(?:\s*a\s*\$\s?[\d.,]+)?/i)?.[0] ||
								null,
							pageTitle: document.title || "",
						};
					}

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
				}, url);

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
		return /#ec[a-z0-9]+$/i.test(href);
	}
	if (/^\/trabajo-[^/]+\/.+#ec[a-z0-9]+$/i.test(href)) {
		return true;
	}
	return /^\/empleo-de-[^#]+/i.test(href);
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
