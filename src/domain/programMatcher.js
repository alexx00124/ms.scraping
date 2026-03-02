/**
 * Program Matcher - Matching de Ofertas a Programas Académicos UDC
 * 
 * Migrado de feat/smart-search-by-career:
 * Backend/src/modules/jobs/ws/database/programMatcher.js
 * 
 * Analiza el título y descripción de una oferta de trabajo y determina
 * qué programa académico de la UDC tiene mayor coincidencia basándose en keywords.
 */

/**
 * Encuentra el programa académico que mejor coincide con una oferta de trabajo
 * 
 * @param {string} title - Título de la oferta de trabajo
 * @param {string} description - Descripción de la oferta
 * @param {Array} programs - Lista de programas académicos con keywords
 * @returns {string|null} - Nombre del programa que coincide, o null si no hay match
 */
export const matchJobToProgram = (title, description, programs) => {
  if (!title || !programs || programs.length === 0) {
    return null;
  }
  
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const combinedText = `${titleLower} ${descLower}`;
  
  let bestMatch = null;
  let maxMatches = 0;
  
  for (const program of programs) {
    // Saltar programas sin keywords o inactivos
    if (!program.keywords || program.keywords.length === 0) {
      continue;
    }
    
    if (program.activo === false) {
      continue;
    }
    
    let matches = 0;
    
    // Contar cuántas keywords del programa aparecen en el job
    for (const keyword of program.keywords) {
      const keywordLower = keyword.toLowerCase();
      
      if (combinedText.includes(keywordLower)) {
        matches++;
        
        // Bonus si aparece en el título (más relevante)
        if (titleLower.includes(keywordLower)) {
          matches += 0.5;
        }
      }
    }
    
    // Actualizar mejor match si este programa tiene más coincidencias
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = program.nombre;
    }
  }
  
  // Mínimo 1.5 para match válido (1 keyword en título = 1.5, o 2 en descripción = 2)
  // Con keywords expandidos y específicos (cargos, sinónimos) se reduce el umbral
  if (maxMatches >= 1.5) {
    return bestMatch;
  }
  
  return null;
};

/**
 * Calcula un score de compatibilidad entre un job y un programa (0-100)
 * 
 * @param {string} title - Título de la oferta
 * @param {string} description - Descripción de la oferta
 * @param {Object} program - Programa académico con keywords
 * @returns {number} - Score de 0 a 100
 */
export const calculateCompatibilityScore = (title, description, program) => {
  if (!title || !program || !program.keywords || program.keywords.length === 0) {
    return 0;
  }
  
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const combinedText = `${titleLower} ${descLower}`;
  
  let matchedKeywords = 0;
  
  for (const keyword of program.keywords) {
    const keywordLower = keyword.toLowerCase();
    
    if (combinedText.includes(keywordLower)) {
      matchedKeywords++;
      
      // Bonus por aparecer en título
      if (titleLower.includes(keywordLower)) {
        matchedKeywords += 0.5;
      }
    }
  }
  
  // Calcular porcentaje basado en keywords totales del programa
  const percentage = (matchedKeywords / program.keywords.length) * 100;
  
  // Cap al 100%
  return Math.min(Math.round(percentage), 100);
};
