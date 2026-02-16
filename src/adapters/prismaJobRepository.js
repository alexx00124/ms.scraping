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
}
