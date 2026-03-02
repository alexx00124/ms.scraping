const MODALIDADES = new Set(["PRESENCIAL", "REMOTO", "HIBRIDO"]);

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export const validateJobPayload = (payload) => {
	const details = {};

	if (!payload?.titulo) {
		details.titulo = "El titulo es requerido.";
	}
	if (!payload?.descripcion) {
		details.descripcion = "La descripcion es requerida.";
	}
	if (!payload?.empresa) {
		details.empresa = "La empresa es requerida.";
	}
	if (payload?.modalidad && !MODALIDADES.has(payload.modalidad)) {
		details.modalidad = "Modalidad invalida.";
	}
	if (payload?.salarioMin && Number.isNaN(Number(payload.salarioMin))) {
		details.salarioMin = "salarioMin debe ser numerico.";
	}
	if (payload?.salarioMax && Number.isNaN(Number(payload.salarioMax))) {
		details.salarioMax = "salarioMax debe ser numerico.";
	}

	return Object.keys(details).length ? details : null;
};

export const validateJobsPayload = (payload) => {
	if (!payload?.jobs || !Array.isArray(payload.jobs) || payload.jobs.length === 0) {
		return { jobs: "jobs debe ser un arreglo con al menos un item." };
	}
	return null;
};

export const validateStartScrapingPayload = (payload) => {
	const details = {};

	// Acepta profession (string) y/o keywords (array de strings)
	const hasProfession = hasText(payload?.profession);
	const hasKeywords =
		Array.isArray(payload?.keywords) &&
		payload.keywords.length > 0 &&
		payload.keywords.every((k) => hasText(k));

	if (!hasProfession && !hasKeywords) {
		details.profession = "profession (string) o keywords (array de strings) es requerido.";
	}

	if (payload?.keywords !== undefined && !hasKeywords) {
		details.keywords = "keywords debe ser un arreglo de strings no vacios.";
	}

	if (payload?.sources !== undefined) {
		if (!Array.isArray(payload.sources) || payload.sources.length === 0) {
			details.sources = "sources debe ser un arreglo con al menos una fuente.";
		} else if (payload.sources.some((source) => !hasText(source))) {
			details.sources = "Cada source debe ser texto no vacio.";
		}
	}

	if (payload?.linksPerSource !== undefined) {
		const linksPerSource = Number(payload.linksPerSource);
		if (
			Number.isNaN(linksPerSource) ||
			!Number.isInteger(linksPerSource) ||
			linksPerSource < 1 ||
			linksPerSource > 100
		) {
			details.linksPerSource = "linksPerSource debe ser un entero entre 1 y 100.";
		}
	}

	return Object.keys(details).length ? details : null;
};
