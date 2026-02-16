import { buildError } from "../../domain/scrapingErrors.js";
import { validateJobPayload, validateJobsPayload } from "../../domain/scrapingValidation.js";

export const buildScrapingController = (scrapingService) => {
	const ingestOne = async (req, res) => {
		const validation = validateJobPayload(req.body);
		if (validation) {
			const error = buildError("INVALID_PAYLOAD", validation);
			return res.status(error.httpStatus).json({ error });
		}
		const payload = mapPayload(req.body, true);
		const job = await scrapingService.ingestOne(payload);
		return res.status(201).json({ job });
	};

	const ingestMany = async (req, res) => {
		const validation = validateJobsPayload(req.body);
		if (validation) {
			const error = buildError("INVALID_PAYLOAD", validation);
			return res.status(error.httpStatus).json({ error });
		}
		const mapped = [];
		const itemErrors = [];
		for (const [index, item] of req.body.jobs.entries()) {
			const itemValidation = validateJobPayload(item);
			if (itemValidation) {
				itemErrors.push({ index, details: itemValidation });
				continue;
			}
			mapped.push(mapPayload(item, true));
		}
		if (itemErrors.length) {
			const error = buildError("INVALID_PAYLOAD", { items: itemErrors });
			return res.status(error.httpStatus).json({ error });
		}

		const result = await scrapingService.ingestMany(mapped);
		return res.status(201).json({ inserted: result.count });
	};

	return { ingestOne, ingestMany };
};

const mapPayload = (payload, isCreate) => ({
	titulo: payload.titulo,
	descripcion: payload.descripcion,
	empresa: payload.empresa,
	ubicacion: payload.ubicacion ?? null,
	modalidad: payload.modalidad ?? null,
	salarioMin:
		payload.salarioMin !== undefined ? Number(payload.salarioMin) : null,
	salarioMax:
		payload.salarioMax !== undefined ? Number(payload.salarioMax) : null,
	requisitos: payload.requisitos ?? null,
	habilidadesClave: payload.habilidadesClave ?? null,
	fuente: payload.fuente ?? null,
	urlOriginal: payload.urlOriginal ?? null,
	scrapingId: payload.scrapingId ?? null,
	activo: payload.activo ?? true,
	fechaCreacion: isCreate ? new Date() : undefined,
	actualizadoEn: new Date(),
});
