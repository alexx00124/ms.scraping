import { ScraperProvider } from "../../../ports/scraperProvider.js";
import { getSourcePolicy } from "../../../domain/scraping/sourcePolicies.js";
import { normalizeUrl } from "../../../domain/urlNormalization.js";

const SPE_RESULTS_URL = "https://www.buscadordeempleo.gov.co/backbue/v1//vacantes/resultados";

export class SpeScraper extends ScraperProvider {
	constructor() {
		super();
		this.policy = getSourcePolicy("spe");
		this.cache = new Map();
	}

	getSourceName() {
		return "spe";
	}

	getPolicy() {
		return this.policy;
	}

	async extractJobLinks(profession, limit = 10) {
		const links = [];
		const pages = Math.max(1, Math.min(3, Math.ceil(limit / 25)));
		const seen = new Set();

		for (let page = 1; page <= pages && links.length < limit; page += 1) {
			const rows = await this.fetchResults({ profession, page });
			for (const row of rows) {
				if (!isRelevantToProfession(row, profession)) continue;

				const details = mapSpeResult(row);
				if (!details.url) continue;
				if (seen.has(details.url)) continue;

				seen.add(details.url);
				this.cache.set(details.url, details);
				links.push(details.url);
				if (links.length >= limit) break;
			}
		}

		console.log(`📊 SPE - Enlaces encontrados: ${links.length}`);
		return links;
	}

	async extractJobDetails(url) {
		return this.cache.get(normalizeUrl(url) || url) || null;
	}

	async fetchResults({ profession, page }) {
		const query = new URLSearchParams({ page: String(page) });
		if (profession) {
			query.set("BUSQUEDA", profession);
		}

		const response = await fetch(`${SPE_RESULTS_URL}?${query.toString()}`, {
			headers: {
				Accept: "application/json",
				"User-Agent": "Mozilla/5.0",
			},
		});

		if (response.status === 403 || response.status === 429) {
			this.block(`SPE rejected requests (${response.status})`, this.policy.cooldownMs);
			throw new Error(`SPE rechazo la solicitud (${response.status})`);
		}

		if (!response.ok) {
			throw new Error(`SPE error ${response.status}`);
		}

		const payload = await response.json();
		return Array.isArray(payload?.resultados) ? payload.resultados : [];
	}
}

const mapSpeResult = (row) => {
	const detailUrl =
		normalizeUrl(row?.DETALLES_PRESTADOR?.[0]?.URL_DETALLE_VACANTE) ||
		`https://www.buscadordeempleo.gov.co/#/vacante/${encodeURIComponent(row?.CODIGO_VACANTE || "sin-codigo")}`;

	const providerName = cleanText(row?.DETALLES_PRESTADOR?.[0]?.NOMBRE_PRESTADOR);
	const location = [cleanText(row?.MUNICIPIO), cleanText(row?.DEPARTAMENTO)]
		.filter(Boolean)
		.join(", ");

	return {
		title: cleanText(row?.TITULO_VACANTE || row?.CARGO || "Sin titulo"),
		company: providerName || "Empresa no especificada",
		location: location || null,
		description: cleanText(row?.DESCRIPCION_VACANTE || row?.BUSQUEDA || "Sin descripcion") || "Sin descripcion",
		salary: cleanText(row?.RANGO_SALARIAL) || null,
		url: detailUrl,
	};
};

const cleanText = (value) =>
	String(value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim() || null;

const STOPWORDS = new Set([
	"de",
	"del",
	"la",
	"las",
	"el",
	"los",
	"en",
	"y",
	"o",
	"para",
	"con",
	"sin",
	"por",
	"un",
	"una",
	"al",
	"se",
]);

const isRelevantToProfession = (row, profession) => {
	const tokens = tokenize(profession);
	if (tokens.length === 0) return true;

	const title = normalizeText(`${row?.TITULO_VACANTE || ""} ${row?.CARGO || ""}`);
	const description = normalizeText(`${row?.DESCRIPCION_VACANTE || ""} ${row?.BUSQUEDA || ""}`);
	const titleHits = tokens.filter((token) => title.includes(token));
	const descriptionHits = tokens.filter((token) => description.includes(token));
	const exactPhraseInTitle = title.includes(normalizeText(profession));
	const exactPhraseInDescription = description.includes(normalizeText(profession));

	if (exactPhraseInTitle) return true;
	if (tokens.length === 1) {
		return titleHits.length >= 1 || descriptionHits.length >= 1;
	}

	if (titleHits.length >= Math.ceil(tokens.length / 2)) return true;
	if (titleHits.length >= 1 && descriptionHits.length >= Math.ceil(tokens.length / 2)) return true;
	if (exactPhraseInDescription && titleHits.length >= 1) return true;

	return false;
};

const tokenize = (value) =>
	normalizeText(value)
		.split(" ")
		.filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const normalizeText = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
