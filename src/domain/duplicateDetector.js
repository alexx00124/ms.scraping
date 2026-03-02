/**
 * Duplicate Detector - Detección avanzada de ofertas duplicadas
 * 
 * Implementa:
 * - Fuzzy matching de títulos (Levenshtein distance)
 * - Normalización de empresas
 * - Detección de URLs similares
 */

/**
 * Calcula la similitud entre dos ofertas (0-100)
 * @param {Object} job1 - Primera oferta
 * @param {Object} job2 - Segunda oferta
 * @returns {number} Porcentaje de similitud (0-100)
 */
export const calculateSimilarity = (job1, job2) => {
  let totalScore = 0;
  let weights = 0;
  
  // 1. Similitud de título (peso: 40%)
  const titleSim = calculateStringSimilarity(
    normalizeTitle(job1.titulo),
    normalizeTitle(job2.titulo)
  );
  totalScore += titleSim * 0.4;
  weights += 0.4;
  
  // 2. Similitud de empresa (peso: 30%)
  if (job1.empresa && job2.empresa) {
    const companySim = calculateStringSimilarity(
      normalizeCompany(job1.empresa),
      normalizeCompany(job2.empresa)
    );
    totalScore += companySim * 0.3;
    weights += 0.3;
  }
  
  // 3. Similitud de ubicación (peso: 15%)
  if (job1.ubicacion && job2.ubicacion) {
    const locationSim = calculateStringSimilarity(
      normalizeLocation(job1.ubicacion),
      normalizeLocation(job2.ubicacion)
    );
    totalScore += locationSim * 0.15;
    weights += 0.15;
  }
  
  // 4. Similitud de URL (peso: 15%)
  if (job1.urlOriginal && job2.urlOriginal) {
    const urlSim = areUrlsSimilar(job1.urlOriginal, job2.urlOriginal) ? 100 : 0;
    totalScore += urlSim * 0.15;
    weights += 0.15;
  }
  
  // Normalizar score según pesos disponibles
  return weights > 0 ? Math.round((totalScore / weights) * 100) : 0;
};

/**
 * Verifica si dos ofertas son duplicadas (similitud > 80%)
 */
export const areDuplicates = (job1, job2, threshold = 80) => {
  return calculateSimilarity(job1, job2) >= threshold;
};

/**
 * Encuentra duplicados de una oferta en una lista
 */
export const findDuplicates = (job, jobList, threshold = 80) => {
  return jobList.filter(existingJob => {
    // No comparar consigo mismo
    if (existingJob.id === job.id) return false;
    
    return areDuplicates(job, existingJob, threshold);
  });
};

// ===== FUNCIONES DE NORMALIZACIÓN =====

/**
 * Normaliza un título para comparación
 */
function normalizeTitle(title) {
  if (!title) return '';
  
  return title
    .toLowerCase()
    .trim()
    // Quitar caracteres especiales
    .replace(/[^\w\sáéíóúñü]/gi, '')
    // Normalizar espacios
    .replace(/\s+/g, ' ')
    // Quitar palabras muy comunes que no aportan al matching
    .replace(/\b(el|la|de|para|con|en|un|una|los|las)\b/g, '')
    .trim();
}

/**
 * Normaliza nombre de empresa
 */
function normalizeCompany(company) {
  if (!company) return '';
  
  return company
    .toLowerCase()
    .trim()
    // Quitar sufijos comunes de empresas
    .replace(/\b(s\.?a\.?s?|s\.?r\.?l|ltda?|inc|corp|corporation|company|co\.|cia|limitada)\b/gi, '')
    // Quitar caracteres especiales
    .replace(/[^\w\sáéíóúñü]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza ubicación
 */
function normalizeLocation(location) {
  if (!location) return '';
  
  return location
    .toLowerCase()
    .trim()
    // Normalizar abreviaciones comunes
    .replace(/\bbog\b/g, 'bogota')
    .replace(/\bmed\b/g, 'medellin')
    .replace(/\bcali\b/g, 'cali')
    .replace(/\bbarranq\b/g, 'barranquilla')
    // Quitar ", Colombia"
    .replace(/,?\s*colombia\s*$/i, '')
    .replace(/[^\w\sáéíóúñü]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica si dos URLs son similares
 */
function areUrlsSimilar(url1, url2) {
  if (!url1 || !url2) return false;
  
  // URLs idénticas
  if (url1 === url2) return true;
  
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    
    // Mismo dominio y path similar
    if (u1.hostname === u2.hostname) {
      // Extraer IDs de las URLs (números largos suelen ser IDs de ofertas)
      const id1 = extractJobIdFromUrl(url1);
      const id2 = extractJobIdFromUrl(url2);
      
      if (id1 && id2 && id1 === id2) {
        return true;
      }
    }
  } catch (e) {
    // Si no son URLs válidas, comparar como strings
    return url1 === url2;
  }
  
  return false;
}

/**
 * Extrae ID de oferta de una URL
 */
function extractJobIdFromUrl(url) {
  // Patrones comunes: /job/12345, /jobs/12345, ?id=12345
  const patterns = [
    /\/job[s]?\/(\d+)/,
    /\/oferta[s]?\/(\d+)/,
    /[?&]id=(\d+)/,
    /[?&]jobId=(\d+)/,
    /\/(\d{5,})/  // Cualquier número de 5+ dígitos en el path
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// ===== ALGORITMO DE SIMILITUD DE STRINGS =====

/**
 * Calcula similitud entre dos strings (0-100)
 * Usa distancia de Levenshtein normalizada
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 100;
  
  // Distancia de Levenshtein
  const distance = levenshteinDistance(longer, shorter);
  
  // Convertir a porcentaje de similitud
  return Math.round(((longer.length - distance) / longer.length) * 100);
}

/**
 * Calcula la distancia de Levenshtein entre dos strings
 * (número mínimo de ediciones para transformar una string en otra)
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  // Inicializar matriz
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Llenar matriz
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitución
          matrix[i][j - 1] + 1,     // inserción
          matrix[i - 1][j] + 1      // eliminación
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Agrupa ofertas duplicadas
 * @param {Array} jobs - Lista de ofertas
 * @param {number} threshold - Umbral de similitud (0-100)
 * @returns {Array} - Grupos de duplicados [[job1, job2], [job3, job4, job5], ...]
 */
export const groupDuplicates = (jobs, threshold = 80) => {
  const groups = [];
  const processed = new Set();
  
  for (let i = 0; i < jobs.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [jobs[i]];
    processed.add(i);
    
    for (let j = i + 1; j < jobs.length; j++) {
      if (processed.has(j)) continue;
      
      if (areDuplicates(jobs[i], jobs[j], threshold)) {
        group.push(jobs[j]);
        processed.add(j);
      }
    }
    
    // Solo agregar grupos con más de 1 elemento (duplicados reales)
    if (group.length > 1) {
      groups.push(group);
    }
  }
  
  return groups;
};

/**
 * Marca ofertas como duplicadas (agrega campo isDuplicate)
 */
export const markDuplicates = (jobs, threshold = 80) => {
  const duplicateGroups = groupDuplicates(jobs, threshold);
  const duplicateIds = new Set();
  
  // Recolectar IDs de todos los duplicados
  for (const group of duplicateGroups) {
    // Mantener el primero, marcar el resto como duplicados
    for (let i = 1; i < group.length; i++) {
      duplicateIds.add(group[i].id);
    }
  }
  
  // Marcar en la lista original
  return jobs.map(job => ({
    ...job,
    isDuplicate: duplicateIds.has(job.id),
    duplicateOf: duplicateIds.has(job.id) 
      ? duplicateGroups.find(g => g.some((j, idx) => idx > 0 && j.id === job.id))?.[0]?.id 
      : null
  }));
};
