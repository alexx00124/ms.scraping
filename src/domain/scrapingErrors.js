export const scrapingErrors = {
	INVALID_PAYLOAD: {
		code: "INVALID_PAYLOAD",
		message: "El payload es invalido.",
		httpStatus: 400,
	},
	SOURCE_NOT_AVAILABLE: {
		code: "SOURCE_NOT_AVAILABLE",
		message: "Una o mas fuentes solicitadas no estan disponibles.",
		httpStatus: 400,
	},
	SOURCE_NOT_FOUND: {
		code: "SOURCE_NOT_FOUND",
		message: "Fuente de scraping no encontrada.",
		httpStatus: 404,
	},
	SCRAPING_FAILED: {
		code: "SCRAPING_FAILED",
		message: "No se pudo completar el proceso de scraping.",
		httpStatus: 500,
	},
	SESSION_REQUIRED: {
		code: "SESSION_REQUIRED",
		message: "Se requiere autenticacion.",
		httpStatus: 401,
	},
	SESSION_INVALID: {
		code: "SESSION_INVALID",
		message: "Sesion invalida.",
		httpStatus: 401,
	},
};

export const buildError = (errorKey, details = null) => {
	const base = scrapingErrors[errorKey] || scrapingErrors.INVALID_PAYLOAD;
	return {
		code: base.code,
		message: base.message,
		httpStatus: base.httpStatus,
		details,
	};
};
