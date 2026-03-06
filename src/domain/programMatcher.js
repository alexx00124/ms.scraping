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

  const titleText = normalizeText(title);
  const descText = normalizeText(description || '');

  const candidates = [];

  for (const program of programs) {
    if (!Array.isArray(program?.keywords) || program.keywords.length === 0) {
      continue;
    }

    if (program.activo === false) {
      continue;
    }

    const score = computeProgramScore(titleText, descText, program.keywords);
    candidates.push({
      name: program.nombre,
      score: score.total,
      titleHits: score.titleHits,
      descriptionHits: score.descriptionHits,
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1] || { score: 0 };

  const hasMinimumEvidence =
    best.score >= 2.4 &&
    (best.titleHits >= 1 || best.descriptionHits >= 2);
  if (!hasMinimumEvidence) {
    return null;
  }

  const ambiguityMargin = best.score - second.score;
  if (ambiguityMargin < 0.8) {
    return null;
  }

  return best.name;
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
  if (!title || !program || !Array.isArray(program.keywords) || program.keywords.length === 0) {
    return 0;
  }

  const titleText = normalizeText(title);
  const descText = normalizeText(description || '');
  const score = computeProgramScore(titleText, descText, program.keywords);
  const maxPossible = program.keywords.length * 1.5;
  const percentage = maxPossible > 0 ? (score.total / maxPossible) * 100 : 0;

  return Math.min(Math.round(percentage), 100);
};

const computeProgramScore = (titleText, descriptionText, keywords) => {
  let titleHits = 0;
  let descriptionHits = 0;
  let total = 0;

  for (const rawKeyword of keywords) {
    const keyword = normalizeText(rawKeyword);
    if (!keyword || keyword.length < 3) {
      continue;
    }

    const escapedKeyword = escapeRegex(keyword);
    const keywordPattern = new RegExp(`(^|\\b)${escapedKeyword}(\\b|$)`, 'i');

    const inTitle = keywordPattern.test(titleText);
    const inDescription = keywordPattern.test(descriptionText);

    if (!inTitle && !inDescription) {
      continue;
    }

    const keywordWeight = keyword.includes(' ') ? 1.15 : 1;
    if (inDescription) {
      descriptionHits += 1;
      total += 1 * keywordWeight;
    }

    if (inTitle) {
      titleHits += 1;
      total += 0.55 * keywordWeight;
    }
  }

  return {
    total,
    titleHits,
    descriptionHits,
  };
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
