export class PrismaJobRepository {
	constructor(prisma) {
		this.prisma = prisma;
	}

	async create(data) {
		return this.prisma.trabajo.create({
			data,
		});
	}

	async createMany(items) {
		const result = await this.prisma.trabajo.createMany({
			data: items,
		});
		return { count: result.count };
	}

	async findBySourceAndUrls(source, urls) {
		const normalized = Array.from(
			new Set(urls.filter((item) => typeof item === "string" && item.trim().length > 0)),
		);

		if (!source || normalized.length === 0) {
			return null;
		}

		return this.prisma.trabajo.findFirst({
			where: {
				fuente: source,
				urlOriginal: {
					in: normalized,
				},
			},
		});
	}
}
