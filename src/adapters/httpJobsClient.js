/**
 * HTTP client para comunicación con ms-jobs.
 * Reemplaza el acceso directo a las tablas Trabajo y ProgramaAcademico.
 * ms-scraping ingiere ofertas a través de la API interna de ms-jobs.
 */

const DEFAULT_TIMEOUT_MS = 30000;

export class HttpJobsClient {
	constructor() {
		this.baseUrl = process.env.MS_JOBS_URL || "http://localhost:6003";
		this.gatewaySecret = process.env.GATEWAY_AUTH_SECRET || "";
		this.timeoutMs = DEFAULT_TIMEOUT_MS;
	}

	// ─── Job ingestion (reemplaza PrismaJobRepository) ───────────────

	async create(data) {
		const url = `${this.baseUrl}/jobs/internal-api/ingest`;
		const response = await this._fetch(url, {
			method: "POST",
			body: JSON.stringify(data),
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(`ms-jobs ingest failed (${response.status}): ${body?.error?.message || "unknown"}`);
		}
		const result = await response.json();
		return result.job;
	}

	async createMany(items) {
		const url = `${this.baseUrl}/jobs/internal-api/ingest-batch`;
		const response = await this._fetch(url, {
			method: "POST",
			body: JSON.stringify({ jobs: items }),
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(`ms-jobs batch ingest failed (${response.status}): ${body?.error?.message || "unknown"}`);
		}
		const result = await response.json();
		return result.result;
	}

	async findBySourceAndUrls(source, urls) {
		// NOTE: For deduplication, ms-scraping can query ms-jobs via a dedicated endpoint.
		// For now, returning null means all jobs will be ingested (ms-jobs handles duplicates via skipDuplicates).
		// TODO: Add a deduplication endpoint in ms-jobs if needed.
		return null;
	}

	// ─── Academic programs (reemplaza PrismaAcademicProgramRepository) ─

	async listAllPrograms() {
		const url = `${this.baseUrl}/jobs/academic-programs`;
		try {
			const response = await this._fetch(url);
			if (!response.ok) return [];
			const data = await response.json();
			return data.data || data.items || data || [];
		} catch (err) {
			console.error(`[HttpJobsClient] Error listing programs:`, err.message);
			return [];
		}
	}

	async listActivePrograms() {
		return this.listAllPrograms();
	}

	async findProgramById(id) {
		const url = `${this.baseUrl}/jobs/academic-programs/${id}`;
		try {
			const response = await this._fetch(url);
			if (!response.ok) return null;
			const data = await response.json();
			return data.data || data || null;
		} catch (err) {
			console.error(`[HttpJobsClient] Error fetching program ${id}:`, err.message);
			return null;
		}
	}

	async findProgramByName(name) {
		// Query via the list endpoint and filter locally
		const programs = await this.listAllPrograms();
		return programs.find((p) => p.nombre === name) || null;
	}

	async _fetch(url, options = {}) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			return await fetch(url, {
				method: options.method || "GET",
				headers: {
					"Content-Type": "application/json",
					...(this.gatewaySecret ? { "x-gateway-auth": this.gatewaySecret } : {}),
				},
				body: options.body || undefined,
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
