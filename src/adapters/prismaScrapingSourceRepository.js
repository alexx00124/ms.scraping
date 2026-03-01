export class PrismaScrapingSourceRepository {
	constructor(prisma) {
		this.prisma = prisma;
	}

	async listAll() {
		return this.prisma.fuenteScraping.findMany({
			orderBy: { nombre: "asc" },
		});
	}

	async findById(id) {
		return this.prisma.fuenteScraping.findUnique({
			where: { id: Number(id) },
		});
	}

	async create(data) {
		return this.prisma.fuenteScraping.create({
			data,
		});
	}

	async updateById(id, data) {
		return this.prisma.fuenteScraping.update({
			where: { id: Number(id) },
			data,
		});
	}

	async deleteById(id) {
		return this.prisma.fuenteScraping.delete({
			where: { id: Number(id) },
		});
	}
}
