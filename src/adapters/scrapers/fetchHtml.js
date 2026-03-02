const DEFAULT_TIMEOUT_MS = 20000;

const DEFAULT_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
	"Cache-Control": "no-cache",
	Pragma: "no-cache",
};

export const fetchHtml = async (url, options = {}) => {
	const controller = new AbortController();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				...DEFAULT_HEADERS,
				...(options.headers || {}),
			},
			signal: controller.signal,
			redirect: "follow",
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return response.text();
	} finally {
		clearTimeout(timeoutId);
	}
};

export const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
