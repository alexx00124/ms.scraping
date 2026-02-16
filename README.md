# ms-scraping

Documentación ms-scraping (para Frontend/Interno)

Base
- Servicio: ms-scraping
- Ingesta de trabajos hacia tabla trabajos
---
Endpoints
1) Ingesta de un trabajo
POST /scraping/job
Body
{
  titulo: "",
  descripcion: "",
  empresa: "",
  ubicacion: "",
  modalidad: "PRESENCIAL",
  salarioMin: 0,
  salarioMax: 0,
  requisitos: {},
  habilidadesClave: {},
  fuente: "",
  urlOriginal: "",
  scrapingId: "uuid",
  activo: true
}
Response 201
{ job: { ... } }
---
2) Ingesta masiva
POST /scraping/jobs
Body
{
  jobs: [ { ... } ]
}
Response 201
{ inserted: 10 }
---
Catálogo de errores (ms-scraping)
Formato estándar
{
  error: {
    code: CODIGO_ERROR,
    message: Mensaje en español para programadores.,
    httpStatus: 400,
    details: {
      campo: detalle específico
    }
  }
}
Errores y cuándo se disparan
1) INVALID_PAYLOAD (400)
- Payload invalido o formatos incorrectos.
---
Validaciones por campo
- titulo: requerido
- descripcion: requerido
- empresa: requerido
- modalidad: si viene, debe ser PRESENCIAL | REMOTO | HIBRIDO
- salarioMin/salarioMax: si vienen, deben ser numericos
---
Validaciones pendientes (por definir)
- rangos validos de salarioMin/salarioMax
- longitud minima/maxima de titulo y descripcion
- formato de requisitos/habilidadesClave (estructura JSON)
