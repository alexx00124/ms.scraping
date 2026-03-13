const healthBadge = document.querySelector("#healthBadge");
const sourcesCount = document.querySelector("#sourcesCount");
const insertedSoFar = document.querySelector("#insertedSoFar");
const sourcesChecklist = document.querySelector("#sourcesChecklist");
const statusCards = document.querySelector("#statusCards");
const statusOutput = document.querySelector("#statusOutput");
const scrapingResponse = document.querySelector("#scrapingResponse");
const jobResponse = document.querySelector("#jobResponse");
const sourcesDbResponse = document.querySelector("#sourcesDbResponse");
const sourcesDbList = document.querySelector("#sourcesDbList");

const scrapingForm = document.querySelector("#scrapingForm");
const jobForm = document.querySelector("#jobForm");
const sourceForm = document.querySelector("#sourceForm");
const refreshStatusBtn = document.querySelector("#refreshStatusBtn");
const reloadSourcesDbBtn = document.querySelector("#reloadSourcesDbBtn");
const userIdInput = document.querySelector("#userIdInput");
const gatewaySecretInput = document.querySelector("#gatewaySecretInput");

const formatJson = (value) => JSON.stringify(value, null, 2);

const setConsole = (element, value) => {
  element.textContent = typeof value === "string" ? value : formatJson(value);
};

const buildAdminHeaders = () => {
  const headers = {};
  const userId = userIdInput.value.trim();
  const gatewaySecret = gatewaySecretInput.value.trim();

  if (userId) headers["x-user-id"] = userId;
  if (gatewaySecret) headers["x-gateway-auth"] = gatewaySecret;
  return headers;
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

const renderAvailableSources = (sources) => {
  sourcesChecklist.innerHTML = "";

  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesChecklist.innerHTML = "<p>No hay fuentes disponibles.</p>";
    sourcesCount.textContent = "0";
    return;
  }

  sourcesCount.textContent = String(sources.length);
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

const loadHealth = async () => {
  try {
    const result = await api("/health", { headers: {} });
    healthBadge.textContent = result.ok ? "Operativo" : "Sin respuesta";
  } catch (error) {
    healthBadge.textContent = "Error";
  }
};

const loadStatus = async () => {
  try {
    const result = await api("/scraping/status");
    const status = result.data || result;
    renderStatusCards(status);
    insertedSoFar.textContent = String(status?.insertedSoFar ?? status?.totals?.inserted ?? 0);
    setConsole(statusOutput, status);
  } catch (error) {
    setConsole(statusOutput, error.message);
  }
};

const loadAvailableSources = async () => {
  try {
    const result = await api("/scraping/sources");
    const sources = result?.data?.sources || [];
    renderAvailableSources(sources);
  } catch (error) {
    setConsole(scrapingResponse, error.message);
  }
};

const renderSourcesDb = (sources) => {
  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesDbList.innerHTML = "<p>No hay fuentes configuradas en BD.</p>";
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
        <button class="danger-button" type="button" data-action="delete" data-id="${source.id}">
          Eliminar
        </button>
      </div>
    `;
    sourcesDbList.append(article);
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
  const profession = String(formData.get("profession") || "").trim();
  const keywords = String(formData.get("keywords") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const payload = {
    profession: profession || undefined,
    keywords,
    sources: selectedSources,
    linksPerSource: Number(formData.get("linksPerSource")) || 8,
    allPrograms: formData.get("allPrograms") === "on",
  };

  try {
    const result = await api("/scraping/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setConsole(scrapingResponse, result);
    loadStatus();
  } catch (error) {
    setConsole(scrapingResponse, { error: error.message, payload });
  }
});

jobForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(jobForm);

  const payload = {
    titulo: String(formData.get("titulo") || "").trim(),
    descripcion: String(formData.get("descripcion") || "").trim(),
    empresa: String(formData.get("empresa") || "").trim(),
    ubicacion: String(formData.get("ubicacion") || "").trim() || null,
    modalidad: String(formData.get("modalidad") || "").trim() || null,
    salarioMin: formData.get("salarioMin") ? Number(formData.get("salarioMin")) : null,
    salarioMax: formData.get("salarioMax") ? Number(formData.get("salarioMax")) : null,
    fuente: String(formData.get("fuente") || "").trim() || "manual",
    urlOriginal: String(formData.get("urlOriginal") || "").trim() || null,
    activo: true,
  };

  try {
    const result = await api("/scraping/job", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setConsole(jobResponse, result);
    jobForm.reset();
  } catch (error) {
    setConsole(jobResponse, { error: error.message, payload });
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
    loadSourcesDb();
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

    loadSourcesDb();
  } catch (error) {
    setConsole(sourcesDbResponse, error.message);
  }
});

refreshStatusBtn.addEventListener("click", loadStatus);
reloadSourcesDbBtn.addEventListener("click", loadSourcesDb);

await Promise.all([loadHealth(), loadStatus(), loadAvailableSources(), loadSourcesDb()]);
