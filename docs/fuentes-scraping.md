# Fuentes de scraping: historial, criterios y validacion

Este documento resume las fuentes exploradas para `ms-scraping`, las decisiones tomadas y el criterio operativo usado para aprobar o descartar una bolsa.

## Objetivo operativo

- Encontrar fuentes que funcionen en despliegue real sobre Railway.
- Priorizar estabilidad y relevancia sobre volumen bruto.
- Mantener solo bolsas que entreguen vacantes utiles para carreras UDC, no solo para perfiles tech.
- Eliminar rapido cualquier fuente que falle de forma consistente en produccion.

## Criterio de aprobacion de una fuente

Una bolsa solo se considera valida si cumple este criterio duro:

- Debe entregar minimo `2` vacantes relevantes en despliegue real.
- Debe funcionar en Railway, no solo en local.
- Debe tener discovery estable.
- Debe poder extraer detalle util de la vacante.
- Debe mantener un nivel de ruido razonable para las carreras objetivo.
- Debe evitar bloqueos evidentes como `403`, captchas persistentes o challenges fragiles.

## Pruebas que hacemos para validar una bolsa

Estas son las pruebas que se usan antes de dejar una fuente activa:

### 1. Prueba de acceso inicial

- Verificar que la pagina o API responda.
- Identificar si la fuente es HTML server-rendered, API publica o flujo JS pesado.
- Revisar si hay captcha, recaptcha, redirects agresivos, sponsored-only, o anti-bot evidente.

### 2. Prueba de estructura

- Ubicar selector repetido de cards o bloque JSON-LD util.
- Confirmar patron de URL de listado y detalle.
- Confirmar que el detalle trae titulo, empresa, ubicacion y descripcion con contenido suficiente.

### 3. Prueba de relevancia por carrera

- Probar al menos varias carreras representativas, no solo sistemas.
- Usar busquedas como `psicologia`, `derecho`, `administracion de empresas`, y cuando aplique `desarrollador de software`.
- Confirmar que la fuente no mete ruido excesivo fuera de carreras tech.

### 4. Prueba local

- Ejecutar discovery y detalle en local.
- Confirmar que el scraper encuentra links y devuelve payload util.
- Revisar que el contenido extraido tenga descripcion suficiente y datos consistentes.

### 5. Prueba en Railway

- Desplegar la fuente real.
- Ejecutar corridas contra Railway, no solo localhost.
- Revisar `/scraping/sources`, `/scraping/status` y `/health`.
- Confirmar si la fuente:
  - descubre links,
  - deja vacantes en `recentJobs`,
  - termina sin `timedOut`,
  - y cumple el minimo de `2` vacantes relevantes.

### 6. Regla de descarte

- Si falla consistentemente en Railway, se elimina.
- Si solo sirve para carreras tech y rompe el resto, se descarta como fuente general.
- Si requiere demasiado cuidado operativo para apenas responder, se descarta.

## Estado actual de fuentes

### Aprobadas

#### Elempleo

- Estado: `aprobada`
- Motivo:
  - Funciona en local y Railway.
  - Tiene discovery y detalle estables.
  - Entrega vacantes relevantes.
- Decision: se mantiene activa.

#### Opcionempleo

- Estado: `aprobada para extraccion`
- Motivo:
  - Funciona en Railway para discovery y extraccion.
  - Cumple el minimo de `2` vacantes relevantes en despliegue real.
  - Usa HTML claro en resultados y Playwright lo resuelve bien.
- Observacion:
  - Los errores `fetch failed` vistos durante pruebas apuntan a publicacion contra `ms-jobs`, no al scraper de la fuente.
- Decision: se mantiene activa.

## Fuentes descartadas

### Acciontrabajo

- Estado: `descartada`
- Motivo:
  - Timeouts frecuentes.
  - Comportamiento inestable.

### Faciltrabajo

- Estado: `descartada`
- Motivo:
  - Resultados irrelevantes.
  - Mezcla demasiado ruido.

### Jooble

- Estado: `descartada`
- Motivo:
  - Aunque la API respondia, devolvia resultados irrelevantes para Colombia.
  - Tendía a devolver cargos de USA.

### Magneto

- Estado: `descartada`
- Motivo:
  - Discovery inconsistente.
  - Sin API publica estable para el enfoque del proyecto.

### Computrabajo

- Estado: `descartada`
- Motivo:
  - Responde `403`.

### Adzuna

- Estado: `descartada`
- Motivo:
  - Colombia no esta soportado por su API para este caso.

### SPE

- Estado: `descartada`
- Motivo:
  - Funcionaba en local.
  - Fallaba en Railway con `fetch failed` desde varias carreras y terminos.
- Decision:
  - Eliminada por no pasar el criterio de despliegue real.

### Un Mejor Empleo

- Estado: `descartada`
- Motivo:
  - En local tenia buena pinta y HTML simple.
  - En Railway no devolvio links consistentes o terminaba en timeout.
- Decision:
  - Eliminada del runtime.

### GetOnBrd

- Estado: `descartada`
- Motivo:
  - API real y util para tech.
  - No sirve como fuente general para carreras UDC.
  - Mete ruido fuerte en `psicologia`, `derecho` y `administracion de empresas`.
  - Ademas mostro fragilidad tecnica con respuestas `403` si no entra con comportamiento tipo navegador.
- Decision:
  - Descartada como fuente general.

### Jobrapido

- Estado: `descartada`
- Motivo:
  - Agregador pesado.
  - Mucha telemetria, captcha/recaptcha y redirects de tracking.
  - Baja confianza operativa para Railway.
- Decision:
  - Descartada sin implementacion.

### Trabajos Diarios

- Estado: `descartada`
- Motivo:
  - Localmente funcionaba bien.
  - En Railway descubria links reales, pero terminaba con `timedOut` de forma consistente.
  - Incluso tras una unica oportunidad de ajuste corto para Railway, no paso la validacion final.
- Decision:
  - Eliminada del runtime.

### JobisJob

- Estado: `descartada`
- Motivo:
  - Ya no opera de forma util en el mercado objetivo.

## Resumen de decisiones operativas

- Mantener solo fuentes probadas en Railway.
- No confiar en una fuente solo porque funciona en local.
- No aprobar una fuente solo por volumen; la relevancia por carrera importa.
- Si la fuente expira, bloquea o necesita demasiado cuidado, se elimina.

## Estado final actual

- Fuentes activas en runtime:
  - `elempleo`
  - `opcionempleo`

- Fuentes descartadas:
  - `acciontrabajo`
  - `faciltrabajo`
  - `jooble`
  - `magneto`
  - `computrabajo`
  - `adzuna`
  - `spe`
  - `unmejorempleo`
  - `getonbrd`
  - `jobrapido`
  - `trabajosdiarios`
  - `jobisjob`

## Notas de infraestructura pendientes

- `ms-jobs` sigue sin estar disponible en Railway en este entorno de pruebas, por eso varias corridas quedan como `extraida` y no `publicada`.
- `/health` sigue reportando fallback del repositorio de fuentes mientras la tabla `fuentes_scraping` no exista o no este aplicada en la base correcta.
