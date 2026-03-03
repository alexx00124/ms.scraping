import { buildError } from "../../domain/scrapingErrors.js";
import {
	validateJobPayload,
	validateJobsPayload,
	validateStartScrapingPayload,
} from "../../domain/scrapingValidation.js";

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

	const start = async (req, res) => {
		const validation = validateStartScrapingPayload(req.body);
		if (validation) {
			const error = buildError("INVALID_PAYLOAD", validation);
			return res.status(error.httpStatus).json({ error });
		}

		const normalizedSources = req.body.sources?.map((item) => item.toLowerCase()) || null;
		const available = scrapingService.getAvailableSources();
		if (normalizedSources?.some((source) => !available.includes(source))) {
			const error = buildError("SOURCE_NOT_AVAILABLE", {
				sourcesDisponibles: available,
			});
			return res.status(error.httpStatus).json({ error });
		}

		// Construir lista de términos de búsqueda: keywords[] tiene prioridad, fallback a profession
		const profession = req.body.profession?.trim() || null;
		const keywords = Array.isArray(req.body.keywords)
			? req.body.keywords.map((k) => k.trim()).filter(Boolean)
			: [];

		try {
			const result = await scrapingService.startScraping({
				profession,
				keywords,
				sources: normalizedSources,
				linksPerSource: req.body.linksPerSource,
			});

			const label = profession || keywords.slice(0, 3).join(", ");
			return res.status(200).json({
				success: true,
				message: `Scraping completado para "${label}".`,
				data: result,
			});
		} catch (runError) {
			const error = buildError("SCRAPING_FAILED", {
				message: runError.message,
			});
			return res.status(error.httpStatus).json({ error });
		}
	};

	const getSources = async (_req, res) => {
		const sources = scrapingService.getAvailableSources();
		return res.status(200).json({
			success: true,
			data: {
				sources,
				total: sources.length,
			},
		});
	};

	const getStatus = async (_req, res) => {
		return res.status(200).json({
			success: true,
			data: scrapingService.getStatus(),
		});
	};

	return { ingestOne, ingestMany, start, getSources, getStatus };
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
