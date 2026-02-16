const MODALIDADES = new Set(["PRESENCIAL", "REMOTO", "HIBRIDO"]);

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
