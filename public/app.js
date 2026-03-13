const healthBadge = document.querySelector("#healthBadge");
const healthDot = document.querySelector("#healthDot");
const sourcesCount = document.querySelector("#sourcesCount");
const insertedSoFar = document.querySelector("#insertedSoFar");
const linksCount = document.querySelector("#linksCount");
const programsCount = document.querySelector("#programsCount");
const heroRunLabel = document.querySelector("#heroRunLabel");
const sourcesChecklist = document.querySelector("#sourcesChecklist");
const statusCards = document.querySelector("#statusCards");
const statusOutput = document.querySelector("#statusOutput");
const scrapingResponse = document.querySelector("#scrapingResponse");
const sourcesDbResponse = document.querySelector("#sourcesDbResponse");
const sourcesDbList = document.querySelector("#sourcesDbList");
const jobsFeed = document.querySelector("#jobsFeed");
const programsGrid = document.querySelector("#programsGrid");
const sourceBreakdown = document.querySelector("#sourceBreakdown");
const runMeta = document.querySelector("#runMeta");

const scrapingForm = document.querySelector("#scrapingForm");
const sourceForm = document.querySelector("#sourceForm");
const refreshStatusBtn = document.querySelector("#refreshStatusBtn");
const reloadSourcesDbBtn = document.querySelector("#reloadSourcesDbBtn");
const userIdInput = document.querySelector("#userIdInput");
const gatewaySecretInput = document.querySelector("#gatewaySecretInput");

const formatJson = (value) => JSON.stringify(value, null, 2);

const setConsole = (element, value) => {
  element.textContent = typeof value === "string" ? value : formatJson(value);
};

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.error?.message || payload?.message || `Request failed: ${response.status}`;
    throw new Error(error);
  }
  return payload;
};

const buildAdminHeaders = () => {
  const headers = {};
  const userId = userIdInput.value.trim();
  const gatewaySecret = gatewaySecretInput.value.trim();
  if (userId) headers["x-user-id"] = userId;
  if (gatewaySecret) headers["x-gateway-auth"] = gatewaySecret;
  return headers;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const renderAvailableSources = (sources) => {
  sourcesChecklist.innerHTML = "";
  sourcesCount.textContent = String(Array.isArray(sources) ? sources.length : 0);

  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesChecklist.innerHTML = "<p class='empty-state'>No hay fuentes disponibles.</p>";
    return;
  }

  for (const source of sources) {
    const label = document.createElement("label");
    label.className = "chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "source";
    input.value = source;
    input.checked = true;

    const text = document.createElement("span");
    text.textContent = source;

    label.append(input, text);
    sourcesChecklist.append(label);
  }
};

const renderStatusCards = (status) => {
  const cards = [
    { label: "Estado", value: status?.status || "idle" },
    { label: "Insertadas", value: status?.totals?.inserted ?? status?.insertedSoFar ?? 0 },
    { label: "Links", value: status?.totals?.links ?? 0 },
    { label: "Fallidas", value: status?.totals?.failed ?? 0 },
  ];

  statusCards.innerHTML = cards
    .map(
      (card) => `
        <article class="status-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join("");
};

const renderRunMeta = (status) => {
  const started = formatDateTime(status?.startedAt);
  const finished = formatDateTime(status?.finishedAt);
  const profession = status?.recentProfession || "Sin profesion reciente";
  const terms = Array.isArray(status?.recentSearchTerms) ? status.recentSearchTerms : [];

  heroRunLabel.textContent = `${profession} · inicio ${started}${finished !== "-" ? ` · cierre ${finished}` : ""}`;
  linksCount.textContent = String(status?.totals?.links ?? 0);
  insertedSoFar.textContent = String(status?.totals?.inserted ?? status?.insertedSoFar ?? 0);
  programsCount.textContent = String(status?.programsCount ?? 0);

  runMeta.innerHTML = `
    <article class="meta-pill"><span>Busqueda</span><strong>${profession}</strong></article>
    <article class="meta-pill"><span>Inicio</span><strong>${started}</strong></article>
    <article class="meta-pill"><span>Cierre</span><strong>${finished}</strong></article>
    <article class="meta-pill"><span>Terminos</span><strong>${terms.join(", ") || "-"}</strong></article>
  `;
};

const renderSourceBreakdown = (status) => {
  const sources = Object.entries(status?.sources || {}).filter(([, metrics]) => metrics && typeof metrics === "object" && !Array.isArray(metrics));
  if (sources.length === 0) {
    sourceBreakdown.innerHTML = "<p class='empty-state'>Todavia no hay metricas por fuente.</p>";
    return;
  }

  sourceBreakdown.innerHTML = sources
    .map(
      ([name, metrics]) => `
        <article class="source-card">
          <div>
            <strong>${name}</strong>
            <span>${metrics.success === false ? "Con incidentes" : "Operando"}</span>
          </div>
          <ul>
            <li><span>Links</span><strong>${metrics.links ?? 0}</strong></li>
            <li><span>Insertadas</span><strong>${metrics.inserted ?? 0}</strong></li>
            <li><span>Fallidas</span><strong>${metrics.failed ?? 0}</strong></li>
          </ul>
        </article>
      `,
    )
    .join("");
};

const renderJobsFeed = (jobs) => {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    jobsFeed.innerHTML = "<p class='empty-state'>Todavia no hay ofertas visibles. Ejecuta una corrida para llenar este radar.</p>";
    return;
  }

  jobsFeed.innerHTML = jobs
    .map(
      (job) => `
        <article class="job-card">
          <div class="job-topline">
            <span class="source-badge">${job.fuente || "sin fuente"}</span>
            ${job.modalidad ? `<span class="mode-badge">${job.modalidad}</span>` : ""}
            ${job.estado ? `<span class="state-badge ${job.estado === "publicada" ? "is-published" : "is-extracted"}">${job.estado}</span>` : ""}
          </div>
          <h3>${job.titulo || "Sin titulo"}</h3>
          <p class="job-company">${job.empresa || "Empresa no especificada"}</p>
          <p class="job-location">${job.ubicacion || "Ubicacion no reportada"}</p>
          <p class="job-description">${job.descripcion || "Sin descripcion"}</p>
          <div class="job-footer">
            <span>${job.programaRelacionado || "Sin carrera relacionada"}</span>
            ${job.urlOriginal ? `<a href="${job.urlOriginal}" target="_blank" rel="noreferrer">Ver oferta</a>` : ""}
          </div>
        </article>
      `,
    )
    .join("");
};

const renderPrograms = (programs) => {
  programsCount.textContent = String(Array.isArray(programs) ? programs.length : 0);

  if (!Array.isArray(programs) || programs.length === 0) {
    programsGrid.innerHTML = "<p class='empty-state'>No se cargaron programas academicos.</p>";
    return;
  }

  programsGrid.innerHTML = programs
    .slice(0, 18)
    .map(
      (program) => `
        <article class="program-card">
          <strong>${program.nombre || "Programa"}</strong>
          <p>${Array.isArray(program.keywords) && program.keywords.length > 0 ? program.keywords.slice(0, 4).join(", ") : "Sin keywords configuradas"}</p>
        </article>
      `,
    )
    .join("");
};

const renderSourcesDb = (sources) => {
  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesDbList.innerHTML = "<p class='empty-state'>No hay fuentes configuradas en BD.</p>";
    return;
  }

  sourcesDbList.innerHTML = "";
  for (const source of sources) {
    const article = document.createElement("article");
    article.className = "source-row";
    article.innerHTML = `
      <div class="source-meta">
        <strong>${source.nombre}</strong>
        <span>${source.urlBase}</span>
        <span class="pill ${source.habilitada ? "" : "off"}">${source.habilitada ? "Habilitada" : "Deshabilitada"}</span>
      </div>
      <div class="source-actions">
        <button class="small-button" type="button" data-action="toggle" data-id="${source.id}" data-enabled="${String(source.habilitada)}">
          ${source.habilitada ? "Desactivar" : "Activar"}
        </button>
        <button class="danger-button" type="button" data-action="delete" data-id="${source.id}">Eliminar</button>
      </div>
    `;
    sourcesDbList.append(article);
  }
};

const loadHealth = async () => {
  try {
    const result = await api("/health", { headers: {} });
    const ok = Boolean(result.ok);
    healthBadge.textContent = ok ? "Servicio operativo" : "Servicio sin respuesta";
    healthDot.dataset.state = ok ? "ok" : "error";
  } catch (_error) {
    healthBadge.textContent = "Error de conexion";
    healthDot.dataset.state = "error";
  }
};

const loadStatus = async () => {
  try {
    const result = await api("/scraping/status");
    const status = result.data || result;
    renderStatusCards(status);
    renderRunMeta(status);
    renderSourceBreakdown(status);
    renderJobsFeed(status?.recentJobs || []);
    setConsole(statusOutput, status);
  } catch (error) {
    setConsole(statusOutput, error.message);
  }
};

const loadPrograms = async () => {
  try {
    const result = await api("/scraping/programs");
    renderPrograms(result?.data?.items || []);
  } catch (_error) {
    programsGrid.innerHTML = "<p class='empty-state'>No fue posible cargar las carreras.</p>";
  }
};

const loadAvailableSources = async () => {
  try {
    const result = await api("/scraping/status");
    const sources = result?.data?.availableSources || [];
    renderAvailableSources(sources);
  } catch (error) {
    setConsole(scrapingResponse, error.message);
  }
};

const loadSourcesDb = async () => {
  try {
    const result = await api("/scraping/sources-db");
    renderSourcesDb(result.data || []);
  } catch (error) {
    setConsole(sourcesDbResponse, error.message);
  }
};

scrapingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(scrapingForm);
  const selectedSources = Array.from(document.querySelectorAll("input[name='source']:checked")).map((input) => input.value);
  const keywords = String(formData.get("keywords") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const payload = {
    profession: String(formData.get("profession") || "").trim() || undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    sources: selectedSources.length > 0 ? selectedSources : undefined,
    linksPerSource: Number(formData.get("linksPerSource")) || 8,
    allPrograms: formData.get("allPrograms") === "on",
  };

  try {
    const result = await api("/scraping/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setConsole(scrapingResponse, result);
    await loadStatus();
  } catch (error) {
    setConsole(scrapingResponse, { error: error.message, payload });
  }
});

sourceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(sourceForm);
  const payload = {
    nombre: String(formData.get("nombre") || "").trim(),
    baseUrl: String(formData.get("baseUrl") || "").trim(),
  };

  try {
    const result = await api("/scraping/sources-db", {
      method: "POST",
      headers: buildAdminHeaders(),
      body: JSON.stringify(payload),
    });
    setConsole(sourcesDbResponse, result);
    sourceForm.reset();
    await loadSourcesDb();
  } catch (error) {
    setConsole(sourcesDbResponse, { error: error.message, payload });
  }
});

sourcesDbList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  try {
    if (action === "toggle") {
      const enabled = button.dataset.enabled === "true";
      const result = await api(`/scraping/sources-db/${id}`, {
        method: "PUT",
        headers: buildAdminHeaders(),
        body: JSON.stringify({ habilitada: !enabled }),
      });
      setConsole(sourcesDbResponse, result);
    }

    if (action === "delete") {
      const result = await api(`/scraping/sources-db/${id}`, {
        method: "DELETE",
        headers: buildAdminHeaders(),
      });
      setConsole(sourcesDbResponse, result);
    }

    await loadSourcesDb();
  } catch (error) {
    setConsole(sourcesDbResponse, error.message);
  }
});

refreshStatusBtn.addEventListener("click", async () => {
  await Promise.all([loadHealth(), loadStatus(), loadPrograms()]);
});

reloadSourcesDbBtn.addEventListener("click", loadSourcesDb);

await Promise.all([loadHealth(), loadStatus(), loadPrograms(), loadAvailableSources(), loadSourcesDb()]);
setInterval(loadStatus, 12000);
