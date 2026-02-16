export const scrapingErrors = {
	INVALID_PAYLOAD: {
		code: "INVALID_PAYLOAD",
		message: "El payload es invalido.",
		httpStatus: 400,
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
