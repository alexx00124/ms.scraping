export const normalizeUrl = (value) => {
	if (!value || typeof value !== "string") {
		return null;
	}

	try {
		const parsed = new URL(value);
		parsed.hash = "";
		for (const param of [
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"utm_term",
			"utm_content",
			"trk",
		]) {
			parsed.searchParams.delete(param);
		}
		return parsed.toString();
	} catch {
		return value.trim();
	}
};
