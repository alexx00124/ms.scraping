import { buildError } from "../../domain/scrapingErrors.js";

const getHeaderValue = (value) =>
	Array.isArray(value) ? value[0] : value;

const hasValidGatewaySecret = (req) => {
	const requiredSecret = process.env.GATEWAY_AUTH_SECRET;
	if (!requiredSecret) {
		return true;
	}
	const provided = getHeaderValue(req.headers["x-gateway-auth"]);
	return provided === requiredSecret;
};

const getUserIdFromHeaders = (req) => {
	const userId = getHeaderValue(req.headers["x-user-id"]);
	if (!userId) {
		return { error: buildError("SESSION_REQUIRED") };
	}
	if (!hasValidGatewaySecret(req)) {
		return { error: buildError("SESSION_INVALID") };
	}
	return { userId };
};

export const buildScrapingSourceController = (scrapingSourceRepository) => {
	const list = async (_req, res) => {
		const sources = await scrapingSourceRepository.listAll();
		return res.status(200).json({
			success: true,
			data: sources,
		});
	};

	const getById = async (req, res) => {
		const source = await scrapingSourceRepository.findById(req.params.id);
		if (!source) {
			const error = buildError("SOURCE_NOT_FOUND");
			return res.status(404).json({ error });
		}
		return res.status(200).json({
			success: true,
			data: source,
		});
	};

	const create = async (req, res) => {
		const auth = getUserIdFromHeaders(req);
		if (auth.error) {
			return res.status(auth.error.httpStatus).json({ error: auth.error });
		}

		const { nombre, baseUrl } = req.body;
		if (!nombre || !baseUrl) {
			const error = buildError("INVALID_PAYLOAD", {
				nombre: nombre ? undefined : "nombre es requerido.",
				baseUrl: baseUrl ? undefined : "baseUrl es requerido.",
			});
			return res.status(error.httpStatus).json({ error });
		}

		const source = await scrapingSourceRepository.create({
			nombre: nombre.trim(),
			urlBase: baseUrl.trim(),
		});

		return res.status(201).json({
			success: true,
			data: source,
		});
	};

	const update = async (req, res) => {
		const auth = getUserIdFromHeaders(req);
		if (auth.error) {
			return res.status(auth.error.httpStatus).json({ error: auth.error });
		}

		const existing = await scrapingSourceRepository.findById(req.params.id);
		if (!existing) {
			const error = buildError("SOURCE_NOT_FOUND");
			return res.status(404).json({ error });
		}

		const { isEnabled, habilitada } = req.body;
		const updateData = {};
		
		if (isEnabled !== undefined) {
			updateData.habilitada = isEnabled;
		}
		if (habilitada !== undefined) {
			updateData.habilitada = habilitada;
		}

		const source = await scrapingSourceRepository.updateById(
			req.params.id,
			updateData,
		);

		return res.status(200).json({
			success: true,
			data: source,
		});
	};

	const remove = async (req, res) => {
		const auth = getUserIdFromHeaders(req);
		if (auth.error) {
			return res.status(auth.error.httpStatus).json({ error: auth.error });
		}

		const existing = await scrapingSourceRepository.findById(req.params.id);
		if (!existing) {
			const error = buildError("SOURCE_NOT_FOUND");
			return res.status(404).json({ error });
		}

		await scrapingSourceRepository.deleteById(req.params.id);
		return res.status(200).json({
			success: true,
		});
	};

	return { list, getById, create, update, remove };
};
