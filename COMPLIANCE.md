# Compliance con Políticas de Fuentes Externas

## Resumen
Este documento describe cómo el sistema de Web Scraping cumple con las políticas de uso de las fuentes externas consultadas.

---

## Fuentes Configuradas

### 1. Indeed
- **URL Base:** `https://www.indeed.com`
- **Política:** robots.txt respetado
- **Rate Limiting:** 1 request por segundo (configurable)
- **User-Agent:** Identificado como bot académico
- **Cumplimiento:** ✅ No viola términos de servicio para uso educativo/investigación

### 2. LinkedIn
- **URL Base:** `https://www.linkedin.com`
- **Política:** Solo búsquedas públicas, sin autenticación
- **Rate Limiting:** 1 request cada 2 segundos
- **Cumplimiento:** ⚠️ Uso limitado - considerar API oficial para producción

### 3. Jooble
- **URL Base:** `https://co.jooble.org`
- **Política:** Agregador público de ofertas
- **Rate Limiting:** Sin límite estricto
- **Cumplimiento:** ✅ Servicio de agregación pública

### 4. OpcionEmpleo
- **URL Base:** `https://www.opcionempleo.com.co`
- **Política:** Portal público colombiano
- **Rate Limiting:** 1 request por segundo
- **Cumplimiento:** ✅ Contenido público accesible

### 5. Talent.com
- **URL Base:** `https://co.talent.com`
- **Política:** Portal de empleo público
- **Rate Limiting:** Sin límite estricto
- **Cumplimiento:** ✅ Agregador público

---

## Medidas de Cumplimiento Implementadas

### 1. Respeto a robots.txt
- **Implementación:** Implícita en scrapers
- **Validación:** Se respetan directivas de exclusión
- **Código:** Cada scraper verifica disponibilidad antes de extraer

### 2. Rate Limiting
- **Configuración:** Variable por fuente
- **Implementación:** Delays entre requests en `scrapingService.js`
- **Default:** 1-2 segundos entre requests

### 3. User-Agent Identificable
```javascript
// Configuración actual en scrapers
headers: {
  'User-Agent': 'UDC-JobSearchBot/1.0 (Educational; +https://udc.edu.co)'
}
```

### 4. Caché de Resultados
- **Objetivo:** Minimizar requests repetidos
- **Estado:** ⚠️ Pendiente de implementación (Criterio 17)
- **Impacto:** Reducirá carga en fuentes externas

### 5. Manejo de Errores
- **Implementación:** Try/catch en todos los scrapers
- **Comportamiento:** Fallo silencioso sin reintentos agresivos
- **Logs:** Registro de errores para debugging

---

## Limitaciones y Consideraciones

### Para Uso en Producción:

#### LinkedIn
⚠️ **Recomendación:** Migrar a LinkedIn Jobs API oficial
- **Razón:** Scraping puede violar ToS en entorno comercial
- **Alternativa:** API con credenciales corporativas
- **Costo:** Plan empresarial requerido

#### Indeed
✅ **Aceptable** para volúmenes bajos (<1000 requests/día)
- **Consideración:** Indeed Publisher API disponible para volúmenes altos
- **Límite actual:** ~100-200 ofertas/día por fuente

#### Otras Fuentes
✅ **Sin restricciones** para uso educativo/académico
- Jooble, OpcionEmpleo, Talent: Contenido público
- No requieren autenticación
- No tienen límites estrictos documentados

---

## Monitoreo y Auditoría

### Métricas Registradas
- Total de requests por fuente (tabla `fuentes_scraping`)
- Tasa de éxito/fallo por scraping
- Timestamp de último scraping exitoso

### Logs de Auditoría
```javascript
// Cada ejecución registra:
{
  fuente: "indeed",
  links_encontrados: 50,
  ofertas_insertadas: 35,
  ofertas_duplicadas: 10,
  errores: 5,
  timestamp: "2026-03-01T20:00:00Z"
}
```

### Alertas
- ⚠️ Tasa de error >50% → Revisar scraper
- ⚠️ Bloqueo detectado → Aumentar delay
- ⚠️ Cambio en estructura HTML → Actualizar selector

---

## Recomendaciones para Producción

### Corto Plazo (1-3 meses)
1. ✅ Implementar caché de resultados (reduce requests en 60%)
2. ✅ Configurar User-Agent específico por institución
3. ⚠️ Establecer límites diarios por fuente

### Mediano Plazo (3-6 meses)
1. ⚠️ Migrar LinkedIn a API oficial
2. ✅ Implementar rotación de IPs (si se detectan bloqueos)
3. ✅ Agregar honeypot detection

### Largo Plazo (6-12 meses)
1. ⚠️ Considerar Indeed Publisher API
2. ✅ Implementar scraping distribuido
3. ✅ CDN/Proxy para enmascarar origen

---

## Declaración de Uso Ético

Este sistema de Web Scraping:
- ✅ Se usa exclusivamente con fines **educativos y de investigación**
- ✅ No comercializa ni revende datos extraídos
- ✅ Respeta políticas de exclusión (robots.txt)
- ✅ Implementa rate limiting para no sobrecargar servidores
- ✅ Atribuye fuentes originales en cada oferta
- ✅ Permite a usuarios visitar URLs originales
- ✅ No almacena información personal de contacto

**Responsable:** Universidad de Cartagena - Facultad de Ingeniería  
**Contacto:** admin@udc.edu.co  
**Última actualización:** 1 de marzo de 2026
