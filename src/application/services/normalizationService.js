import { normalizeUrl } from "../../domain/urlNormalization.js";
import { matchJobToProgram } from "../../domain/programMatcher.js";

export class NormalizationService {
	constructor(programs = []) {
		this.programs = programs;
	}

	setPrograms(programs = []) {
		this.programs = Array.isArray(programs) ? programs : [];
	}

	toTrabajoPayload(details, sourceName) {
		const now = new Date();
		const salary = parseSalaryRange(details.salary);
		const rawUrl = details.url || details.link || details.urlOriginal;
		const urlOriginal = normalizeUrl(rawUrl);
		const titulo = (details.title || details.titulo || "Sin titulo").trim();
		const descripcion = (details.description || details.descripcion || "Sin descripcion").trim();
		const programaRelacionado = matchJobToProgram(titulo, descripcion, this.programs);

		return {
			titulo,
			descripcion,
			empresa: (details.company || details.empresa || "Empresa no especificada").trim(),
			ubicacion: details.location || details.ubicacion || null,
			modalidad: inferModalidad(`${details.location || ""} ${details.description || ""}`),
			salarioMin: salary.salarioMin,
			salarioMax: salary.salarioMax,
			requisitos: null,
			habilidadesClave: null,
			fuente: sourceName,
			urlOriginal,
			scrapingId: null,
			programaRelacionado,
			activo: true,
			fechaCreacion: now,
			actualizadoEn: now,
		};
	}
}

const parseSalaryRange = (salaryText) => {
	if (!salaryText || typeof salaryText !== "string") {
		return { salarioMin: null, salarioMax: null };
	}

	const matches = salaryText.match(/[\d.,]+/g) || [];
	const values = matches
		.map((item) => item.replace(/\./g, "").replace(/,/g, "."))
		.map((item) => Number(item))
		.filter((item) => Number.isFinite(item));

	if (values.length === 0) {
		return { salarioMin: null, salarioMax: null };
	}

	if (values.length === 1) {
		return { salarioMin: values[0], salarioMax: null };
	}

	return {
		salarioMin: Math.min(...values),
		salarioMax: Math.max(...values),
	};
};

const inferModalidad = (text) => {
	if (!text || typeof text !== "string") {
		return null;
	}

	const normalized = String(text || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim();

	if (
		normalized.includes("hibrid") ||
		normalized.includes("hybrid") ||
		normalized.includes("mixto") ||
		normalized.includes("semi presencial")
	) {
		return "HIBRIDO";
	}
	if (
		normalized.includes("remoto") ||
		normalized.includes("remote") ||
		normalized.includes("teletrabajo") ||
		normalized.includes("home office") ||
		normalized.includes("work from home") ||
		normalized.includes("wfh") ||
		normalized.includes("virtual")
	) {
		return "REMOTO";
	}
	if (
		normalized.includes("presencial") ||
		normalized.includes("onsite") ||
		normalized.includes("on site") ||
		normalized.includes("en oficina")
	) {
		return "PRESENCIAL";
	}

	return null;
};
