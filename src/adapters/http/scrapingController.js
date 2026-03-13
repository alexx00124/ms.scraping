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
		const profession = req.body.profession?.trim() || null;
		const keywords = Array.isArray(req.body.keywords)
			? req.body.keywords.map((k) => k.trim()).filter(Boolean)
			: [];
		const allPrograms = req.body.allPrograms === true;

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

		if (allPrograms) {
			await scrapingService.ensureProgramsLoaded();
			if (scrapingService.getProgramsCount() === 0) {
				return res.status(409).json({
					error: {
						code: "PROGRAMS_NOT_AVAILABLE",
						message: "No hay programas academicos disponibles desde ms-jobs. Desmarca 'Todas las carreras' o levanta ms-jobs.",
						httpStatus: 409,
					},
				});
			}
		}

		const label = allPrograms
			? "todas las carreras UDC"
			: profession || keywords.slice(0, 3).join(", ");

		// Responder inmediatamente: el scraping puede tardar minutos (429, rate-limit).
		// El cliente no debe esperar — recibe 202 y el proceso corre en background.
		res.status(202).json({
			success: true,
			message: `Scraping iniciado para "${label}". Las ofertas se actualizarán en unos momentos.`,
			data: null,
		});

		// Ejecutar en background sin bloquear la respuesta
		scrapingService
			.startScraping({
				profession,
				keywords,
				allPrograms,
				sources: normalizedSources,
				linksPerSource: req.body.linksPerSource,
			})
			.then((result) => {
				const total = result?.inserted ?? result?.count ?? "?";
				console.log(`[SCRAPING] ✅ Background completado para "${label}" — ${total} ofertas insertadas.`);
			})
			.catch((runError) => {
				console.error(`[SCRAPING] ❌ Background fallido para "${label}":`, runError.message);
			});
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

	const getPrograms = async (_req, res) => {
		await scrapingService.ensureProgramsLoaded();
		const programs = scrapingService.getPrograms();
		return res.status(200).json({
			success: true,
			data: {
				items: programs,
				total: programs.length,
			},
		});
	};

	return { ingestOne, ingestMany, start, getSources, getStatus, getPrograms };
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
