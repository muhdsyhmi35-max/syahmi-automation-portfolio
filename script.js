(() => {
  const STORAGE_KEY = "syahmi-portfolio-v2";
  const DB_NAME = "syahmi-portfolio-db";
  const DB_STORE = "portfolio";
  const DB_KEY = "main";
  const EDIT_PASSWORD = "Syhmie009";
  const EDIT_UNLOCK_KEY = "syahmi-edit-unlocked";
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const app = document.getElementById("app");
  const editorBar = document.getElementById("editor-bar");
  const btnEdit = document.getElementById("btn-edit");
  const btnDone = document.getElementById("btn-done");
  const btnSave = document.getElementById("btn-save");
  const btnReset = document.getElementById("btn-reset");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  const btnExport = document.getElementById("btn-export");
  const btnAddProject = document.getElementById("btn-add-project");
  const importFile = document.getElementById("import-file");
  const logoEl = document.querySelector(".logo");
  const authModal = document.getElementById("auth-modal");
  const authForm = document.getElementById("auth-form");
  const authPassword = document.getElementById("auth-password");
  const authError = document.getElementById("auth-error");
  const footerNameEl = document.querySelector('[data-edit="footerName"]');

  let state = clone(window.PORTFOLIO_DEFAULTS);
  let editing = false;
  let dirty = false;
  let fabVisible = false;
  let saveTimer = null;
  let selectedTextPath = null;
  let selectedTextEl = null;
  let lightbox = { source: null, projectId: null, pageId: null, blockId: null, index: 0 };
  let undoStack = [];
  let redoStack = [];
  let stableSnapshot = null;
  let historyTimer = null;
  let historyLocked = false;
  const HISTORY_LIMIT = 40;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeCrop(crop) {
    const c = crop && typeof crop === "object" ? crop : {};
    const fit = c.fit === "contain" || c.fit === "fill" || c.fit === "cover" ? c.fit : "cover";
    let w = Number(c.w);
    let h = Number(c.h);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      const z = Math.max(0.35, Math.min(3, Number(c.zoom) || 1));
      w = Math.round(z * 100);
      h = Math.round(z * 100);
    }
    w = Math.max(20, Math.min(400, Math.round(w)));
    h = Math.max(20, Math.min(400, Math.round(h)));
    return {
      w,
      h,
      zoom: (w + h) / 200,
      x: Math.max(-50, Math.min(50, Number(c.x) || 0)),
      y: Math.max(-50, Math.min(50, Number(c.y) || 0)),
      fit
    };
  }

  function normalizePhoto(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      return { src: entry, w: 100, h: 100, x: 0, y: 0, fit: "contain" };
    }
    if (typeof entry === "object" && entry.src) {
      const crop = normalizeCrop(entry);
      return { src: entry.src, w: crop.w, h: crop.h, x: crop.x, y: crop.y, fit: crop.fit };
    }
    return null;
  }

  function normalizePhotos(list) {
    return (list || []).map(normalizePhoto).filter(Boolean);
  }

  function uid(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function emptyImageCrop() {
    return { w: 100, h: 100, x: 0, y: 0, fit: "contain" };
  }

  function createEmptyCaseStudy() {
    return {
      open: false,
      activePageId: "overview",
      pages: [
        {
          id: "overview",
          title: "Overview",
          blocks: [
            { id: uid("b"), type: "bullets", title: "Problem statement", items: ["Add a problem here."] },
            { id: uid("b"), type: "bullets", title: "Objectives", items: ["Add an objective here."] },
            {
              id: uid("b"),
              type: "image",
              title: "Photo / diagram",
              photos: [],
              activePhoto: 0,
              caption: "Upload or paste images (Ctrl+V)"
            }
          ]
        }
      ]
    };
  }

  function createBlock(type) {
    const id = uid("b");
    if (type === "text") return { id, type: "text", title: "Text box", body: "Write your content here." };
    if (type === "bullets") return { id, type: "bullets", title: "Bullet list", items: ["New item"] };
    if (type === "image") {
      return {
        id,
        type: "image",
        title: "Image / chart",
        photos: [],
        activePhoto: 0,
        caption: "Upload or paste schedules, flowcharts, or photos"
      };
    }
    if (type === "bom") {
      return {
        id,
        type: "bom",
        title: "Bill of materials",
        rows: [{ part: "Part name", qty: 1, unitCost: 0 }]
      };
    }
    if (type === "gantt") {
      return {
        id,
        type: "gantt",
        title: "Schedule",
        weeks: 8,
        tasks: [{ task: "Task", pic: "PIC", planStart: 1, planEnd: 3, actualStart: 1, actualEnd: 2 }]
      };
    }
    if (type === "evolution") {
      return {
        id,
        type: "evolution",
        title: "Design evolution",
        stages: [
          { label: "Concept", photo: "", crop: emptyImageCrop() },
          { label: "Prototype", photo: "", crop: emptyImageCrop() }
        ]
      };
    }
    return createBlock("text");
  }

  function normalizeBlock(block) {
    if (!block || typeof block !== "object") return createBlock("text");
    const type = block.type || "text";
    const base = { id: block.id || uid("b"), type, title: block.title || "Block" };
    if (type === "text") return { ...base, body: block.body || "" };
    if (type === "bullets") {
      return { ...base, items: Array.isArray(block.items) && block.items.length ? block.items.map(String) : [""] };
    }
    if (type === "image") {
      let photos = normalizePhotos(block.photos);
      if (!photos.length && block.photo) {
        const crop = normalizeCrop(block.crop || emptyImageCrop());
        photos = [{ src: block.photo, w: crop.w, h: crop.h, x: crop.x, y: crop.y, fit: crop.fit }];
      }
      // Screenshots should fill the frame (upgrade old Fit/contain uploads)
      photos = photos.map((p) => ({
        ...p,
        fit: !p.fit || p.fit === "contain" ? "cover" : p.fit,
        w: Number(p.w) > 0 ? p.w : 100,
        h: Number(p.h) > 0 ? p.h : 100
      }));
      const activePhoto = Math.min(Math.max(0, Number(block.activePhoto) || 0), Math.max(0, photos.length - 1));
      return {
        ...base,
        photos,
        activePhoto,
        caption: block.caption || ""
      };
    }
    if (type === "bom") {
      const rows = (block.rows || []).map((r) => ({
        part: r.part || "",
        qty: Number(r.qty) || 0,
        unitCost: Number(r.unitCost) || 0
      }));
      return { ...base, rows: rows.length ? rows : [{ part: "", qty: 1, unitCost: 0 }] };
    }
    if (type === "gantt") {
      const tasks = (block.tasks || []).map((t) => ({
        task: t.task || "",
        pic: t.pic || "",
        planStart: Number(t.planStart) || 1,
        planEnd: Number(t.planEnd) || 1,
        actualStart: Number(t.actualStart) || 1,
        actualEnd: Number(t.actualEnd) || 1
      }));
      return {
        ...base,
        weeks: Math.max(4, Math.min(24, Number(block.weeks) || 8)),
        tasks: tasks.length ? tasks : [{ task: "Task", pic: "", planStart: 1, planEnd: 2, actualStart: 1, actualEnd: 2 }]
      };
    }
    if (type === "evolution") {
      const stages = (block.stages || []).map((s) => ({
        label: s.label || "Stage",
        photo: s.photo || "",
        crop: normalizeCrop(s.crop || emptyImageCrop())
      }));
      return {
        ...base,
        stages: stages.length
          ? stages
          : [
              { label: "Concept", photo: "", crop: emptyImageCrop() },
              { label: "Prototype", photo: "", crop: emptyImageCrop() }
            ]
      };
    }
    return { ...base, type: "text", body: block.body || "" };
  }

  function normalizeCaseStudy(cs) {
    if (!cs || typeof cs !== "object") return createEmptyCaseStudy();
    const pages = (cs.pages || []).map((page) => ({
      id: page.id || uid("page"),
      title: page.title || "Page",
      blocks: (page.blocks || []).map(normalizeBlock)
    }));
    const normalizedPages = pages.length
      ? pages
      : createEmptyCaseStudy().pages;
    const activePageId =
      normalizedPages.some((p) => p.id === cs.activePageId) ? cs.activePageId : normalizedPages[0].id;
    return {
      open: !!cs.open,
      activePageId,
      pages: normalizedPages
    };
  }

  function findCaseStudyRefs(projectId, pageId, blockId) {
    const project = state.projects.items.find((p) => p.id === projectId);
    if (!project) return null;
    project.caseStudy = normalizeCaseStudy(project.caseStudy);
    const page = project.caseStudy.pages.find((p) => p.id === pageId);
    if (!page) return { project, page: null, block: null };
    const block = blockId ? page.blocks.find((b) => b.id === blockId) : null;
    return { project, page, block };
  }

  function cropStyle(crop) {
    const c = normalizeCrop(crop);
    return `--pw:${c.w};--ph:${c.h};--ox:${c.x};--oy:${c.y};--fit:${c.fit}`;
  }

  function photoSrc(entry) {
    if (!entry) return "";
    return typeof entry === "string" ? entry : entry.src || "";
  }

  function photoAdjustControls(crop, opts) {
    const c = normalizeCrop(crop);
    const {
      prefix = "",
      zoomAttrs = "",
      resetId = "",
      resetAttrs = "",
      fitAttrs = "",
      sizeAttrs = ""
    } = opts || {};
    const wId = prefix ? `${prefix}-w` : "";
    const hId = prefix ? `${prefix}-h` : "";
    return `
      <div class="photo-adjust-panel" ${sizeAttrs}>
        <div class="photo-fit-modes" ${fitAttrs}>
          <button type="button" class="editor-btn ${c.fit === "contain" ? "is-active" : ""}" data-fit-mode="contain" title="Show full photo inside box">Fit</button>
          <button type="button" class="editor-btn ${c.fit === "cover" ? "is-active" : ""}" data-fit-mode="cover" title="Fill box (may crop edges)">Fill</button>
          <button type="button" class="editor-btn ${c.fit === "fill" ? "is-active" : ""}" data-fit-mode="fill" title="Stretch to box">Stretch</button>
        </div>
        <div class="photo-size-controls">
          <label>W%
            <input type="number" min="20" max="400" step="5" value="${c.w}" ${wId ? `id="${wId}"` : ""} data-photo-dim="w" ${zoomAttrs} />
          </label>
          <label>H%
            <input type="number" min="20" max="400" step="5" value="${c.h}" ${hId ? `id="${hId}"` : ""} data-photo-dim="h" ${zoomAttrs} />
          </label>
          <button type="button" class="editor-btn" ${resetId ? `id="${resetId}"` : ""} ${resetAttrs}>Reset</button>
        </div>
        <div class="photo-size-sliders">
          <label>Width
            <input type="range" min="20" max="400" step="5" value="${c.w}" data-photo-dim-range="w" ${zoomAttrs} />
            <span class="photo-dim-value" data-photo-dim-label="w">${c.w}%</span>
          </label>
          <label>Height
            <input type="range" min="20" max="400" step="5" value="${c.h}" data-photo-dim-range="h" ${zoomAttrs} />
            <span class="photo-dim-value" data-photo-dim-label="h">${c.h}%</span>
          </label>
        </div>
        <p class="photo-adjust-hint">Set W and H separately · drag to move · wheel = width · Shift+wheel = height</p>
      </div>
    `;
  }

  function normalizeState(parsed) {
    const defaults = clone(window.PORTFOLIO_DEFAULTS);
    if (!parsed || typeof parsed !== "object") return defaults;
    const normalized = {
      ...defaults,
      ...parsed,
      layoutVersion: Math.max(Number(parsed.layoutVersion) || 0, 5),
      positions: parsed.positions || {},
      textSizes: { ...(parsed.textSizes || {}) },
      textBoxes: { ...(parsed.textBoxes || {}) },
      typography: { ...defaults.typography, ...(parsed.typography || {}) },
      hero: {
        ...defaults.hero,
        ...(parsed.hero || {}),
        photoCrop: normalizeCrop((parsed.hero && parsed.hero.photoCrop) || defaults.hero.photoCrop)
      },
      projects: {
        ...defaults.projects,
        ...(parsed.projects || {}),
        items: ((parsed.projects && parsed.projects.items) || defaults.projects.items).map((item) => {
          const base = {
            photoWidth: item.featured ? 480 : 360,
            photoHeight: item.featured ? 300 : 220,
            photos: [],
            ...item
          };
          base.photos = normalizePhotos(item.photos);
          if (base.featured) {
            base.caseStudy = normalizeCaseStudy(item.caseStudy);
          } else {
            delete base.caseStudy;
          }
          return base;
        })
      }
    };

    // Reset old dragged hero offsets so the full-screen layout looks correct
    if ((Number(parsed.layoutVersion) || 0) < 3) {
      ["hero-content", "hero-photo", "hero-meta"].forEach((key) => {
        normalized.positions[key] = { x: 0, y: 0 };
      });
      normalized.hero.lineY = 0;
      normalized.layoutVersion = 3;
    }

    // Move sparks image out of the photo box into subtle hero background
    if ((Number(parsed.layoutVersion) || 0) < 5) {
      const photo = (normalized.hero && normalized.hero.photo) || "";
      if (!photo || photo === "images/hero-sparks.png" || photo === "[saved-in-db]") {
        normalized.hero.photo = "";
        normalized.hero.photoCrop = clone(defaults.hero.photoCrop);
        normalized.hero.photoWidth = defaults.hero.photoWidth;
        normalized.hero.photoHeight = defaults.hero.photoHeight;
        normalized.hero.showPhotoBox = false;
      }
      normalized.layoutVersion = 5;
    }

    return normalized;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbClear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadState() {
    try {
      const fromIdb = await idbGet();
      if (fromIdb) {
        const normalized = normalizeState(fromIdb);
        if ((Number(fromIdb.layoutVersion) || 0) < 5) {
          try {
            await idbSet(normalized);
          } catch (_) {
            /* ignore */
          }
        }
        return normalized;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = normalizeState(parsed);
        try {
          await idbSet(normalized);
        } catch (_) {
          /* ignore migrate write errors */
        }
        return normalized;
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
    return clone(window.PORTFOLIO_DEFAULTS);
  }

  function setSaveStatus(text) {
    if (!btnSave) return;
    btnSave.textContent = text;
  }

  async function saveState() {
    syncEditableToState();
    try {
      await idbSet(state);
      try {
        // lightweight backup without photos (in case IDB is cleared)
        const slim = clone(state);
        if (slim.hero) slim.hero.photo = slim.hero.photo ? "[saved-in-db]" : "";
        slim.projects.items.forEach((p) => {
          p.photos = (p.photos || []).map(() => ({ src: "[saved-in-db]", zoom: 1, x: 0, y: 0 }));
        });
        localStorage.setItem(STORAGE_KEY + "-meta", JSON.stringify({ savedAt: Date.now(), version: slim.version }));
      } catch (_) {
        /* meta backup optional */
      }
      dirty = false;
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus("Save"), 1000);
      return true;
    } catch (err) {
      console.error(err);
      setSaveStatus("Save failed");
      alert("Could not save. Photos may be too large — try fewer/smaller images, or use Export.");
      return false;
    }
  }

  function queueDirty() {
    dirty = true;
    setSaveStatus("Save*");
    captureHistoryCheckpoint();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState();
    }, 500);
  }

  function updateHistoryButtons() {
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
  }

  function captureHistoryCheckpoint() {
    if (historyLocked) return;
    // First change in a burst: push the pre-change snapshot once
    if (!historyTimer && stableSnapshot) {
      undoStack.push(clone(stableSnapshot));
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      historyTimer = null;
      stableSnapshot = clone(state);
    }, 450);
  }

  function resetHistoryFromState() {
    undoStack = [];
    redoStack = [];
    clearTimeout(historyTimer);
    historyTimer = null;
    stableSnapshot = clone(state);
    updateHistoryButtons();
  }

  async function applyHistoryState(nextState) {
    historyLocked = true;
    clearTimeout(historyTimer);
    historyTimer = null;
    syncEditableToState();
    state = normalizeState(nextState);
    stableSnapshot = clone(state);
    dirty = true;
    selectedTextPath = null;
    selectedTextEl = null;
    render();
    if (editing) setEditing(true);
    updateHistoryButtons();
    await saveState();
    historyLocked = false;
  }

  async function undoChange() {
    if (!undoStack.length || historyLocked) return;
    const current = clone(state);
    const previous = undoStack.pop();
    redoStack.push(current);
    if (redoStack.length > HISTORY_LIMIT) redoStack.shift();
    await applyHistoryState(previous);
  }

  async function redoChange() {
    if (!redoStack.length || historyLocked) return;
    const current = clone(state);
    const next = redoStack.pop();
    undoStack.push(current);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    await applyHistoryState(next);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nlToBr(str) {
    return escapeHtml(str).replace(/\n/g, "<br>");
  }

  function movable(id, className, inner, extraStyle = "") {
    const pos = state.positions[id] || { x: 0, y: 0 };
    return `
      <div class="movable ${className || ""}" data-movable="${id}" style="--mx:${pos.x}px;--my:${pos.y}px;${extraStyle}">
        <button type="button" class="drag-handle" data-drag="${id}" aria-label="Move" title="Drag to move" hidden>⠿</button>
        ${inner}
      </div>
    `;
  }

  function editable(path, tag, className, value, multiline = false) {
    const Tag = tag || "span";
    const box = (state.textBoxes && state.textBoxes[path]) || {};
    const size = state.textSizes && state.textSizes[path];
    const cls = ["editable", className, box.width || box.height ? "has-box-size" : ""]
      .filter(Boolean)
      .join(" ");
    const styles = [];
    if (size) styles.push(`font-size:${Number(size)}px`);
    if (box.width) {
      styles.push(`width:${Number(box.width)}px`);
      styles.push(`max-width:${Number(box.width)}px`);
    }
    if (box.height) styles.push(`min-height:${Number(box.height)}px`);
    const style = styles.length ? ` style="${styles.join(";")}"` : "";
    return `<${Tag} class="${cls}" data-path="${path}" data-multiline="${multiline ? "1" : "0"}"${style}>${nlToBr(value)}</${Tag}>`;
  }

  function getEditablePlainText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".text-box-resize").forEach((node) => node.remove());
    return clone.innerText.replace(/\u00a0/g, " ").trimEnd();
  }

  function projectPhotoSize(project) {
    return {
      w: Number(project.photoWidth) || (project.featured ? 480 : 360),
      h: Number(project.photoHeight) || (project.featured ? 300 : 220)
    };
  }

  function renderGallery(project) {
    const photos = normalizePhotos(project.photos);
    const size = projectPhotoSize(project);
    const slides = photos
      .map((photo, i) => {
        const crop = normalizeCrop(photo);
        return `
        <div class="gallery-slide" data-project="${project.id}" data-index="${i}" role="button" tabindex="0" aria-label="View ${escapeHtml(project.title)} photo ${i + 1}">
          <div class="photo-crop" data-photo-crop="project" data-project="${project.id}" data-index="${i}" style="${cropStyle(crop)}">
            <img src="${photo.src}" alt="${escapeHtml(project.title)} photo ${i + 1}" loading="lazy" draggable="false" />
          </div>
          <span class="gallery-view-hint">Click to view</span>
          <span class="gallery-crop-hint" hidden>Drag · wheel zoom · Fit/Fill below</span>
          <button type="button" class="gallery-remove" data-remove-photo="${project.id}" data-index="${i}" hidden aria-label="Remove photo">×</button>
        </div>`;
      })
      .join("");

    const activeIndex = Math.min(Number(project.activePhoto) || 0, Math.max(0, photos.length - 1));
    const activePhoto = photos[activeIndex];
    const activeCrop = normalizeCrop(activePhoto);

    return `
      <div class="gallery" data-gallery="${project.id}" style="--gal-w:${size.w}px;--gal-h:${size.h}px">
        <div class="gallery-stage">
          <div class="gallery-track ${photos.length ? "has-photos" : "is-empty"}">
            ${
              photos.length
                ? slides
                : `<div class="gallery-empty"><span>No photos yet</span><small>Add one or more project photos</small></div>`
            }
          </div>
          ${
            photos.length > 1
              ? `<button type="button" class="gallery-nav gallery-nav-prev" data-gal-prev="${project.id}" aria-label="Previous photo">‹</button>
                 <button type="button" class="gallery-nav gallery-nav-next" data-gal-next="${project.id}" aria-label="Next photo">›</button>`
              : ""
          }
          <button type="button" class="gallery-resize" data-gal-resize="${project.id}" hidden aria-label="Resize photos" title="Drag to resize"></button>
        </div>
        <div class="gallery-toolbar">
          ${
            photos.length > 1
              ? `<span class="gallery-count">${photos.length} photos</span>`
              : photos.length === 1
                ? `<span class="gallery-count">1 photo</span>`
                : ""
          }
          <label class="photo-pick gallery-add" hidden>
            Add photos
            <input type="file" accept="image/*" multiple hidden data-add-photos="${project.id}" />
          </label>
          <div class="hero-photo-size gallery-size" hidden data-gal-size="${project.id}">
            <label>W <input type="number" min="140" max="900" step="10" value="${size.w}" data-gal-w="${project.id}" /></label>
            <label>H <input type="number" min="120" max="700" step="10" value="${size.h}" data-gal-h="${project.id}" /></label>
            <button type="button" class="editor-btn" data-gal-square="${project.id}" title="Match width">W→H</button>
          </div>
          ${
            photos.length
              ? `<div class="photo-zoom-control-wrap" hidden data-gal-zoom="${project.id}">
                  ${photoAdjustControls(activeCrop, {
                    zoomAttrs: `data-gal-zoom-range="${project.id}" data-gal-zoom-index="${activeIndex}"`,
                    resetAttrs: `data-gal-crop-reset="${project.id}" data-index="${activeIndex}"`,
                    fitAttrs: `data-gal-fit="${project.id}" data-index="${activeIndex}"`,
                    sizeAttrs: `data-gal-size-panel="${project.id}" data-index="${activeIndex}"`
                  })}
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderCsImage(projectId, pageId, block, stageIndex) {
    const isStage = stageIndex != null;
    const stageAttr = isStage ? ` data-cs-stage="${stageIndex}"` : "";

    if (isStage) {
      const photo = block.stages[stageIndex].photo;
      const crop = normalizeCrop(block.stages[stageIndex].crop);
      return `
      <div class="cs-image-frame ${photo ? "has-photo" : "is-empty"}" data-cs-image="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}"${stageAttr}>
        <div class="photo-crop" data-photo-crop="cs" data-project="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}"${stageAttr} style="${cropStyle(crop)}">
          ${
            photo
              ? `<img src="${photo}" alt="" draggable="false" />`
              : `<div class="cs-image-empty"><span>No image</span><small>Upload or paste (Ctrl+V)</small></div>`
          }
        </div>
        <div class="cs-image-actions" hidden>
          <label class="photo-pick">Upload<input type="file" accept="image/*" hidden data-cs-upload="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}"${stageAttr} /></label>
          <button type="button" class="editor-btn" data-cs-paste-target="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}"${stageAttr}>Paste ready</button>
          ${photo ? `<button type="button" class="editor-btn editor-btn-danger" data-cs-clear-img="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}"${stageAttr}>Remove</button>` : ""}
        </div>
      </div>
    `;
    }

    const photos = normalizePhotos(block.photos);
    const activeIndex = Math.min(Number(block.activePhoto) || 0, Math.max(0, photos.length - 1));
    const active = photos[activeIndex];
    const tiles = photos
      .map((photo, i) => {
        const crop = {
          ...normalizeCrop(photo),
          fit: photo.fit === "fill" ? "fill" : "cover",
          w: Math.max(100, Number(photo.w) || 100),
          h: Math.max(100, Number(photo.h) || 100)
        };
        return `
        <div class="cs-image-tile ${i === activeIndex ? "is-active" : ""}" data-cs-image="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${i}" data-cs-select-photo="${i}" role="button" tabindex="0" aria-label="Preview photo ${i + 1}">
          <div class="cs-image-frame has-photo">
            <div class="photo-crop" data-photo-crop="cs" data-project="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${i}" style="${cropStyle(crop)}">
              <img src="${photo.src}" alt="" draggable="false" />
            </div>
            <span class="gallery-view-hint">Click to view</span>
            <button type="button" class="gallery-remove" data-cs-clear-img="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${i}" hidden aria-label="Remove photo">×</button>
          </div>
        </div>`;
      })
      .join("");

    const addTile = `
      <label class="cs-image-tile cs-image-add-tile" hidden data-cs-add-tile="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}">
        <span class="cs-image-add-inner">
          <span class="cs-image-add-plus">+</span>
          <span>Add photo</span>
          <small>Click or multi-select</small>
        </span>
        <input type="file" accept="image/*" multiple hidden data-cs-upload="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" />
      </label>`;

    return `
      <div class="cs-image-gallery" data-cs-gallery="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}">
        <div class="cs-image-grid ${photos.length ? "has-photos" : "is-empty"}">
          ${tiles || `<div class="cs-image-tile cs-image-empty-tile"><div class="cs-image-empty"><span>No images yet</span><small>Use Add photo to upload one or more</small></div></div>`}
          ${addTile}
        </div>
        <div class="cs-image-toolbar">
          <div class="cs-image-nav">
            ${photos.length ? `<span class="gallery-count">${photos.length} photo${photos.length === 1 ? "" : "s"}</span>` : ""}
          </div>
          <div class="cs-image-actions" hidden>
            <label class="photo-pick">Add photos<input type="file" accept="image/*" multiple hidden data-cs-upload="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" /></label>
            <button type="button" class="editor-btn" data-cs-paste-target="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}">Paste ready</button>
            ${
              active
                ? `<button type="button" class="editor-btn" data-cs-preview="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}">Preview</button>
                   <button type="button" class="editor-btn editor-btn-danger" data-cs-clear-img="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}">Remove selected</button>`
                : ""
            }
          </div>
        </div>
        ${
          active
            ? `<div class="photo-zoom-control-wrap" hidden>
                ${photoAdjustControls(normalizeCrop(active), {
                  sizeAttrs: `data-cs-size-panel="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}"`,
                  fitAttrs: `data-cs-fit="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}"`,
                  zoomAttrs: `data-cs-zoom="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}"`,
                  resetAttrs: `data-cs-crop-reset="${projectId}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-photo-index="${activeIndex}"`
                })}
              </div>`
            : ""
        }
      </div>
    `;
  }

  function renderGantt(block) {
    const weeks = Math.max(4, Math.min(24, Number(block.weeks) || 8));
    const head = Array.from({ length: weeks }, (_, i) => `<th>W${i + 1}</th>`).join("");
    const rows = (block.tasks || [])
      .map((t, ti) => {
        const cells = Array.from({ length: weeks }, (_, i) => {
          const w = i + 1;
          const plan = w >= t.planStart && w <= t.planEnd;
          const actual = w >= t.actualStart && w <= t.actualEnd;
          return `<td class="cs-gantt-cell"><span class="${plan ? "is-plan" : ""} ${actual ? "is-actual" : ""}"></span></td>`;
        }).join("");
        return `
          <tr data-cs-gantt-row="${ti}">
            <td class="cs-gantt-task">${escapeHtml(t.task)}</td>
            <td class="cs-gantt-pic">${escapeHtml(t.pic)}</td>
            ${cells}
          </tr>`;
      })
      .join("");
    return `
      <div class="cs-gantt-wrap">
        <table class="cs-gantt">
          <thead><tr><th>Task</th><th>PIC</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderBom(block) {
    const rows = block.rows || [];
    let total = 0;
    const body = rows
      .map((r, i) => {
        const line = (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
        total += line;
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.part)}</td>
          <td>${escapeHtml(String(r.qty))}</td>
          <td>${escapeHtml(String(r.unitCost))}</td>
          <td>${line.toFixed(2)}</td>
        </tr>`;
      })
      .join("");
    return `
      <div class="cs-bom-wrap">
        <table class="cs-bom">
          <thead><tr><th>No</th><th>Part</th><th>Qty</th><th>Unit (RM)</th><th>Total</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td>RM ${total.toFixed(2)}</td></tr></tfoot>
        </table>
      </div>
    `;
  }

  function renderCaseBlock(project, page, block) {
    const pid = project.id;
    const pageId = page.id;
    const tools = `
      <div class="cs-block-tools" hidden>
        <button type="button" class="editor-btn" data-cs-move="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-dir="-1">Up</button>
        <button type="button" class="editor-btn" data-cs-move="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-dir="1">Down</button>
        <button type="button" class="editor-btn editor-btn-danger" data-cs-del-block="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">Delete block</button>
      </div>
    `;
    const title = `<h4 class="cs-block-title editable" data-cs-field="title" data-cs-project="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">${escapeHtml(block.title)}</h4>`;

    if (block.type === "text") {
      return `<article class="cs-block cs-block-text" data-cs-block-el="${block.id}">
        ${tools}${title}
        <p class="editable" data-cs-field="body" data-cs-project="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-multiline="1">${nlToBr(block.body)}</p>
      </article>`;
    }
    if (block.type === "bullets") {
      const items = (block.items || [])
        .map(
          (item, i) => `
          <li>
            <span class="editable" data-cs-field="item" data-cs-index="${i}" data-cs-project="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">${escapeHtml(item)}</span>
            <button type="button" class="editor-btn editor-btn-danger cs-mini" hidden data-cs-del-item="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}">×</button>
          </li>`
        )
        .join("");
      return `<article class="cs-block cs-block-bullets" data-cs-block-el="${block.id}">
        ${tools}${title}
        <ul>${items}</ul>
        <button type="button" class="editor-btn cs-add-item" hidden data-cs-add-item="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">Add item</button>
      </article>`;
    }
    if (block.type === "image") {
      return `<article class="cs-block cs-block-image" data-cs-block-el="${block.id}">
        ${tools}${title}
        ${renderCsImage(pid, pageId, block)}
        <p class="cs-caption editable" data-cs-field="caption" data-cs-project="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">${escapeHtml(block.caption || "")}</p>
      </article>`;
    }
    if (block.type === "bom") {
      const editRows = (block.rows || [])
        .map(
          (r, i) => `
          <tr>
            <td><input data-cs-bom="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="part" value="${escapeHtml(r.part)}" /></td>
            <td><input type="number" data-cs-bom="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="qty" value="${r.qty}" /></td>
            <td><input type="number" step="0.01" data-cs-bom="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="unitCost" value="${r.unitCost}" /></td>
            <td><button type="button" class="editor-btn editor-btn-danger cs-mini" data-cs-del-bom="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}">×</button></td>
          </tr>`
        )
        .join("");
      return `<article class="cs-block cs-block-bom" data-cs-block-el="${block.id}">
        ${tools}${title}
        ${renderBom(block)}
        <div class="cs-bom-edit" hidden>
          <table class="cs-bom-edit-table">
            <thead><tr><th>Part</th><th>Qty</th><th>Unit RM</th><th></th></tr></thead>
            <tbody>${editRows}</tbody>
          </table>
          <button type="button" class="editor-btn" data-cs-add-bom="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">Add row</button>
        </div>
      </article>`;
    }
    if (block.type === "gantt") {
      const editTasks = (block.tasks || [])
        .map(
          (t, i) => `
          <tr>
            <td><input data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="task" value="${escapeHtml(t.task)}" /></td>
            <td><input data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="pic" value="${escapeHtml(t.pic)}" /></td>
            <td><input type="number" min="1" data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="planStart" value="${t.planStart}" /></td>
            <td><input type="number" min="1" data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="planEnd" value="${t.planEnd}" /></td>
            <td><input type="number" min="1" data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="actualStart" value="${t.actualStart}" /></td>
            <td><input type="number" min="1" data-cs-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}" data-cs-key="actualEnd" value="${t.actualEnd}" /></td>
            <td><button type="button" class="editor-btn editor-btn-danger cs-mini" data-cs-del-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" data-cs-index="${i}">×</button></td>
          </tr>`
        )
        .join("");
      return `<article class="cs-block cs-block-gantt" data-cs-block-el="${block.id}">
        ${tools}${title}
        ${renderGantt(block)}
        <div class="cs-gantt-edit" hidden>
          <label>Weeks <input type="number" min="4" max="24" value="${block.weeks}" data-cs-gantt-weeks="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}" /></label>
          <table class="cs-gantt-edit-table">
            <thead><tr><th>Task</th><th>PIC</th><th>Plan S</th><th>Plan E</th><th>Act S</th><th>Act E</th><th></th></tr></thead>
            <tbody>${editTasks}</tbody>
          </table>
          <button type="button" class="editor-btn" data-cs-add-gantt="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">Add task</button>
        </div>
      </article>`;
    }
    if (block.type === "evolution") {
      const stages = (block.stages || [])
        .map(
          (s, i) => `
          <div class="cs-evo-stage">
            <p class="editable" data-cs-field="stageLabel" data-cs-index="${i}" data-cs-project="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">${escapeHtml(s.label)}</p>
            ${renderCsImage(pid, pageId, block, i)}
          </div>
          ${i < block.stages.length - 1 ? `<div class="cs-evo-arrow" aria-hidden="true">›››</div>` : ""}`
        )
        .join("");
      return `<article class="cs-block cs-block-evolution" data-cs-block-el="${block.id}">
        ${tools}${title}
        <div class="cs-evo-row">${stages}</div>
        <button type="button" class="editor-btn" hidden data-cs-add-stage="${pid}" data-cs-page="${pageId}" data-cs-block="${block.id}">Add stage</button>
      </article>`;
    }
    return "";
  }

  function renderCaseStudy(project) {
    const cs = normalizeCaseStudy(project.caseStudy);
    project.caseStudy = cs;
    const active = cs.pages.find((p) => p.id === cs.activePageId) || cs.pages[0];
    const tabs = cs.pages
      .map(
        (p) => `
        <button type="button" class="cs-page-tab ${p.id === active.id ? "is-active" : ""}" data-cs-page-tab="${project.id}" data-cs-page="${p.id}">
          <span class="editable" data-cs-field="pageTitle" data-cs-project="${project.id}" data-cs-page="${p.id}">${escapeHtml(p.title)}</span>
        </button>`
      )
      .join("");
    const blocks = (active.blocks || []).map((b) => renderCaseBlock(project, active, b)).join("");
    return `
      <div class="cs-board is-open" data-cs-board="${project.id}">
        <div class="cs-modal-header">
          <div class="cs-modal-heading">
            <h2 class="cs-modal-title">${escapeHtml(project.title)}</h2>
            <p class="cs-modal-tag">${escapeHtml(project.tag || "")}</p>
          </div>
          <button type="button" class="btn cs-modal-close" data-cs-close="${project.id}" aria-label="Close details">Close</button>
        </div>
        <div class="cs-board-bar">
          <div class="cs-page-tabs">${tabs}</div>
          <div class="cs-board-actions" hidden>
            <button type="button" class="editor-btn" data-cs-add-page="${project.id}">Add page</button>
            <button type="button" class="editor-btn editor-btn-danger" data-cs-del-page="${project.id}" data-cs-page="${active.id}">Delete page</button>
            <div class="cs-add-block-menu">
              <span>Add block</span>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="text">Text</button>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="bullets">Bullets</button>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="image">Image</button>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="bom">BOM</button>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="gantt">Gantt</button>
              <button type="button" class="editor-btn" data-cs-add-block="${project.id}" data-type="evolution">Evolution</button>
            </div>
          </div>
        </div>
        <div class="cs-blocks">${blocks || `<p class="cs-empty">No blocks yet — add one in Customize.</p>`}</div>
        <p class="cs-paste-hint" hidden>Tip: select an Image block, then Add photos (multi-select) or Ctrl+V to paste.</p>
      </div>
    `;
  }

  function closeAllCaseStudies() {
    state.projects.items.forEach((p) => {
      if (p.caseStudy) p.caseStudy.open = false;
    });
  }

  let csModalAnimToken = 0;

  function finishCloseCaseStudyModal(modal, panel) {
    modal.hidden = true;
    modal.classList.remove("is-visible", "is-closing");
    panel.innerHTML = "";
    document.body.classList.remove("cs-modal-open");
  }

  function syncCaseStudyModal() {
    const modal = document.getElementById("cs-modal");
    const panel = document.getElementById("cs-modal-panel");
    if (!modal || !panel) return;
    const openProject = state.projects.items.find((p) => p.featured && p.caseStudy && p.caseStudy.open);
    if (openProject) {
      csModalAnimToken += 1;
      openProject.caseStudy = normalizeCaseStudy(openProject.caseStudy);
      openProject.caseStudy.open = true;
      panel.innerHTML = renderCaseStudy(openProject);
      modal.classList.remove("is-closing");
      modal.hidden = false;
      document.body.classList.add("cs-modal-open");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          modal.classList.add("is-visible");
        });
      });
    } else if (!modal.hidden && modal.classList.contains("is-visible")) {
      const token = ++csModalAnimToken;
      modal.classList.remove("is-visible");
      modal.classList.add("is-closing");
      const done = () => {
        if (token !== csModalAnimToken) return;
        finishCloseCaseStudyModal(modal, panel);
      };
      const onEnd = (event) => {
        if (event.target !== modal && event.target !== panel) return;
        modal.removeEventListener("transitionend", onEnd);
        done();
      };
      modal.addEventListener("transitionend", onEnd);
      setTimeout(done, 480);
    } else {
      csModalAnimToken += 1;
      finishCloseCaseStudyModal(modal, panel);
    }
  }

  function renderProject(project, featured) {
    const showCaseStudy = !!featured;
    const body = `
      <div class="project-body-wrap">
        ${editable(`projects.items.${project.id}.tag`, "p", "project-tag", project.tag)}
        ${editable(`projects.items.${project.id}.title`, "h3", "", project.title)}
        ${editable(`projects.items.${project.id}.body`, "p", "", project.body, true)}
        ${
          showCaseStudy
            ? `<div class="project-case-actions">
          <button type="button" class="btn cs-toggle" data-cs-toggle="${project.id}">View details</button>
        </div>`
            : ""
        }
        <div class="project-edit-tools" hidden>
          <label class="chip-toggle">
            <input type="checkbox" data-featured="${project.id}" ${project.featured ? "checked" : ""} />
            Featured layout
          </label>
          <button type="button" class="editor-btn editor-btn-danger" data-delete-project="${project.id}">Delete project</button>
        </div>
      </div>
    `;

    if (featured) {
      return `
        <div class="project-feature" data-project-id="${project.id}" data-animate="fade-up">
          ${movable(
            `proj-index-${project.id}`,
            "project-index-wrap",
            editable(`projects.items.${project.id}.index`, "div", "project-index", project.index)
          )}
          <div class="project-main">
            ${movable(`proj-gal-${project.id}`, "", renderGallery(project))}
            ${movable(`proj-body-${project.id}`, "", body)}
          </div>
        </div>
      `;
    }

    return `
      <article class="project-card" data-project-id="${project.id}" data-animate="fade-up">
        ${movable(`proj-gal-${project.id}`, "", renderGallery(project))}
        ${movable(`proj-body-${project.id}`, "project-card-body", body)}
      </article>
    `;
  }

  function render() {
    const d = state;
    const featured = d.projects.items.filter((p) => p.featured);
    const cards = d.projects.items.filter((p) => !p.featured);

    if (logoEl) logoEl.textContent = d.logo;
    if (footerNameEl) footerNameEl.textContent = d.footerName;
    applyStaticTextSizes();

    app.innerHTML = `
      <section class="hero">
        <div class="hero-atmosphere" aria-hidden="true">
          <div class="hero-bg-photo"></div>
          <div class="hero-grid"></div>
          <div class="hero-beam"></div>
          <div class="hero-silhouette"></div>
        </div>
        <div class="hero-stage ${d.hero.showPhotoBox === false ? "no-photo-box" : ""}">
          ${movable(
            "hero-content",
            "hero-content",
            `
            ${editable("hero.brand", "p", "brand", d.hero.brand)}
            ${editable("hero.title", "h1", "", d.hero.title)}
            ${editable("hero.lead", "p", "hero-lead", d.hero.lead, true)}
            <div class="hero-actions">
              <a class="btn btn-primary" href="#projects">${escapeHtml(d.hero.ctaPrimary)}</a>
              <a class="btn btn-ghost" href="#contact">${escapeHtml(d.hero.ctaSecondary)}</a>
            </div>
            <div class="cta-edit-row" hidden>
              ${editable("hero.ctaPrimary", "span", "inline-edit", d.hero.ctaPrimary)}
              ${editable("hero.ctaSecondary", "span", "inline-edit", d.hero.ctaSecondary)}
            </div>
            <div class="hero-box-toggle-wrap" hidden>
              <button type="button" class="editor-btn" id="hero-photo-box-show">Show photo box</button>
            </div>
          `
          )}
          ${
            d.hero.showPhotoBox === false
              ? ""
              : movable(
                  "hero-photo",
                  `hero-photo-frame ${d.hero.photo ? "has-photo" : "is-empty"}`,
                  `
            ${
              d.hero.photo
                ? `<div class="photo-crop" data-photo-crop="hero" style="${cropStyle(d.hero.photoCrop)}">
                    <img src="${d.hero.photo}" alt="Hero" class="hero-photo-img" draggable="false" />
                  </div>
                  <span class="hero-crop-hint" hidden>Drag · wheel zoom · Fit/Fill below</span>`
                : `<div class="hero-photo-placeholder"><span>Hero photo</span><small>Upload a picture here</small></div>`
            }
            <div class="hero-photo-actions" hidden>
              <label class="photo-pick">
                ${d.hero.photo ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/*" hidden id="hero-photo-input" />
              </label>
              ${
                d.hero.photo
                  ? `<button type="button" class="editor-btn editor-btn-danger" id="hero-photo-remove">Remove photo</button>`
                  : ""
              }
              <button type="button" class="editor-btn editor-btn-danger" id="hero-photo-box-hide">Delete box</button>
              <div class="hero-photo-size">
                <label>W <input type="number" id="hero-photo-w" min="120" max="900" step="10" value="${Number(d.hero.photoWidth) || 420}" /></label>
                <label>H <input type="number" id="hero-photo-h" min="120" max="900" step="10" value="${Number(d.hero.photoHeight) || 420}" /></label>
                <button type="button" class="editor-btn" id="hero-photo-lock" title="Keep square">1:1</button>
              </div>
              ${
                d.hero.photo
                  ? photoAdjustControls(d.hero.photoCrop, {
                      prefix: "hero-photo",
                      resetId: "hero-crop-reset",
                      fitAttrs: 'data-hero-fit="1"',
                      sizeAttrs: 'data-hero-size="1"'
                    })
                  : ""
              }
            </div>
            <button type="button" class="hero-photo-resize" id="hero-photo-resize" hidden aria-label="Resize photo" title="Drag to resize"></button>
          `,
                  `width:${Number(d.hero.photoWidth) || 420}px;height:${Number(d.hero.photoHeight) || 420}px;`
                )
          }
        </div>
        <div class="hero-line-wrap" style="--line-y:${Number(d.hero.lineY) || 0}px">
          <div class="hero-line" aria-hidden="true"></div>
          <button type="button" class="hero-line-handle" id="hero-line-handle" hidden title="Drag to move line" aria-label="Move divider line">Line</button>
          ${movable(
            "hero-meta",
            "hero-meta",
            d.hero.meta
              .map((m, i) => `${i ? '<span aria-hidden="true">·</span>' : ""}${editable(`hero.meta.${i}`, "span", "", m)}`)
              .join("")
          )}
        </div>
      </section>

      <section class="section about" id="about">
        ${movable("about-label", "", editable("about.label", "div", "section-label", d.about.label))}
        <div class="about-grid">
          ${movable("about-heading", "", editable("about.heading", "h2", "", d.about.heading, true))}
          ${movable(
            "about-copy",
            "about-copy",
            d.about.paragraphs
              .map((p, i) => editable(`about.paragraphs.${i}`, "p", "", p, true))
              .join("")
          )}
        </div>
        ${movable(
          "about-stats",
          "",
          `<ul class="stat-row">
            ${d.about.stats
              .map(
                (s, i) => `
              <li>
                ${editable(`about.stats.${i}.value`, "strong", "", s.value)}
                ${editable(`about.stats.${i}.label`, "span", "", s.label)}
              </li>`
              )
              .join("")}
          </ul>`
        )}
      </section>

      <section class="section expertise" id="expertise">
        ${movable("exp-label", "", editable("expertise.label", "div", "section-label", d.expertise.label))}
        ${movable("exp-heading", "", editable("expertise.heading", "h2", "", d.expertise.heading))}
        <div class="expertise-layout">
          ${d.expertise.columns
            .map(
              (col, ci) => `
            ${movable(
              `exp-col-${ci}`,
              "expertise-block",
              `
              ${editable(`expertise.columns.${ci}.title`, "h3", "", col.title)}
              <ul>
                ${col.items
                  .map((item, ii) => `<li>${editable(`expertise.columns.${ci}.items.${ii}`, "span", "", item)}</li>`)
                  .join("")}
              </ul>
            `
            )}`
            )
            .join("")}
        </div>
        ${movable(
          "exp-tools",
          "tools-strip",
          `
          ${editable("expertise.toolsLabel", "span", "tools-label", d.expertise.toolsLabel)}
          <div class="tools-list">
            ${d.expertise.tools.map((t, i) => editable(`expertise.tools.${i}`, "span", "", t)).join("")}
          </div>
        `
        )}
      </section>

      <section class="section projects" id="projects">
        ${movable("proj-label", "", editable("projects.label", "div", "section-label", d.projects.label))}
        ${movable("proj-heading", "", editable("projects.heading", "h2", "", d.projects.heading))}
        <div class="projects-featured">
          ${featured.map((p) => renderProject(p, true)).join("")}
        </div>
        <div class="project-grid">
          ${cards.map((p) => renderProject(p, false)).join("")}
        </div>
      </section>

      <section class="section experience" id="experience">
        ${movable("experience-label", "", editable("experience.label", "div", "section-label", d.experience.label))}
        ${movable(
          "experience-header",
          "exp-header",
          `
          ${editable("experience.company", "h2", "", d.experience.company)}
          ${editable("experience.role", "p", "exp-role", d.experience.role)}
          ${editable("experience.dates", "p", "exp-dates", d.experience.dates)}
        `
        )}
        ${movable(
          "experience-bullets",
          "",
          `<ul class="exp-list">
            ${d.experience.bullets
              .map((b, i) => `<li>${editable(`experience.bullets.${i}`, "span", "", b, true)}</li>`)
              .join("")}
          </ul>`
        )}
        ${movable(
          "experience-achievements",
          "achieve-block",
          `
          ${editable("experience.achievementsTitle", "h3", "", d.experience.achievementsTitle)}
          <ul>
            ${d.experience.achievements
              .map((a, i) => `<li>${editable(`experience.achievements.${i}`, "span", "", a)}</li>`)
              .join("")}
          </ul>
        `
        )}
      </section>

      <section class="section credentials" id="credentials">
        <div class="credentials-grid">
          ${movable(
            "cred-training",
            "",
            `
            ${editable("credentials.trainingLabel", "div", "section-label", d.credentials.trainingLabel)}
            ${editable("credentials.trainingHeading", "h2", "", d.credentials.trainingHeading)}
            <ul class="cred-list">
              ${d.credentials.training
                .map((t, i) => `<li>${editable(`credentials.training.${i}`, "span", "", t)}</li>`)
                .join("")}
            </ul>
          `
          )}
          ${movable(
            "cred-education",
            "",
            `
            ${editable("credentials.educationLabel", "div", "section-label", d.credentials.educationLabel)}
            ${editable("credentials.educationHeading", "h2", "", d.credentials.educationHeading)}
            <ul class="cred-list">
              ${d.credentials.education
                .map(
                  (e, i) => `
                <li>
                  ${editable(`credentials.education.${i}.title`, "strong", "", e.title)}
                  ${editable(`credentials.education.${i}.detail`, "span", "", e.detail)}
                </li>`
                )
                .join("")}
            </ul>
          `
          )}
        </div>
      </section>

      <section class="section contact" id="contact">
        ${movable(
          "contact-panel",
          "contact-panel",
          `
          ${editable("contact.brand", "p", "brand-contact", d.contact.brand)}
          ${editable("contact.heading", "h2", "", d.contact.heading)}
          ${editable("contact.lead", "p", "contact-lead", d.contact.lead, true)}
          <div class="contact-links">
            <a href="mailto:${escapeHtml(d.contact.email)}">${escapeHtml(d.contact.email)}</a>
            <a href="tel:${escapeHtml(d.contact.phone.replace(/\s/g, ""))}">${escapeHtml(d.contact.phone)}</a>
            <a href="${escapeHtml(d.contact.linkedin)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.contact.linkedinLabel)}</a>
          </div>
          <div class="contact-edit-fields" hidden>
            ${editable("contact.email", "p", "inline-edit", d.contact.email)}
            ${editable("contact.phone", "p", "inline-edit", d.contact.phone)}
            ${editable("contact.linkedin", "p", "inline-edit", d.contact.linkedin)}
            ${editable("contact.linkedinLabel", "p", "inline-edit", d.contact.linkedinLabel)}
          </div>
          ${editable("contact.address", "p", "contact-address", d.contact.address, true)}
        `
        )}
      </section>
    `;

    syncCaseStudyModal();
    applyTypography();
    syncTypographyControls();
    applyEditMode();
    bindInteractions();
    setupScrollAnimations();
    restoreTextSelection();
  }

  function applyStaticTextSizes() {
    if (logoEl) {
      logoEl.dataset.path = "logo";
      applyTextChrome(logoEl, "logo");
    }
    if (footerNameEl) {
      footerNameEl.dataset.path = "footerName";
      applyTextChrome(footerNameEl, "footerName");
    }
  }

  function applyTextChrome(el, path) {
    if (!el || !path) return;
    const size = state.textSizes && state.textSizes[path];
    const box = (state.textBoxes && state.textBoxes[path]) || {};
    if (size) el.style.fontSize = `${Number(size)}px`;
    else el.style.removeProperty("font-size");
    if (box.width) {
      el.style.width = `${Number(box.width)}px`;
      el.style.maxWidth = `${Number(box.width)}px`;
      el.classList.add("has-box-size");
    } else {
      el.style.removeProperty("width");
      el.style.removeProperty("max-width");
    }
    if (box.height) {
      el.style.minHeight = `${Number(box.height)}px`;
      el.classList.add("has-box-size");
    } else {
      el.style.removeProperty("min-height");
    }
    if (!box.width && !box.height) el.classList.remove("has-box-size");
  }

  function getTextPath(el) {
    if (!el) return null;
    return el.dataset.path || el.getAttribute("data-edit") || null;
  }

  function findEditableByPath(path) {
    if (!path) return null;
    if (path === "logo") return logoEl;
    if (path === "footerName") return footerNameEl;
    const safe = String(path).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return document.querySelector(`.editable[data-path="${safe}"]`);
  }

  function currentPxForEl(el) {
    if (!el) return 16;
    const path = getTextPath(el);
    if (path && state.textSizes && state.textSizes[path]) {
      return Number(state.textSizes[path]);
    }
    const computed = parseFloat(window.getComputedStyle(el).fontSize);
    return Math.round(computed) || 16;
  }

  function currentBoxForEl(el) {
    const path = getTextPath(el);
    const saved = path && state.textBoxes ? state.textBoxes[path] : null;
    if (saved && (saved.width || saved.height)) {
      return {
        width: saved.width ? Number(saved.width) : "",
        height: saved.height ? Number(saved.height) : ""
      };
    }
    if (!el) return { width: "", height: "" };
    const rect = el.getBoundingClientRect();
    return {
      width: Math.round(rect.width) || "",
      height: ""
    };
  }

  function setTextSizeForSelection(px, reset = false) {
    if (!selectedTextPath || !selectedTextEl) return;
    if (!state.textSizes) state.textSizes = {};
    if (reset) {
      delete state.textSizes[selectedTextPath];
      selectedTextEl.style.removeProperty("font-size");
    } else {
      const size = Math.max(10, Math.min(180, Math.round(Number(px) || 16)));
      state.textSizes[selectedTextPath] = size;
      selectedTextEl.style.fontSize = `${size}px`;
      const input = document.getElementById("typo-selected-px");
      if (input) input.value = String(size);
    }
    queueDirty();
    syncSelectedSizePanel();
  }

  function setTextBoxForSelection(patch, reset = false, opts = {}) {
    if (!selectedTextPath || !selectedTextEl) return;
    if (!state.textBoxes) state.textBoxes = {};
    if (reset) {
      delete state.textBoxes[selectedTextPath];
      selectedTextEl.style.removeProperty("width");
      selectedTextEl.style.removeProperty("max-width");
      selectedTextEl.style.removeProperty("min-height");
      selectedTextEl.classList.remove("has-box-size");
      queueDirty();
      syncSelectedSizePanel();
      if (!opts.skipHandles) ensureTextBoxHandles(selectedTextEl);
      return;
    }
    const prev = state.textBoxes[selectedTextPath] || {};
    const next = { ...prev, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, "width")) {
      if (patch.width != null && patch.width !== "") {
        next.width = Math.max(60, Math.min(1200, Math.round(Number(patch.width) || 60)));
      } else {
        delete next.width;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "height")) {
      if (patch.height != null && patch.height !== "" && Number(patch.height) > 0) {
        next.height = Math.max(24, Math.min(900, Math.round(Number(patch.height) || 24)));
      } else {
        delete next.height;
      }
    }
    if (!next.width && !next.height) {
      delete state.textBoxes[selectedTextPath];
    } else {
      state.textBoxes[selectedTextPath] = next;
    }
    applyTextChrome(selectedTextEl, selectedTextPath);
    queueDirty();
    if (!opts.silentPanel) syncSelectedSizePanel();
    if (!opts.skipHandles) ensureTextBoxHandles(selectedTextEl);
  }

  function clearTextSelection() {
    document.querySelectorAll(".text-box-resize").forEach((node) => node.remove());
    document.querySelectorAll(".editable.is-size-selected").forEach((el) => {
      el.classList.remove("is-size-selected");
    });
    selectedTextPath = null;
    selectedTextEl = null;
    syncSelectedSizePanel();
  }

  function ensureTextBoxHandles(el) {
    document.querySelectorAll(".text-box-resize").forEach((node) => node.remove());
    if (!editing || !el) return;
    el.style.position = el.style.position || "relative";
    const east = document.createElement("button");
    east.type = "button";
    east.className = "text-box-resize text-box-resize-e";
    east.title = "Drag to change width";
    east.setAttribute("aria-label", "Resize text width");
    east.contentEditable = "false";
    el.appendChild(east);
    east.addEventListener("pointerdown", (e) => startTextBoxResize(e, "width"));

    if (el.dataset.multiline === "1" || el.tagName === "P" || el.tagName === "H2" || el.tagName === "DIV") {
      const south = document.createElement("button");
      south.type = "button";
      south.className = "text-box-resize text-box-resize-s";
      south.title = "Drag to change height";
      south.setAttribute("aria-label", "Resize text height");
      south.contentEditable = "false";
      el.appendChild(south);
      south.addEventListener("pointerdown", (e) => startTextBoxResize(e, "height"));
    }
  }

  let textBoxResize = null;

  function startTextBoxResize(e, mode) {
    if (!editing || !selectedTextEl || !selectedTextPath) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = selectedTextEl.getBoundingClientRect();
    const box = (state.textBoxes && state.textBoxes[selectedTextPath]) || {};
    textBoxResize = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origW: Number(box.width) || Math.round(rect.width),
      origH: Number(box.height) || Math.round(rect.height)
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.addEventListener("pointermove", onTextBoxResizeMove);
    e.currentTarget.addEventListener("pointerup", onTextBoxResizeEnd);
    e.currentTarget.addEventListener("pointercancel", onTextBoxResizeEnd);
  }

  function onTextBoxResizeMove(e) {
    if (!textBoxResize) return;
    if (textBoxResize.mode === "width") {
      const width = textBoxResize.origW + (e.clientX - textBoxResize.startX);
      setTextBoxForSelection({ width }, false, { skipHandles: true, silentPanel: true });
      const boxW = document.getElementById("typo-selected-box-w");
      if (boxW) boxW.value = String(Math.max(60, Math.min(1200, Math.round(width))));
    } else {
      const height = textBoxResize.origH + (e.clientY - textBoxResize.startY);
      setTextBoxForSelection({ height }, false, { skipHandles: true, silentPanel: true });
      const boxH = document.getElementById("typo-selected-box-h");
      if (boxH) boxH.value = String(Math.max(24, Math.min(900, Math.round(height))));
    }
  }

  function onTextBoxResizeEnd(e) {
    if (!textBoxResize) return;
    e.currentTarget.removeEventListener("pointermove", onTextBoxResizeMove);
    e.currentTarget.removeEventListener("pointerup", onTextBoxResizeEnd);
    e.currentTarget.removeEventListener("pointercancel", onTextBoxResizeEnd);
    textBoxResize = null;
    syncSelectedSizePanel();
  }

  function selectTextForSizing(el) {
    if (!editing || !el) return;
    const path = getTextPath(el);
    if (!path) return;
    document.querySelectorAll(".editable.is-size-selected").forEach((node) => {
      node.classList.remove("is-size-selected");
    });
    selectedTextPath = path;
    selectedTextEl = el;
    el.classList.add("is-size-selected");
    ensureTextBoxHandles(el);
    syncSelectedSizePanel();
  }

  function syncSelectedSizePanel() {
    const panel = document.getElementById("selected-size-panel");
    const input = document.getElementById("typo-selected-px");
    const boxW = document.getElementById("typo-selected-box-w");
    const boxH = document.getElementById("typo-selected-box-h");
    if (!panel) return;
    const show = editing && !!selectedTextPath && !!selectedTextEl;
    panel.hidden = !show;
    if (!show) return;
    if (input) input.value = String(currentPxForEl(selectedTextEl));
    const box = currentBoxForEl(selectedTextEl);
    const saved = (state.textBoxes && state.textBoxes[selectedTextPath]) || {};
    if (boxW) boxW.value = saved.width ? String(saved.width) : box.width ? String(box.width) : "";
    if (boxH) boxH.value = saved.height ? String(saved.height) : "";
  }

  function restoreTextSelection() {
    if (!editing || !selectedTextPath) {
      syncSelectedSizePanel();
      return;
    }
    const el = findEditableByPath(selectedTextPath);
    if (el) selectTextForSizing(el);
    else clearTextSelection();
  }

  function fontFamilyCss(name) {
    return `"${name}", sans-serif`;
  }

  function loadGoogleFonts(displayFont, bodyFont) {
    const families = [...new Set([displayFont, bodyFont])];
    const query = families
      .map((name) => {
        const isDisplay = name === displayFont && name !== bodyFont;
        const weights = isDisplay || /Display|Black|Bebas|Oswald|Syne|Playfair/i.test(name)
          ? "wght@500;600;700;800"
          : "wght@300;400;500;600";
        return `family=${encodeURIComponent(name).replace(/%20/g, "+")}:${weights}`;
      })
      .join("&");
    let link = document.getElementById("dynamic-fonts");
    if (!link) {
      link = document.createElement("link");
      link.id = "dynamic-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  }

  function applyTypography() {
    const t = state.typography || window.PORTFOLIO_DEFAULTS.typography;
    const root = document.documentElement;
    root.style.setProperty("--font-display", fontFamilyCss(t.displayFont));
    root.style.setProperty("--font-body", fontFamilyCss(t.bodyFont));
    root.style.setProperty("--scale-brand", String((Number(t.brandScale) || 100) / 100));
    root.style.setProperty("--scale-heading", String((Number(t.headingScale) || 100) / 100));
    root.style.setProperty("--scale-body", String((Number(t.bodyScale) || 100) / 100));
    loadGoogleFonts(t.displayFont, t.bodyFont);
  }

  function syncTypographyControls() {
    const t = state.typography || window.PORTFOLIO_DEFAULTS.typography;
    const display = document.getElementById("typo-display");
    const body = document.getElementById("typo-body");
    const brand = document.getElementById("typo-brand");
    const heading = document.getElementById("typo-heading");
    const bodyScale = document.getElementById("typo-body-scale");
    if (display) display.value = t.displayFont;
    if (body) body.value = t.bodyFont;
    if (brand) brand.value = t.brandScale;
    if (heading) heading.value = t.headingScale;
    if (bodyScale) bodyScale.value = t.bodyScale;
  }

  function readTypographyFromControls() {
    if (!state.typography) state.typography = clone(window.PORTFOLIO_DEFAULTS.typography);
    const display = document.getElementById("typo-display");
    const body = document.getElementById("typo-body");
    const brand = document.getElementById("typo-brand");
    const heading = document.getElementById("typo-heading");
    const bodyScale = document.getElementById("typo-body-scale");
    if (display) state.typography.displayFont = display.value;
    if (body) state.typography.bodyFont = body.value;
    if (brand) state.typography.brandScale = Number(brand.value) || 100;
    if (heading) state.typography.headingScale = Number(heading.value) || 100;
    if (bodyScale) state.typography.bodyScale = Number(bodyScale.value) || 100;
  }

  function onTypographyChange() {
    readTypographyFromControls();
    applyTypography();
    queueDirty();
  }

  function setupScrollAnimations() {
    if (window.__scrollAnimObserver) {
      window.__scrollAnimObserver.disconnect();
      window.__scrollAnimObserver = null;
    }

    const markAll = () => {
      app.querySelectorAll(".scroll-section, .scroll-item, .project-feature, .project-card, .section").forEach((el) => {
        el.classList.add("in-view", "seen");
        el.classList.remove("will-animate", "ready-replay", "is-animating");
        el.style.removeProperty("--enter-y");
        el.style.removeProperty("--stagger");
      });
    };

    if (editing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      app.querySelectorAll(".section").forEach((section) => section.classList.add("scroll-section"));
      markAll();
      return;
    }

    const targets = [];

    // Animate leaf content only — not parent sections — to avoid nested transform glitches
    app.querySelectorAll(".section").forEach((section) => {
      section.classList.add("scroll-section");
      section.querySelectorAll(
        ".section-label, h2, .about-copy, .expertise-block, .stat-row li, .exp-header, .exp-list li, .achieve-block, .cred-list li, .contact-panel > *"
      ).forEach((child, idx) => {
        child.classList.add("scroll-item", "will-animate");
        child.style.setProperty("--stagger", String(Math.min(idx, 5)));
        targets.push(child);
      });
    });

    app.querySelectorAll(".project-feature, .project-card").forEach((el, idx) => {
      el.classList.add("scroll-item", "will-animate");
      el.style.setProperty("--stagger", String(idx % 4));
      targets.push(el);
    });

    const replayTimers = new WeakMap();

    const prepareReplay = (el, enterFrom) => {
      el.classList.remove("in-view", "is-animating");
      el.classList.add("ready-replay", "will-animate");
      el.dataset.enterFrom = enterFrom;
    };

    const playEnter = (el) => {
      // Keep hidden (ready-replay) until the next frame so restart doesn't flash at full opacity
      el.classList.remove("in-view", "is-animating");
      el.classList.add("ready-replay", "will-animate");
      void el.offsetWidth;
      requestAnimationFrame(() => {
        el.classList.remove("ready-replay");
        el.classList.add("in-view", "seen", "is-animating", "will-animate");
        const onEnd = (e) => {
          if (e.target !== el) return;
          el.classList.remove("is-animating");
          el.removeEventListener("animationend", onEnd);
        };
        el.addEventListener("animationend", onEnd);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          if (entry.isIntersecting) {
            const pending = replayTimers.get(el);
            if (pending) {
              clearTimeout(pending);
              replayTimers.delete(el);
            }
            // Only restart if it was fully reset, or first reveal
            if (el.classList.contains("ready-replay") || !el.classList.contains("seen")) {
              playEnter(el);
            } else if (!el.classList.contains("in-view")) {
              playEnter(el);
            }
            return;
          }

          const rect = entry.boundingClientRect;
          const fullyAbove = rect.bottom <= 0;
          const fullyBelow = rect.top >= window.innerHeight;
          if (!fullyAbove && !fullyBelow) return;

          // Debounce reset so fast scroll past doesn't thrash mid-animation
          const existing = replayTimers.get(el);
          if (existing) clearTimeout(existing);
          const enterFrom = fullyAbove ? "top" : "bottom";
          replayTimers.set(
            el,
            setTimeout(() => {
              replayTimers.delete(el);
              // Still fully off-screen?
              const r = el.getBoundingClientRect();
              const stillAbove = r.bottom <= 0;
              const stillBelow = r.top >= window.innerHeight;
              if (stillAbove || stillBelow) {
                prepareReplay(el, stillAbove ? "top" : enterFrom);
              }
            }, 120)
          );
        });
      },
      { threshold: [0, 0.12, 0.25], rootMargin: "0px 0px -8% 0px" }
    );

    window.__scrollAnimObserver = observer;
    targets.forEach((el) => observer.observe(el));
  }

  function setEditing(on) {
    if (!on) {
      syncEditableToState();
      fabVisible = false;
      clearTextSelection();
    }
    editing = on;
    applyEditMode();
    if (editing) {
      app.querySelectorAll(".scroll-section, .scroll-item, .project-feature, .project-card").forEach((el) => {
        el.classList.add("in-view");
      });
      syncSelectedSizePanel();
    }
  }

  function getByPath(path) {
    if (path.startsWith("projects.items.")) {
      const segs = path.split(".");
      const id = segs[2];
      const field = segs[3];
      const item = state.projects.items.find((p) => p.id === id);
      if (!item) return null;
      return field ? item[field] : item;
    }
    return path.split(".").reduce((acc, key) => {
      if (acc == null) return null;
      return acc[key];
    }, state);
  }

  function setByPath(path, value, silent = false) {
    if (path.startsWith("projects.items.")) {
      const segs = path.split(".");
      const id = segs[2];
      const field = segs[3];
      const item = state.projects.items.find((p) => p.id === id);
      if (!item || !field) return;
      if (item[field] === value) return;
      item[field] = value;
      if (!silent) queueDirty();
      return;
    }

    const parts = path.split(".");
    let cur = state;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (nextIsIndex) {
        if (!Array.isArray(cur[key])) cur[key] = [];
      } else if (typeof cur[key] !== "object" || cur[key] == null) {
        cur[key] = {};
      }
      cur = cur[key];
    }
    const last = parts[parts.length - 1];
    const prev = /^\d+$/.test(last) && Array.isArray(cur) ? cur[Number(last)] : cur[last];
    if (prev === value) return;
    if (/^\d+$/.test(last) && Array.isArray(cur)) cur[Number(last)] = value;
    else cur[last] = value;
    if (!silent) queueDirty();
  }

  function applyEditMode() {
    document.body.classList.toggle("is-editing", editing);
    editorBar.hidden = !editing;
    if (btnEdit) {
      const showFab = fabVisible && !editing;
      btnEdit.hidden = !showFab;
      btnEdit.classList.toggle("is-visible", showFab);
    }

    document.querySelectorAll(".drag-handle, .project-edit-tools, .cta-edit-row, .contact-edit-fields, .gallery-remove, .gallery-add, .hero-photo-actions, .hero-line-handle, .hero-photo-resize, .gallery-resize, .gallery-size, .hero-box-toggle-wrap, .photo-zoom-control, .photo-zoom-control-wrap, .photo-adjust-panel, .hero-crop-hint, .gallery-crop-hint, .cs-block-tools, .cs-board-actions, .cs-image-actions, .cs-image-add-tile, .cs-bom-edit, .cs-gantt-edit, .cs-add-item, .cs-paste-hint, [data-cs-add-stage], .cs-mini").forEach((el) => {
      el.hidden = !editing;
    });

    document.body.classList.toggle("is-cropping", editing);

    document.querySelectorAll(".editable").forEach((el) => {
      el.contentEditable = editing ? "true" : "false";
      el.spellcheck = true;
    });

    // logo / footer
    if (logoEl) {
      logoEl.contentEditable = editing ? "true" : "false";
      logoEl.classList.toggle("editable", editing);
    }
    if (footerNameEl) {
      footerNameEl.contentEditable = editing ? "true" : "false";
      footerNameEl.classList.toggle("editable", editing);
    }
  }

  function syncEditableToState() {
    document.querySelectorAll(".editable[data-path]").forEach((el) => {
      const path = el.dataset.path;
      if (!path) return;
      const text = getEditablePlainText(el);
      setByPath(path, text, true);
    });
    if (logoEl) {
      state.logo = getEditablePlainText(logoEl).trim() || logoEl.innerText.trim();
    }
    if (footerNameEl) {
      state.footerName = getEditablePlainText(footerNameEl).trim() || footerNameEl.innerText.trim();
    }
  }

  async function filesToDataUrls(fileList) {
    const files = Array.from(fileList || []);
    const out = [];
    for (const file of files) {
      const dataUrl = await compressImage(file);
      out.push(dataUrl);
    }
    return out;
  }

  function compressImage(file, maxWidth = 1100, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function bindInteractions() {
    // Header nav mobile
    const header = document.querySelector(".site-header");
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".nav");
    const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (toggle && nav && !toggle.dataset.bound) {
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => {
        const open = nav.classList.toggle("is-open");
        toggle.classList.toggle("is-open", open);
      });
    }

    // Text edits
    app.querySelectorAll(".editable[data-path]").forEach((el) => {
      el.addEventListener("focus", () => selectTextForSizing(el));
      el.addEventListener("pointerdown", () => {
        if (editing) selectTextForSizing(el);
      });
      el.addEventListener("blur", () => {
        if (!editing) return;
        const text = getEditablePlainText(el);
        setByPath(el.dataset.path, text);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && el.dataset.multiline !== "1") {
          e.preventDefault();
          el.blur();
        }
      });
    });

    if (logoEl) {
      logoEl.onfocus = () => selectTextForSizing(logoEl);
      logoEl.onpointerdown = () => {
        if (editing) selectTextForSizing(logoEl);
      };
      logoEl.onblur = () => {
        if (!editing) return;
        state.logo = getEditablePlainText(logoEl).trim();
        queueDirty();
      };
    }
    if (footerNameEl) {
      footerNameEl.onfocus = () => selectTextForSizing(footerNameEl);
      footerNameEl.onpointerdown = () => {
        if (editing) selectTextForSizing(footerNameEl);
      };
      footerNameEl.onblur = () => {
        if (!editing) return;
        state.footerName = getEditablePlainText(footerNameEl).trim();
        queueDirty();
      };
    }

    // Drag positions
    app.querySelectorAll("[data-drag]").forEach((handle) => {
      handle.addEventListener("pointerdown", startDrag);
    });

    // Hero photo upload
    const heroPhotoInput = document.getElementById("hero-photo-input");
    if (heroPhotoInput) {
      heroPhotoInput.addEventListener("change", async () => {
        const file = heroPhotoInput.files && heroPhotoInput.files[0];
        if (!file) return;
        try {
          state.hero.photo = await compressImage(file);
          state.hero.photoCrop = { w: 100, h: 100, x: 0, y: 0, fit: "contain" };
          await saveState();
          render();
          if (editing) setEditing(true);
        } catch (err) {
          console.error(err);
          alert("Could not read that image.");
        }
        heroPhotoInput.value = "";
      });
    }
    const heroPhotoRemove = document.getElementById("hero-photo-remove");
    if (heroPhotoRemove) {
      heroPhotoRemove.addEventListener("click", async () => {
        state.hero.photo = "";
        state.hero.photoCrop = { w: 100, h: 100, x: 0, y: 0, fit: "contain" };
        await saveState();
        render();
        if (editing) setEditing(true);
      });
    }
    const heroBoxHide = document.getElementById("hero-photo-box-hide");
    if (heroBoxHide) {
      heroBoxHide.addEventListener("click", async () => {
        state.hero.showPhotoBox = false;
        await saveState();
        render();
        if (editing) setEditing(true);
      });
    }
    const heroBoxShow = document.getElementById("hero-photo-box-show");
    if (heroBoxShow) {
      heroBoxShow.addEventListener("click", async () => {
        state.hero.showPhotoBox = true;
        await saveState();
        render();
        if (editing) setEditing(true);
      });
    }

    const applyHeroSize = (w, h, persist = false) => {
      const width = Math.max(120, Math.min(900, Math.round(w)));
      const height = Math.max(120, Math.min(900, Math.round(h)));
      state.hero.photoWidth = width;
      state.hero.photoHeight = height;
      const frame = app.querySelector('[data-movable="hero-photo"]');
      if (frame) {
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
      }
      const wInput = document.getElementById("hero-photo-w");
      const hInput = document.getElementById("hero-photo-h");
      if (wInput) wInput.value = String(width);
      if (hInput) hInput.value = String(height);
      if (persist) queueDirty();
      else {
        dirty = true;
        setSaveStatus("Save*");
      }
    };

    const wInput = document.getElementById("hero-photo-w");
    const hInput = document.getElementById("hero-photo-h");
    if (wInput) {
      wInput.addEventListener("change", () => {
        applyHeroSize(Number(wInput.value) || 420, Number(state.hero.photoHeight) || 420, true);
      });
    }
    if (hInput) {
      hInput.addEventListener("change", () => {
        applyHeroSize(Number(state.hero.photoWidth) || 420, Number(hInput.value) || 420, true);
      });
    }
    const lockBtn = document.getElementById("hero-photo-lock");
    if (lockBtn) {
      lockBtn.addEventListener("click", () => {
        const size = Number(state.hero.photoWidth) || 420;
        applyHeroSize(size, size, true);
      });
    }

    const resizeHandle = document.getElementById("hero-photo-resize");
    if (resizeHandle) {
      resizeHandle.addEventListener("pointerdown", (e) => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const origW = Number(state.hero.photoWidth) || 420;
        const origH = Number(state.hero.photoHeight) || 420;
        const onMove = (ev) => {
          applyHeroSize(origW + (ev.clientX - startX), origH + (ev.clientY - startY), false);
        };
        const onUp = () => {
          saveState();
          resizeHandle.releasePointerCapture(e.pointerId);
          resizeHandle.removeEventListener("pointermove", onMove);
          resizeHandle.removeEventListener("pointerup", onUp);
          resizeHandle.removeEventListener("pointercancel", onUp);
        };
        resizeHandle.setPointerCapture(e.pointerId);
        resizeHandle.addEventListener("pointermove", onMove);
        resizeHandle.addEventListener("pointerup", onUp);
        resizeHandle.addEventListener("pointercancel", onUp);
      });
    }

    // Hero divider line vertical drag
    const lineHandle = document.getElementById("hero-line-handle");
    if (lineHandle) {
      lineHandle.addEventListener("pointerdown", (e) => {
        if (!editing) return;
        e.preventDefault();
        const wrap = app.querySelector(".hero-line-wrap");
        const startY = e.clientY;
        const orig = Number(state.hero.lineY) || 0;
        const onMove = (ev) => {
          const next = orig + (ev.clientY - startY);
          state.hero.lineY = next;
          if (wrap) wrap.style.setProperty("--line-y", `${next}px`);
        };
        const onUp = () => {
          queueDirty();
          lineHandle.releasePointerCapture(e.pointerId);
          lineHandle.removeEventListener("pointermove", onMove);
          lineHandle.removeEventListener("pointerup", onUp);
          lineHandle.removeEventListener("pointercancel", onUp);
        };
        lineHandle.setPointerCapture(e.pointerId);
        lineHandle.addEventListener("pointermove", onMove);
        lineHandle.addEventListener("pointerup", onUp);
        lineHandle.addEventListener("pointercancel", onUp);
      });
    }

    // Galleries
    app.querySelectorAll("[data-add-photos]").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.addPhotos;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        try {
          const urls = await filesToDataUrls(input.files);
          const photos = urls.map((src) => ({ src, w: 100, h: 100, x: 0, y: 0, fit: "contain" }));
          project.photos = [...normalizePhotos(project.photos), ...photos];
          project.activePhoto = Math.max(0, project.photos.length - photos.length);
          await saveState();
          render();
          if (editing) setEditing(true);
        } catch (err) {
          console.error(err);
          alert("Could not read one of the images.");
        }
        input.value = "";
      });
    });

    app.querySelectorAll("[data-remove-photo]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.removePhoto;
        const index = Number(btn.dataset.index);
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        project.photos.splice(index, 1);
        await saveState();
        render();
        if (editing) setEditing(true);
      });
    });

    app.querySelectorAll("[data-gal-prev], [data-gal-next]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.galPrev || btn.dataset.galNext;
        const track = app.querySelector(`[data-gallery="${id}"] .gallery-track`);
        if (!track) return;
        const dir = btn.dataset.galPrev ? -1 : 1;
        track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });
        btn.blur();
      });
    });

    const applyProjectGalSize = (id, w, h, persist = false) => {
      const project = state.projects.items.find((p) => p.id === id);
      if (!project) return;
      const width = Math.max(140, Math.min(900, Math.round(w)));
      const height = Math.max(120, Math.min(700, Math.round(h)));
      project.photoWidth = width;
      project.photoHeight = height;
      const gal = app.querySelector(`[data-gallery="${id}"]`);
      if (gal) {
        gal.style.setProperty("--gal-w", `${width}px`);
        gal.style.setProperty("--gal-h", `${height}px`);
      }
      const wInput = app.querySelector(`[data-gal-w="${id}"]`);
      const hInput = app.querySelector(`[data-gal-h="${id}"]`);
      if (wInput) wInput.value = String(width);
      if (hInput) hInput.value = String(height);
      if (persist) queueDirty();
      else {
        dirty = true;
        setSaveStatus("Save*");
      }
    };

    app.querySelectorAll("[data-gal-w]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.galW;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        applyProjectGalSize(id, Number(input.value) || 480, Number(project.photoHeight) || 300, true);
      });
    });
    app.querySelectorAll("[data-gal-h]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.galH;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        applyProjectGalSize(id, Number(project.photoWidth) || 480, Number(input.value) || 300, true);
      });
    });
    app.querySelectorAll("[data-gal-square]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.galSquare;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        const w = Number(project.photoWidth) || 480;
        applyProjectGalSize(id, w, Math.round(w * 0.65), true);
      });
    });
    app.querySelectorAll("[data-gal-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        const id = handle.dataset.galResize;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const origW = Number(project.photoWidth) || 480;
        const origH = Number(project.photoHeight) || 300;
        const onMove = (ev) => {
          applyProjectGalSize(id, origW + (ev.clientX - startX), origH + (ev.clientY - startY), false);
        };
        const onUp = () => {
          saveState();
          handle.releasePointerCapture(e.pointerId);
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
        };
        handle.setPointerCapture(e.pointerId);
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      });
    });

    app.querySelectorAll(".gallery-slide").forEach((slide) => {
      const open = () =>
        openLightbox({
          source: "project",
          projectId: slide.dataset.project,
          index: Number(slide.dataset.index)
        });
      slide.addEventListener("click", (e) => {
        if (editing) return;
        if (e.target.closest(".gallery-remove, .gallery-resize, .photo-pick, .gallery-size, input, button.editor-btn")) return;
        e.preventDefault();
        open();
      });
      slide.addEventListener("keydown", (e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    bindPhotoCropControls();
    bindCaseStudyControls();

    app.querySelectorAll("[data-featured]").forEach((input) => {
      input.addEventListener("change", () => {
        const project = state.projects.items.find((p) => p.id === input.dataset.featured);
        if (!project) return;
        project.featured = input.checked;
        if (project.featured) {
          project.caseStudy = normalizeCaseStudy(project.caseStudy);
        } else if (project.caseStudy) {
          project.caseStudy.open = false;
        }
        queueDirty();
        render();
        setEditing(true);
      });
    });

    app.querySelectorAll("[data-delete-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Delete this project?")) return;
        state.projects.items = state.projects.items.filter((p) => p.id !== btn.dataset.deleteProject);
        queueDirty();
        render();
        setEditing(true);
      });
    });
  }

  let selectedCsImage = null;

  function setSelectedCsImage(meta) {
    selectedCsImage = meta;
    document.querySelectorAll(".cs-image-frame.is-paste-target, .cs-image-tile.is-paste-target, .cs-image-add-tile.is-paste-target").forEach((el) =>
      el.classList.remove("is-paste-target")
    );
    if (!meta) return;
    const sel =
      meta.stageIndex != null
        ? `[data-cs-image="${meta.projectId}"][data-cs-page="${meta.pageId}"][data-cs-block="${meta.blockId}"][data-cs-stage="${meta.stageIndex}"]`
        : `[data-cs-gallery="${meta.projectId}"][data-cs-page="${meta.pageId}"][data-cs-block="${meta.blockId}"] .cs-image-add-tile, [data-cs-image="${meta.projectId}"][data-cs-page="${meta.pageId}"][data-cs-block="${meta.blockId}"].is-active`;
    document.querySelectorAll(sel).forEach((el) => el.classList.add("is-paste-target"));
  }

  async function applyCsImageDataUrl(projectId, pageId, blockId, stageIndex, dataUrl) {
    const refs = findCaseStudyRefs(projectId, pageId, blockId);
    if (!refs || !refs.block) return;
    if (stageIndex != null && refs.block.stages && refs.block.stages[stageIndex]) {
      refs.block.stages[stageIndex].photo = dataUrl;
      refs.block.stages[stageIndex].crop = emptyImageCrop();
    } else if (refs.block.type === "image") {
      const photos = normalizePhotos(refs.block.photos);
      photos.push({ src: dataUrl, w: 100, h: 100, x: 0, y: 0, fit: "cover" });
      refs.block.photos = photos;
      refs.block.activePhoto = photos.length - 1;
    } else {
      refs.block.photo = dataUrl;
      refs.block.crop = emptyImageCrop();
    }
    refs.project.caseStudy.open = true;
    queueDirty();
    render();
    if (editing) setEditing(true);
  }

  async function applyCsImageDataUrls(projectId, pageId, blockId, stageIndex, dataUrls) {
    const urls = (dataUrls || []).filter(Boolean);
    if (!urls.length) return;
    if (stageIndex != null) {
      await applyCsImageDataUrl(projectId, pageId, blockId, stageIndex, urls[0]);
      return;
    }
    const refs = findCaseStudyRefs(projectId, pageId, blockId);
    if (!refs || !refs.block || refs.block.type !== "image") {
      await applyCsImageDataUrl(projectId, pageId, blockId, stageIndex, urls[0]);
      return;
    }
    const photos = normalizePhotos(refs.block.photos);
    const added = urls.map((src) => ({ src, w: 100, h: 100, x: 0, y: 0, fit: "cover" }));
    refs.block.photos = [...photos, ...added];
    refs.block.activePhoto = photos.length;
    refs.project.caseStudy.open = true;
    queueDirty();
    render();
    if (editing) setEditing(true);
  }

  function bindCaseStudyControls() {
    const modal = document.getElementById("cs-modal");
    const root = modal || document;

    const closeCaseStudy = (projectId) => {
      if (projectId) {
        const project = state.projects.items.find((p) => p.id === projectId);
        if (project && project.caseStudy) project.caseStudy.open = false;
      } else {
        closeAllCaseStudies();
      }
      queueDirty();
      render();
      if (editing) setEditing(true);
    };

    app.querySelectorAll("[data-cs-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const project = state.projects.items.find((p) => p.id === btn.dataset.csToggle);
        if (!project) return;
        project.caseStudy = normalizeCaseStudy(project.caseStudy);
        const opening = !project.caseStudy.open;
        closeAllCaseStudies();
        project.caseStudy.open = opening;
        queueDirty();
        render();
        if (editing) setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-close], [data-cs-close-backdrop]").forEach((btn) => {
      btn.addEventListener("click", () => closeCaseStudy(btn.dataset.csClose));
    });

    root.querySelectorAll("[data-cs-page-tab]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest(".editable") && editing) return;
        const project = state.projects.items.find((p) => p.id === btn.dataset.csPageTab);
        if (!project) return;
        project.caseStudy = normalizeCaseStudy(project.caseStudy);
        project.caseStudy.activePageId = btn.dataset.csPage;
        project.caseStudy.open = true;
        queueDirty();
        render();
        if (editing) setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-add-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const project = state.projects.items.find((p) => p.id === btn.dataset.csAddPage);
        if (!project) return;
        project.caseStudy = normalizeCaseStudy(project.caseStudy);
        const page = {
          id: uid("page"),
          title: `Page ${project.caseStudy.pages.length + 1}`,
          blocks: [createBlock("text")]
        };
        project.caseStudy.pages.push(page);
        project.caseStudy.activePageId = page.id;
        project.caseStudy.open = true;
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-del-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const project = state.projects.items.find((p) => p.id === btn.dataset.csDelPage);
        if (!project) return;
        project.caseStudy = normalizeCaseStudy(project.caseStudy);
        if (project.caseStudy.pages.length <= 1) {
          alert("Keep at least one page.");
          return;
        }
        project.caseStudy.pages = project.caseStudy.pages.filter((p) => p.id !== btn.dataset.csPage);
        project.caseStudy.activePageId = project.caseStudy.pages[0].id;
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-add-block]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const project = state.projects.items.find((p) => p.id === btn.dataset.csAddBlock);
        if (!project) return;
        project.caseStudy = normalizeCaseStudy(project.caseStudy);
        const page = project.caseStudy.pages.find((p) => p.id === project.caseStudy.activePageId);
        if (!page) return;
        page.blocks.push(createBlock(btn.dataset.type));
        project.caseStudy.open = true;
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-del-block]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csDelBlock, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.page) return;
        refs.page.blocks = refs.page.blocks.filter((b) => b.id !== btn.dataset.csBlock);
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csMove, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.page) return;
        const idx = refs.page.blocks.findIndex((b) => b.id === btn.dataset.csBlock);
        const dir = Number(btn.dataset.dir);
        const next = idx + dir;
        if (idx < 0 || next < 0 || next >= refs.page.blocks.length) return;
        const tmp = refs.page.blocks[idx];
        refs.page.blocks[idx] = refs.page.blocks[next];
        refs.page.blocks[next] = tmp;
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-field]").forEach((el) => {
      el.addEventListener("blur", () => {
        if (!editing) return;
        const text = getEditablePlainText(el);
        const refs = findCaseStudyRefs(el.dataset.csProject, el.dataset.csPage, el.dataset.csBlock);
        if (el.dataset.csField === "pageTitle") {
          const project = state.projects.items.find((p) => p.id === el.dataset.csProject);
          if (!project) return;
          project.caseStudy = normalizeCaseStudy(project.caseStudy);
          const page = project.caseStudy.pages.find((p) => p.id === el.dataset.csPage);
          if (page) page.title = text || "Page";
          queueDirty();
          return;
        }
        if (!refs || !refs.block) return;
        if (el.dataset.csField === "title") refs.block.title = text || "Block";
        if (el.dataset.csField === "body") refs.block.body = text;
        if (el.dataset.csField === "caption") refs.block.caption = text;
        if (el.dataset.csField === "item") {
          const i = Number(el.dataset.csIndex);
          if (refs.block.items) refs.block.items[i] = text;
        }
        if (el.dataset.csField === "stageLabel") {
          const i = Number(el.dataset.csIndex);
          if (refs.block.stages && refs.block.stages[i]) refs.block.stages[i].label = text || "Stage";
        }
        queueDirty();
      });
    });

    root.querySelectorAll("[data-cs-add-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csAddItem, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.items = refs.block.items || [];
        refs.block.items.push("New item");
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-del-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csDelItem, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block || !refs.block.items) return;
        refs.block.items.splice(Number(btn.dataset.csIndex), 1);
        if (!refs.block.items.length) refs.block.items.push("");
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-upload]").forEach((input) => {
      input.addEventListener("change", async () => {
        const files = input.files;
        if (!files || !files.length) return;
        try {
          const stage = input.dataset.csStage != null ? Number(input.dataset.csStage) : null;
          if (stage != null) {
            const dataUrl = await compressImage(files[0]);
            await applyCsImageDataUrl(input.dataset.csUpload, input.dataset.csPage, input.dataset.csBlock, stage, dataUrl);
          } else {
            const urls = await filesToDataUrls(files);
            await applyCsImageDataUrls(input.dataset.csUpload, input.dataset.csPage, input.dataset.csBlock, null, urls);
          }
        } catch (err) {
          console.error(err);
          alert("Could not read that image.");
        }
        input.value = "";
      });
    });

    root.querySelectorAll("[data-cs-paste-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setSelectedCsImage({
          projectId: btn.dataset.csPasteTarget,
          pageId: btn.dataset.csPage,
          blockId: btn.dataset.csBlock,
          stageIndex: btn.dataset.csStage != null ? Number(btn.dataset.csStage) : null
        });
        btn.textContent = "Ready — Ctrl+V";
      });
    });

    root.querySelectorAll("[data-cs-gal-prev], [data-cs-gal-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const projectId = btn.dataset.csGalPrev || btn.dataset.csGalNext;
        const refs = findCaseStudyRefs(projectId, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block || !refs.block.photos || !refs.block.photos.length) return;
        const len = refs.block.photos.length;
        const cur = Math.min(Number(refs.block.activePhoto) || 0, len - 1);
        refs.block.activePhoto = btn.dataset.csGalPrev != null ? (cur - 1 + len) % len : (cur + 1) % len;
        refs.project.caseStudy.open = true;
        queueDirty();
        render();
        if (editing) setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-clear-img]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const stage = btn.dataset.csStage != null ? Number(btn.dataset.csStage) : null;
        const refs = findCaseStudyRefs(btn.dataset.csClearImg, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        if (stage != null && refs.block.stages && refs.block.stages[stage]) {
          refs.block.stages[stage].photo = "";
        } else if (refs.block.type === "image" && Array.isArray(refs.block.photos)) {
          const index =
            btn.dataset.csPhotoIndex != null
              ? Number(btn.dataset.csPhotoIndex)
              : Number(refs.block.activePhoto) || 0;
          refs.block.photos.splice(index, 1);
          refs.block.activePhoto = Math.min(index, Math.max(0, refs.block.photos.length - 1));
        } else {
          refs.block.photo = "";
        }
        refs.project.caseStudy.open = true;
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-preview]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox({
          source: "cs",
          projectId: btn.dataset.csPreview,
          pageId: btn.dataset.csPage,
          blockId: btn.dataset.csBlock,
          index: Number(btn.dataset.csPhotoIndex) || 0
        });
      });
    });

    root.querySelectorAll("[data-cs-image]").forEach((frame) => {
      const openPreview = () => {
        if (frame.dataset.csStage != null) {
          const refs = findCaseStudyRefs(frame.dataset.csImage, frame.dataset.csPage, frame.dataset.csBlock);
          const stage = Number(frame.dataset.csStage);
          const photo = refs && refs.block && refs.block.stages && refs.block.stages[stage] && refs.block.stages[stage].photo;
          if (!photo) return;
          openLightbox({
            source: "cs-stage",
            projectId: frame.dataset.csImage,
            pageId: frame.dataset.csPage,
            blockId: frame.dataset.csBlock,
            stageIndex: stage,
            index: 0
          });
          return;
        }
        openLightbox({
          source: "cs",
          projectId: frame.dataset.csImage,
          pageId: frame.dataset.csPage,
          blockId: frame.dataset.csBlock,
          index: Number(frame.dataset.csPhotoIndex) || 0
        });
      };

      frame.addEventListener("click", (e) => {
        if (e.target.closest(".gallery-remove, label, input, button")) return;
        const projectId = frame.dataset.csImage;
        const pageId = frame.dataset.csPage;
        const blockId = frame.dataset.csBlock;
        const stageIndex = frame.dataset.csStage != null ? Number(frame.dataset.csStage) : null;
        const photoIndex = frame.dataset.csPhotoIndex != null ? Number(frame.dataset.csPhotoIndex) : null;

        if (editing) {
          setSelectedCsImage({
            projectId,
            pageId,
            blockId,
            stageIndex
          });
          if (stageIndex == null && photoIndex != null) {
            const refs = findCaseStudyRefs(projectId, pageId, blockId);
            if (refs && refs.block && refs.block.type === "image" && Number(refs.block.activePhoto) !== photoIndex) {
              refs.block.activePhoto = photoIndex;
              refs.project.caseStudy.open = true;
              queueDirty();
              render();
              setEditing(true);
            }
          }
          return;
        }

        e.preventDefault();
        openPreview();
      });

      frame.addEventListener("keydown", (e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPreview();
        }
      });
    });

    root.querySelectorAll("[data-cs-add-tile]").forEach((tile) => {
      tile.addEventListener("click", () => {
        setSelectedCsImage({
          projectId: tile.dataset.csAddTile,
          pageId: tile.dataset.csPage,
          blockId: tile.dataset.csBlock,
          stageIndex: null
        });
      });
    });

    const wireTableInputs = (selector, apply) => {
      root.querySelectorAll(selector).forEach((input) => {
        input.addEventListener("change", () => apply(input));
        input.addEventListener("input", () => apply(input));
      });
    };

    wireTableInputs("[data-cs-bom]", (input) => {
      const refs = findCaseStudyRefs(input.dataset.csBom, input.dataset.csPage, input.dataset.csBlock);
      if (!refs || !refs.block || !refs.block.rows) return;
      const row = refs.block.rows[Number(input.dataset.csIndex)];
      if (!row) return;
      const key = input.dataset.csKey;
      row[key] = key === "part" ? input.value : Number(input.value) || 0;
      queueDirty();
    });
    root.querySelectorAll("[data-cs-bom]").forEach((input) => {
      input.addEventListener("change", () => {
        render();
        if (editing) setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-add-bom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csAddBom, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.rows.push({ part: "New part", qty: 1, unitCost: 0 });
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-del-bom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csDelBom, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.rows.splice(Number(btn.dataset.csIndex), 1);
        if (!refs.block.rows.length) refs.block.rows.push({ part: "", qty: 1, unitCost: 0 });
        queueDirty();
        render();
        setEditing(true);
      });
    });

    wireTableInputs("[data-cs-gantt]", (input) => {
      const refs = findCaseStudyRefs(input.dataset.csGantt, input.dataset.csPage, input.dataset.csBlock);
      if (!refs || !refs.block || !refs.block.tasks) return;
      const row = refs.block.tasks[Number(input.dataset.csIndex)];
      if (!row) return;
      const key = input.dataset.csKey;
      row[key] = key === "task" || key === "pic" ? input.value : Number(input.value) || 1;
      queueDirty();
    });
    root.querySelectorAll("[data-cs-gantt]").forEach((input) => {
      input.addEventListener("change", () => {
        render();
        if (editing) setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-gantt-weeks]").forEach((input) => {
      input.addEventListener("change", () => {
        const refs = findCaseStudyRefs(input.dataset.csGanttWeeks, input.dataset.csPage, input.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.weeks = Math.max(4, Math.min(24, Number(input.value) || 8));
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-add-gantt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csAddGantt, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.tasks.push({ task: "Task", pic: "", planStart: 1, planEnd: 2, actualStart: 1, actualEnd: 2 });
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-del-gantt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csDelGantt, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.tasks.splice(Number(btn.dataset.csIndex), 1);
        queueDirty();
        render();
        setEditing(true);
      });
    });

    root.querySelectorAll("[data-cs-add-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refs = findCaseStudyRefs(btn.dataset.csAddStage, btn.dataset.csPage, btn.dataset.csBlock);
        if (!refs || !refs.block) return;
        refs.block.stages.push({ label: `Stage ${refs.block.stages.length + 1}`, photo: "", crop: emptyImageCrop() });
        queueDirty();
        render();
        setEditing(true);
      });
    });
  }

  let dragState = null;
  let cropDrag = null;

  function applyCropToEl(el, crop) {
    if (!el) return;
    const c = normalizeCrop(crop);
    el.style.setProperty("--pw", String(c.w));
    el.style.setProperty("--ph", String(c.h));
    el.style.setProperty("--ox", String(c.x));
    el.style.setProperty("--oy", String(c.y));
    el.style.setProperty("--fit", c.fit);
    el.dataset.fit = c.fit;
    syncPhotoPanel(el, c);
  }

  function findPhotoPanel(el) {
    if (!el) return null;
    if (el.dataset.photoCrop === "hero") {
      return app.querySelector(".hero-photo-actions .photo-adjust-panel");
    }
    const gallery = el.closest(".gallery");
    if (gallery) return gallery.querySelector(".photo-adjust-panel");
    const csGallery = el.closest(".cs-image-gallery");
    return csGallery ? csGallery.querySelector(".photo-adjust-panel") : null;
  }

  function syncPhotoPanel(elOrPanel, crop) {
    const c = normalizeCrop(crop);
    const panel =
      elOrPanel && elOrPanel.classList && elOrPanel.classList.contains("photo-adjust-panel")
        ? elOrPanel
        : findPhotoPanel(elOrPanel);
    if (!panel) return;
    panel.querySelectorAll("[data-fit-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.fitMode === c.fit);
    });
    panel.querySelectorAll('[data-photo-dim="w"]').forEach((input) => {
      input.value = String(c.w);
    });
    panel.querySelectorAll('[data-photo-dim="h"]').forEach((input) => {
      input.value = String(c.h);
    });
    panel.querySelectorAll('[data-photo-dim-range="w"]').forEach((input) => {
      input.value = String(c.w);
    });
    panel.querySelectorAll('[data-photo-dim-range="h"]').forEach((input) => {
      input.value = String(c.h);
    });
    panel.querySelectorAll('[data-photo-dim-label="w"]').forEach((label) => {
      label.textContent = `${c.w}%`;
    });
    panel.querySelectorAll('[data-photo-dim-label="h"]').forEach((label) => {
      label.textContent = `${c.h}%`;
    });
  }

  function writeCropFields(targetPhoto, crop) {
    const next = normalizeCrop(crop);
    targetPhoto.w = next.w;
    targetPhoto.h = next.h;
    targetPhoto.x = next.x;
    targetPhoto.y = next.y;
    targetPhoto.fit = next.fit;
    targetPhoto.zoom = next.zoom;
    return next;
  }

  function getCropTarget(el) {
    const kind = el.dataset.photoCrop;
    if (kind === "hero") {
      return {
        get: () => normalizeCrop(state.hero.photoCrop),
        set: (crop) => {
          state.hero.photoCrop = normalizeCrop(crop);
        }
      };
    }
    if (kind === "cs") {
      const refs = findCaseStudyRefs(el.dataset.project, el.dataset.csPage, el.dataset.csBlock);
      if (!refs || !refs.block) return null;
      const stageIndex = el.dataset.csStage != null ? Number(el.dataset.csStage) : null;
      if (stageIndex != null && refs.block.stages && refs.block.stages[stageIndex]) {
        return {
          get: () => normalizeCrop(refs.block.stages[stageIndex].crop),
          set: (crop) => {
            refs.block.stages[stageIndex].crop = normalizeCrop(crop);
          }
        };
      }
      if (refs.block.type === "image") {
        const photos = normalizePhotos(refs.block.photos);
        const index =
          el.dataset.csPhotoIndex != null
            ? Number(el.dataset.csPhotoIndex)
            : Math.min(Number(refs.block.activePhoto) || 0, Math.max(0, photos.length - 1));
        if (!photos[index]) return null;
        refs.block.photos = photos;
        refs.block.activePhoto = index;
        return {
          get: () => normalizeCrop(refs.block.photos[index]),
          set: (crop) => {
            writeCropFields(refs.block.photos[index], crop);
            refs.block.activePhoto = index;
          }
        };
      }
      return {
        get: () => normalizeCrop(refs.block.crop),
        set: (crop) => {
          refs.block.crop = normalizeCrop(crop);
        }
      };
    }
    if (kind === "project") {
      const project = state.projects.items.find((p) => p.id === el.dataset.project);
      const index = Number(el.dataset.index);
      if (!project || !project.photos || !project.photos[index]) return null;
      project.photos[index] = normalizePhoto(project.photos[index]);
      return {
        get: () => normalizeCrop(project.photos[index]),
        set: (crop) => {
          writeCropFields(project.photos[index], crop);
          project.activePhoto = index;
        }
      };
    }
    return null;
  }

  function clampCrop(crop) {
    return normalizeCrop(crop);
  }

  function syncFitButtons(scope, fit) {
    if (!scope) return;
    scope.querySelectorAll("[data-fit-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.fitMode === fit);
    });
  }

  function sizePatchFromDim(crop, dim, value) {
    const next = { ...normalizeCrop(crop) };
    const val = Math.max(20, Math.min(400, Math.round(Number(value) || 100)));
    if (dim === "w") next.w = val;
    else next.h = val;
    return next;
  }

  function bindPhotoCropControls() {
    const cropRoots = [app, document.getElementById("cs-modal-panel")].filter(Boolean);
    cropRoots.forEach((root) => {
      root.querySelectorAll("[data-photo-crop]").forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        if (!editing) return;
        if (e.target.closest("button, label, input, .drag-handle, .hero-photo-resize, .gallery-resize, .gallery-remove")) return;
        const target = getCropTarget(el);
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        const crop = target.get();
        cropDrag = {
          el,
          target,
          startX: e.clientX,
          startY: e.clientY,
          origX: crop.x,
          origY: crop.y,
          w: crop.w,
          h: crop.h,
          fit: crop.fit,
          moved: false
        };
        el.classList.add("is-panning");
        el.setPointerCapture(e.pointerId);
        el.addEventListener("pointermove", onCropMove);
        el.addEventListener("pointerup", onCropEnd);
        el.addEventListener("pointercancel", onCropEnd);
      });

      el.addEventListener(
        "wheel",
        (e) => {
          if (!editing) return;
          const target = getCropTarget(el);
          if (!target) return;
          e.preventDefault();
          e.stopPropagation();
          // Scale only width or height with modifiers; plain wheel = width
          const crop = target.get();
          const factor = e.deltaY > 0 ? 0.94 : 1.06;
          const next = clampCrop(
            e.shiftKey
              ? { ...crop, h: crop.h * factor }
              : { ...crop, w: crop.w * factor }
          );
          target.set(next);
          applyCropToEl(el, next);
          queueDirty();
        },
        { passive: false }
      );
      });
    });

    const applyHeroCrop = (patch) => {
      const crop = clampCrop({ ...normalizeCrop(state.hero.photoCrop), ...patch });
      state.hero.photoCrop = crop;
      applyCropToEl(app.querySelector('[data-photo-crop="hero"]'), crop);
      syncFitButtons(app.querySelector("[data-hero-fit]"), crop.fit);
      queueDirty();
    };

    const heroPanel = app.querySelector("[data-hero-size]");
    if (heroPanel) {
      const onHeroSize = (dim, value) => {
        applyHeroCrop(sizePatchFromDim(state.hero.photoCrop, dim, value));
      };
      heroPanel.querySelectorAll("[data-photo-dim]").forEach((input) => {
        input.addEventListener("input", () => onHeroSize(input.dataset.photoDim, input.value));
        input.addEventListener("change", () => onHeroSize(input.dataset.photoDim, input.value));
      });
      heroPanel.querySelectorAll("[data-photo-dim-range]").forEach((input) => {
        input.addEventListener("input", () => onHeroSize(input.dataset.photoDimRange, input.value));
      });
    }

    const heroReset = document.getElementById("hero-crop-reset");
    if (heroReset) {
      heroReset.addEventListener("click", () => {
        applyHeroCrop({ w: 100, h: 100, x: 0, y: 0, fit: "contain" });
      });
    }
    app.querySelectorAll("[data-hero-fit] [data-fit-mode]").forEach((btn) => {
      btn.addEventListener("click", () => applyHeroCrop({ fit: btn.dataset.fitMode }));
    });

    const applyProjectCrop = (id, index, patch) => {
      const project = state.projects.items.find((p) => p.id === id);
      if (!project || !project.photos[index]) return;
      project.photos[index] = normalizePhoto(project.photos[index]);
      const crop = writeCropFields(project.photos[index], {
        ...normalizeCrop(project.photos[index]),
        ...patch
      });
      project.activePhoto = index;
      const cropEl = app.querySelector(`[data-photo-crop="project"][data-project="${id}"][data-index="${index}"]`);
      applyCropToEl(cropEl, crop);
      const gallery = app.querySelector(`[data-gallery="${id}"]`);
      syncFitButtons(gallery?.querySelector(`[data-gal-fit="${id}"]`), crop.fit);
      queueDirty();
    };

    app.querySelectorAll("[data-gal-size-panel]").forEach((panel) => {
      const onSize = (dim, value) => {
        const id = panel.dataset.galSizePanel;
        const index = Number(panel.dataset.index);
        const project = state.projects.items.find((p) => p.id === id);
        if (!project || !project.photos[index]) return;
        const current = normalizeCrop(project.photos[index]);
        applyProjectCrop(id, index, sizePatchFromDim(current, dim, value));
      };
      panel.querySelectorAll("[data-photo-dim]").forEach((input) => {
        input.addEventListener("input", () => onSize(input.dataset.photoDim, input.value));
        input.addEventListener("change", () => onSize(input.dataset.photoDim, input.value));
      });
      panel.querySelectorAll("[data-photo-dim-range]").forEach((input) => {
        input.addEventListener("input", () => onSize(input.dataset.photoDimRange, input.value));
      });
    });

    app.querySelectorAll("[data-gal-crop-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyProjectCrop(btn.dataset.galCropReset, Number(btn.dataset.index), {
          w: 100,
          h: 100,
          x: 0,
          y: 0,
          fit: "contain"
        });
      });
    });

    app.querySelectorAll("[data-gal-fit]").forEach((group) => {
      group.querySelectorAll("[data-fit-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          applyProjectCrop(group.dataset.galFit, Number(group.dataset.index), {
            fit: btn.dataset.fitMode
          });
        });
      });
    });

    const applyCsCrop = (projectId, pageId, blockId, index, patch) => {
      const refs = findCaseStudyRefs(projectId, pageId, blockId);
      if (!refs || !refs.block || refs.block.type !== "image") return;
      const photos = normalizePhotos(refs.block.photos);
      if (!photos[index]) return;
      refs.block.photos = photos;
      const crop = writeCropFields(photos[index], { ...normalizeCrop(photos[index]), ...patch });
      refs.block.activePhoto = index;
      const panelRoot = document.getElementById("cs-modal-panel") || document;
      const cropEl = panelRoot.querySelector(
        `[data-photo-crop="cs"][data-project="${projectId}"][data-cs-page="${pageId}"][data-cs-block="${blockId}"][data-cs-photo-index="${index}"]`
      );
      applyCropToEl(cropEl, crop);
      const gal = panelRoot.querySelector(
        `[data-cs-gallery="${projectId}"][data-cs-page="${pageId}"][data-cs-block="${blockId}"]`
      );
      syncFitButtons(gal?.querySelector("[data-cs-fit]"), crop.fit);
      queueDirty();
    };

    const csRoot = document.getElementById("cs-modal-panel") || document;
    csRoot.querySelectorAll("[data-cs-size-panel]").forEach((panel) => {
      const onSize = (dim, value) => {
        const index = Number(panel.dataset.csPhotoIndex);
        const refs = findCaseStudyRefs(panel.dataset.csSizePanel, panel.dataset.csPage, panel.dataset.csBlock);
        if (!refs || !refs.block || !refs.block.photos || !refs.block.photos[index]) return;
        applyCsCrop(
          panel.dataset.csSizePanel,
          panel.dataset.csPage,
          panel.dataset.csBlock,
          index,
          sizePatchFromDim(refs.block.photos[index], dim, value)
        );
      };
      panel.querySelectorAll("[data-photo-dim]").forEach((input) => {
        input.addEventListener("input", () => onSize(input.dataset.photoDim, input.value));
        input.addEventListener("change", () => onSize(input.dataset.photoDim, input.value));
      });
      panel.querySelectorAll("[data-photo-dim-range]").forEach((input) => {
        input.addEventListener("input", () => onSize(input.dataset.photoDimRange, input.value));
      });
    });
    csRoot.querySelectorAll("[data-cs-crop-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyCsCrop(btn.dataset.csCropReset, btn.dataset.csPage, btn.dataset.csBlock, Number(btn.dataset.csPhotoIndex), {
          w: 100,
          h: 100,
          x: 0,
          y: 0,
          fit: "contain"
        });
      });
    });
    csRoot.querySelectorAll("[data-cs-fit]").forEach((group) => {
      group.querySelectorAll("[data-fit-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          applyCsCrop(group.dataset.csFit, group.dataset.csPage, group.dataset.csBlock, Number(group.dataset.csPhotoIndex), {
            fit: btn.dataset.fitMode
          });
        });
      });
    });

    app.querySelectorAll("[data-gallery]").forEach((gallery) => {
      const track = gallery.querySelector(".gallery-track");
      if (!track || track.dataset.cropBound) return;
      track.dataset.cropBound = "1";
      const syncZoomUi = () => {
        const id = gallery.dataset.gallery;
        const project = state.projects.items.find((p) => p.id === id);
        if (!project || !project.photos.length) return;
        const width = track.clientWidth || 1;
        const index = Math.round(track.scrollLeft / width);
        const safe = Math.max(0, Math.min(project.photos.length - 1, index));
        project.activePhoto = safe;
        const photo = normalizePhoto(project.photos[safe]);
        const reset = gallery.querySelector("[data-gal-crop-reset]");
        const fitGroup = gallery.querySelector("[data-gal-fit]");
        const sizePanel = gallery.querySelector("[data-gal-size-panel]");
        gallery.querySelectorAll("[data-gal-zoom-range], [data-gal-zoom-index]").forEach((node) => {
          if (node.dataset) node.dataset.galZoomIndex = String(safe);
        });
        if (reset) reset.dataset.index = String(safe);
        if (fitGroup) {
          fitGroup.dataset.index = String(safe);
          syncFitButtons(fitGroup, photo.fit);
        }
        if (sizePanel) {
          sizePanel.dataset.index = String(safe);
          sizePanel.querySelectorAll("[data-gal-zoom-index]").forEach((node) => {
            node.dataset.galZoomIndex = String(safe);
          });
        }
        syncPhotoPanel(gallery.querySelector(".photo-adjust-panel"), photo);
      };
      track.addEventListener("scroll", syncZoomUi, { passive: true });
    });
  }

  function onCropMove(e) {
    if (!cropDrag) return;
    const dx = e.clientX - cropDrag.startX;
    const dy = e.clientY - cropDrag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) cropDrag.moved = true;
    const rect = cropDrag.el.getBoundingClientRect();
    const next = clampCrop({
      w: cropDrag.w,
      h: cropDrag.h,
      fit: cropDrag.fit || "cover",
      x: cropDrag.origX + (dx / Math.max(1, rect.width)) * 100,
      y: cropDrag.origY + (dy / Math.max(1, rect.height)) * 100
    });
    cropDrag.target.set(next);
    applyCropToEl(cropDrag.el, next);
  }

  function onCropEnd(e) {
    if (!cropDrag) return;
    cropDrag.el.classList.remove("is-panning");
    cropDrag.el.releasePointerCapture(e.pointerId);
    cropDrag.el.removeEventListener("pointermove", onCropMove);
    cropDrag.el.removeEventListener("pointerup", onCropEnd);
    cropDrag.el.removeEventListener("pointercancel", onCropEnd);
    if (cropDrag.moved) queueDirty();
    cropDrag = null;
  }

  function startDrag(e) {
    if (!editing) return;
    e.preventDefault();
    const id = e.currentTarget.dataset.drag;
    const box = app.querySelector(`[data-movable="${id}"]`) || document.querySelector(`[data-movable="${id}"]`);
    if (!box) return;
    const pos = state.positions[id] || { x: 0, y: 0 };
    dragState = {
      id,
      box,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y
    };
    box.classList.add("is-dragging");
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.addEventListener("pointermove", onDragMove);
    e.currentTarget.addEventListener("pointerup", onDragEnd);
    e.currentTarget.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e) {
    if (!dragState) return;
    const x = dragState.origX + (e.clientX - dragState.startX);
    const y = dragState.origY + (e.clientY - dragState.startY);
    dragState.box.style.setProperty("--mx", `${x}px`);
    dragState.box.style.setProperty("--my", `${y}px`);
  }

  function onDragEnd(e) {
    if (!dragState) return;
    const x = dragState.origX + (e.clientX - dragState.startX);
    const y = dragState.origY + (e.clientY - dragState.startY);
    state.positions[dragState.id] = { x, y };
    queueDirty();
    dragState.box.classList.remove("is-dragging");
    e.currentTarget.removeEventListener("pointermove", onDragMove);
    e.currentTarget.removeEventListener("pointerup", onDragEnd);
    e.currentTarget.removeEventListener("pointercancel", onDragEnd);
    dragState = null;
  }

  function getLightboxPhotos() {
    if (!lightbox || !lightbox.source) return [];
    if (lightbox.source === "project") {
      const project = state.projects.items.find((p) => p.id === lightbox.projectId);
      return project && project.photos ? normalizePhotos(project.photos) : [];
    }
    if (lightbox.source === "cs") {
      const refs = findCaseStudyRefs(lightbox.projectId, lightbox.pageId, lightbox.blockId);
      return refs && refs.block && refs.block.photos ? normalizePhotos(refs.block.photos) : [];
    }
    if (lightbox.source === "cs-stage") {
      const refs = findCaseStudyRefs(lightbox.projectId, lightbox.pageId, lightbox.blockId);
      const stage = refs && refs.block && refs.block.stages && refs.block.stages[lightbox.stageIndex];
      return stage && stage.photo ? [{ src: stage.photo }] : [];
    }
    return [];
  }

  function openLightbox(opts) {
    const options =
      typeof opts === "string"
        ? { source: "project", projectId: opts, index: arguments[1] || 0 }
        : opts || {};
    lightbox = {
      source: options.source || "project",
      projectId: options.projectId || null,
      pageId: options.pageId || null,
      blockId: options.blockId || null,
      stageIndex: options.stageIndex != null ? options.stageIndex : null,
      index: Number(options.index) || 0
    };
    const photos = getLightboxPhotos();
    if (!photos.length) return;
    const safeIndex = ((lightbox.index % photos.length) + photos.length) % photos.length;
    lightbox.index = safeIndex;

    const project = state.projects.items.find((p) => p.id === lightbox.projectId);
    const lb = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const prev = document.getElementById("lightbox-prev");
    const next = document.getElementById("lightbox-next");
    const counter = document.getElementById("lightbox-counter");
    img.src = photoSrc(photos[safeIndex]);
    img.alt = `${(project && project.title) || "Photo"} ${safeIndex + 1}`;
    img.removeAttribute("style");
    img.classList.remove("lightbox-cropped");
    if (counter) counter.textContent = `${safeIndex + 1} / ${photos.length}`;
    const multi = photos.length > 1;
    if (prev) prev.hidden = !multi;
    if (next) next.hidden = !multi;
    lb.hidden = false;
    document.body.classList.add("lightbox-open");
  }

  function closeLightbox() {
    const lb = document.getElementById("lightbox");
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.classList.remove("lightbox-open");
    const img = document.getElementById("lightbox-img");
    if (img) img.removeAttribute("src");
    lightbox = { source: null, projectId: null, pageId: null, blockId: null, index: 0 };
  }

  function stepLightbox(dir) {
    const photos = getLightboxPhotos();
    if (!photos.length) return;
    lightbox.index = (lightbox.index + dir + photos.length) % photos.length;
    openLightbox({ ...lightbox, index: lightbox.index });
  }

  document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
  document.getElementById("lightbox-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    stepLightbox(-1);
    e.currentTarget.blur();
  });
  document.getElementById("lightbox-next").addEventListener("click", (e) => {
    e.stopPropagation();
    stepLightbox(1);
    e.currentTarget.blur();
  });
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox" || e.target.classList.contains("lightbox-backdrop")) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    const lb = document.getElementById("lightbox");
    const csModal = document.getElementById("cs-modal");
    if (e.key === "Escape" && lb && !lb.hidden) {
      closeLightbox();
      return;
    }
    if (e.key === "Escape" && csModal && !csModal.hidden) {
      closeAllCaseStudies();
      queueDirty();
      render();
      if (editing) setEditing(true);
      return;
    }
    if (!lb || lb.hidden) return;
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  if (logoEl) {
    let logoClickTimer = null;

    const isEditUnlocked = () => sessionStorage.getItem(EDIT_UNLOCK_KEY) === "1";

    const closeAuthModal = () => {
      if (!authModal) return;
      authModal.hidden = true;
      if (authError) authError.hidden = true;
      if (authPassword) authPassword.value = "";
      document.body.classList.remove("auth-modal-open");
    };

    const openAuthModal = () => {
      if (!authModal) return;
      authModal.hidden = false;
      if (authError) authError.hidden = true;
      if (authPassword) {
        authPassword.value = "";
        requestAnimationFrame(() => authPassword.focus());
      }
      document.body.classList.add("auth-modal-open");
    };

    const unlockCustomize = () => {
      sessionStorage.setItem(EDIT_UNLOCK_KEY, "1");
      const keepY = window.scrollY;
      fabVisible = true;
      applyEditMode();
      requestAnimationFrame(() => window.scrollTo(0, keepY));
    };

    const requestCustomizeAccess = () => {
      if (editing) return;
      if (isEditUnlocked()) {
        const keepY = window.scrollY;
        fabVisible = !fabVisible;
        applyEditMode();
        requestAnimationFrame(() => window.scrollTo(0, keepY));
        return;
      }
      openAuthModal();
    };

    logoEl.addEventListener("click", (e) => {
      e.preventDefault();
      if (editing) return;
      // Wait so a double-click can cancel the scroll-to-top
      clearTimeout(logoClickTimer);
      logoClickTimer = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 280);
    });
    logoEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(logoClickTimer);
      requestCustomizeAccess();
    });

    authForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = (authPassword && authPassword.value) || "";
      if (value === EDIT_PASSWORD) {
        closeAuthModal();
        unlockCustomize();
        return;
      }
      if (authError) authError.hidden = false;
      if (authPassword) {
        authPassword.select();
        authPassword.focus();
      }
    });

    authModal?.querySelectorAll("[data-auth-close]").forEach((el) => {
      el.addEventListener("click", () => closeAuthModal());
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && authModal && !authModal.hidden) {
        closeAuthModal();
      }
    });
  }

  document.getElementById("back-to-top")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelectorAll('a[href="#top"]').forEach((link) => {
    if (link.id === "back-to-top" || link.classList.contains("logo")) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  btnEdit.addEventListener("click", () => {
    if (sessionStorage.getItem(EDIT_UNLOCK_KEY) !== "1") {
      fabVisible = false;
      applyEditMode();
      document.getElementById("auth-modal")?.removeAttribute("hidden");
      document.body.classList.add("auth-modal-open");
      document.getElementById("auth-password")?.focus();
      return;
    }
    const keepY = window.scrollY;
    setEditing(true);
    requestAnimationFrame(() => {
      // Editor bar adds top padding — keep the same spot on screen
      const pad = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
      window.scrollTo(0, keepY + pad);
    });
  });
  btnUndo?.addEventListener("click", () => undoChange());
  btnRedo?.addEventListener("click", () => redoChange());
  document.addEventListener("keydown", (e) => {
    if (!editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
      e.preventDefault();
      undoChange();
      return;
    }
    if (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey)) {
      e.preventDefault();
      redoChange();
    }
  });
  btnDone.addEventListener("click", async () => {
    syncEditableToState();
    await saveState();
    setEditing(false);
    sessionStorage.removeItem(EDIT_UNLOCK_KEY);
    fabVisible = false;
    render();
  });
  btnSave.addEventListener("click", async () => {
    syncEditableToState();
    await saveState();
  });
  btnReset.addEventListener("click", async () => {
    if (!confirm("Reset all text, positions, and photos to the original portfolio?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + "-meta");
    try {
      await idbClear();
    } catch (_) {
      /* ignore */
    }
    historyLocked = true;
    state = clone(window.PORTFOLIO_DEFAULTS);
    dirty = false;
    resetHistoryFromState();
    render();
    if (editing) setEditing(true);
    historyLocked = false;
  });
  btnExport.addEventListener("click", () => {
    syncEditableToState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "syahmi-portfolio.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      historyLocked = true;
      state = normalizeState(parsed);
      dirty = true;
      resetHistoryFromState();
      await saveState();
      render();
      if (editing) setEditing(true);
      historyLocked = false;
    } catch {
      alert("Invalid portfolio JSON file.");
    }
    importFile.value = "";
  });
  btnAddProject.addEventListener("click", () => {
    const n = state.projects.items.length + 1;
    const id = `p${Date.now()}`;
    state.projects.items.push({
      id,
      featured: false,
      index: String(n).padStart(2, "0"),
      tag: "New project",
      title: "Untitled project",
      body: "Describe this project here.",
      photos: [],
      photoWidth: 360,
      photoHeight: 220
    });
    queueDirty();
    render();
    setEditing(true);
    document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" });
  });

  ["typo-display", "typo-body", "typo-brand", "typo-heading", "typo-body-scale"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", onTypographyChange);
    el.addEventListener("input", onTypographyChange);
  });

  const sizeInput = document.getElementById("typo-selected-px");
  const sizeMinus = document.getElementById("size-minus");
  const sizePlus = document.getElementById("size-plus");
  const sizeReset = document.getElementById("size-reset");

  if (sizeInput) {
    sizeInput.addEventListener("change", () => setTextSizeForSelection(sizeInput.value));
    sizeInput.addEventListener("input", () => setTextSizeForSelection(sizeInput.value));
  }
  if (sizeMinus) {
    sizeMinus.addEventListener("click", () => {
      setTextSizeForSelection(currentPxForEl(selectedTextEl) - 2);
    });
  }
  if (sizePlus) {
    sizePlus.addEventListener("click", () => {
      setTextSizeForSelection(currentPxForEl(selectedTextEl) + 2);
    });
  }
  if (sizeReset) {
    sizeReset.addEventListener("click", () => setTextSizeForSelection(null, true));
  }

  const boxWInput = document.getElementById("typo-selected-box-w");
  const boxHInput = document.getElementById("typo-selected-box-h");
  const boxReset = document.getElementById("box-reset");
  if (boxWInput) {
    const applyW = () => {
      if (boxWInput.value === "") setTextBoxForSelection({ width: "" });
      else setTextBoxForSelection({ width: boxWInput.value });
    };
    boxWInput.addEventListener("change", applyW);
    boxWInput.addEventListener("input", applyW);
  }
  if (boxHInput) {
    const applyH = () => {
      if (boxHInput.value === "" || Number(boxHInput.value) <= 0) setTextBoxForSelection({ height: "" });
      else setTextBoxForSelection({ height: boxHInput.value });
    };
    boxHInput.addEventListener("change", applyH);
    boxHInput.addEventListener("input", applyH);
  }
  if (boxReset) {
    boxReset.addEventListener("click", () => setTextBoxForSelection(null, true));
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) {
      saveState();
    }
  });

  async function boot() {
    state = await loadState();
    resetHistoryFromState();
    render();
  }

  document.addEventListener("paste", async (e) => {
    if (!editing || !selectedCsImage) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    let file = null;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        file = item.getAsFile();
        break;
      }
    }
    if (!file) return;
    e.preventDefault();
    try {
      const dataUrl = await compressImage(file);
      await applyCsImageDataUrl(
        selectedCsImage.projectId,
        selectedCsImage.pageId,
        selectedCsImage.blockId,
        selectedCsImage.stageIndex,
        dataUrl
      );
    } catch (err) {
      console.error(err);
      alert("Could not paste that image.");
    }
  });

  boot();
})();
