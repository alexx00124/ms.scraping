const CAREER_SEARCH_PROFILES = [
	{
		nombre: "Administracion de Empresas",
		keywords: [
			"administracion de empresas",
			"administrador de empresas",
			"gestion administrativa",
			"practicante de administracion de empresas",
		],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Arquitectura",
		keywords: ["arquitectura", "arquitecto", "modelador arquitectura", "auxiliar de arquitectura"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Contaduria Publica",
		keywords: ["contaduria publica", "contador publico", "practicante contaduria publica", "contable"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Derecho",
		keywords: ["derecho", "practicante de derecho", "pasante de derecho", "juridico"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Ingenieria de Sistemas",
		keywords: ["ingenieria de sistemas", "ingeniero de sistemas", "sistemas", "soporte de sistemas"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Ingenieria de Software",
		keywords: ["ingenieria de software", "desarrollador de software", "software", "developer"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Ingenieria Industrial",
		keywords: ["ingenieria industrial", "ingeniero industrial", "procesos", "mejoramiento continuo"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Medicina Veterinaria y Zootecnia",
		keywords: ["medicina veterinaria y zootecnia", "medicina veterinaria", "zootecnia", "veterinaria"],
		preferredSources: ["elempleo"],
	},
	{
		nombre: "Psicologia",
		keywords: ["psicologia", "practicante de psicologia", "psicologo", "seleccion humana"],
		preferredSources: ["elempleo"],
	},
];

export const getCareerSearchProfile = (careerName) => {
	const normalized = normalizeCareerName(careerName);
	return CAREER_SEARCH_PROFILES.find((profile) => normalizeCareerName(profile.nombre) === normalized) || null;
};

export const listCareerSearchProfiles = () => CAREER_SEARCH_PROFILES.map((profile) => ({ ...profile }));

export const normalizeCareerName = (value) =>
	String(value || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim();
