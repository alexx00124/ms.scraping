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
	SCRAPING_FAILED: {
		code: "SCRAPING_FAILED",
		message: "No se pudo completar el proceso de scraping.",
		httpStatus: 500,
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
