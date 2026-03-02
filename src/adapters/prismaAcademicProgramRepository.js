export class PrismaAcademicProgramRepository {
	constructor(prisma) {
		this.prisma = prisma;
	}

	async listAll() {
		return this.prisma.programaAcademico.findMany({
			orderBy: { nombre: "asc" },
		});
	}

	async listActive() {
		return this.prisma.programaAcademico.findMany({
			where: { activo: true },
			orderBy: { nombre: "asc" },
		});
	}

	async findById(id) {
		return this.prisma.programaAcademico.findUnique({
			where: { id: Number(id) },
		});
	}

	async findByName(name) {
		return this.prisma.programaAcademico.findUnique({
			where: { nombre: name },
		});
	}
}
