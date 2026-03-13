export class MemoryScrapingSourceRepository {
	constructor(initialSources = []) {
		this.sources = initialSources.map((source, index) => ({
			id: index + 1,
			nombre: source.nombre,
			urlBase: source.urlBase,
			habilitada: source.habilitada !== false,
		}));
		this.nextId = this.sources.length + 1;
	}

	async listAll() {
		return [...this.sources].sort((a, b) => a.nombre.localeCompare(b.nombre));
	}

	async listEnabled() {
		return (await this.listAll()).filter((source) => source.habilitada);
	}

	async findById(id) {
		return this.sources.find((source) => source.id === Number(id)) || null;
	}

	async create(data) {
		const record = {
			id: this.nextId++,
			nombre: data.nombre,
			urlBase: data.urlBase,
			habilitada: data.habilitada !== false,
		};
		this.sources.push(record);
		return record;
	}

	async updateById(id, data) {
		const source = await this.findById(id);
		if (!source) return null;
		Object.assign(source, data);
		return source;
	}

	async deleteById(id) {
		const index = this.sources.findIndex((source) => source.id === Number(id));
		if (index === -1) return null;
		const [removed] = this.sources.splice(index, 1);
		return removed;
	}
}
