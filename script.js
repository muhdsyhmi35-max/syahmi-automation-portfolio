(() => {
  const STORAGE_KEY = "syahmi-portfolio-v2";
  const DB_NAME = "syahmi-portfolio-db";
  const DB_STORE = "portfolio";
  const DB_KEY = "main";
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const app = document.getElementById("app");
  const editorBar = document.getElementById("editor-bar");
  const btnEdit = document.getElementById("btn-edit");
  const btnDone = document.getElementById("btn-done");
  const btnSave = document.getElementById("btn-save");
  const btnReset = document.getElementById("btn-reset");
  const btnExport = document.getElementById("btn-export");
  const btnAddProject = document.getElementById("btn-add-project");
  const importFile = document.getElementById("import-file");
  const logoEl = document.querySelector(".logo");
  const footerNameEl = document.querySelector('[data-edit="footerName"]');

  let state = clone(window.PORTFOLIO_DEFAULTS);
  let editing = false;
  let dirty = false;
  let fabVisible = false;
  let saveTimer = null;
  let lightbox = { projectId: null, index: 0 };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeState(parsed) {
    const defaults = clone(window.PORTFOLIO_DEFAULTS);
    if (!parsed || typeof parsed !== "object") return defaults;
    const normalized = {
      ...defaults,
      ...parsed,
      layoutVersion: Math.max(Number(parsed.layoutVersion) || 0, 3),
      positions: parsed.positions || {},
      hero: { ...defaults.hero, ...(parsed.hero || {}) },
      projects: {
        ...defaults.projects,
        ...(parsed.projects || {}),
        items: ((parsed.projects && parsed.projects.items) || defaults.projects.items).map((item) => ({
          photoWidth: item.featured ? 480 : 360,
          photoHeight: item.featured ? 300 : 220,
          photos: [],
          ...item
        }))
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
        if ((Number(fromIdb.layoutVersion) || 0) < 3) {
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
          p.photos = (p.photos || []).map(() => "[saved-in-db]");
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
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState();
    }, 500);
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
    const cls = ["editable", className].filter(Boolean).join(" ");
    return `<${Tag} class="${cls}" data-path="${path}" data-multiline="${multiline ? "1" : "0"}">${nlToBr(value)}</${Tag}>`;
  }

  function projectPhotoSize(project) {
    return {
      w: Number(project.photoWidth) || (project.featured ? 480 : 360),
      h: Number(project.photoHeight) || (project.featured ? 300 : 220)
    };
  }

  function renderGallery(project) {
    const photos = project.photos || [];
    const size = projectPhotoSize(project);
    const slides = photos
      .map(
        (src, i) => `
        <div class="gallery-slide" data-project="${project.id}" data-index="${i}" role="button" tabindex="0" aria-label="View ${escapeHtml(project.title)} photo ${i + 1}">
          <img src="${src}" alt="${escapeHtml(project.title)} photo ${i + 1}" loading="lazy" />
          <span class="gallery-view-hint">Click to view</span>
          <button type="button" class="gallery-remove" data-remove-photo="${project.id}" data-index="${i}" hidden aria-label="Remove photo">×</button>
        </div>`
      )
      .join("");

    return `
      <div class="gallery" data-gallery="${project.id}" style="--gal-w:${size.w}px;--gal-h:${size.h}px">
        <div class="gallery-track ${photos.length ? "has-photos" : "is-empty"}">
          ${
            photos.length
              ? slides
              : `<div class="gallery-empty"><span>No photos yet</span><small>Add one or more project photos</small></div>`
          }
        </div>
        <button type="button" class="gallery-resize" data-gal-resize="${project.id}" hidden aria-label="Resize photos" title="Drag to resize"></button>
        <div class="gallery-toolbar">
          ${
            photos.length > 1
              ? `<button type="button" class="gallery-btn" data-gal-prev="${project.id}" aria-label="Previous">‹</button>
                 <span class="gallery-count">${photos.length} photos</span>
                 <button type="button" class="gallery-btn" data-gal-next="${project.id}" aria-label="Next">›</button>`
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
        </div>
      </div>
    `;
  }

  function renderProject(project, featured) {
    const body = `
      <div class="project-body-wrap">
        ${editable(`projects.items.${project.id}.tag`, "p", "project-tag", project.tag)}
        ${editable(`projects.items.${project.id}.title`, "h3", "", project.title)}
        ${editable(`projects.items.${project.id}.body`, "p", "", project.body, true)}
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

    app.innerHTML = `
      <section class="hero">
        <div class="hero-atmosphere" aria-hidden="true">
          <div class="hero-grid"></div>
          <div class="hero-beam"></div>
          <div class="hero-silhouette ${d.hero.photo ? "has-photo-behind" : ""}"></div>
        </div>
        <div class="hero-stage">
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
          `
          )}
          ${movable(
            "hero-photo",
            `hero-photo-frame ${d.hero.photo ? "has-photo" : "is-empty"}`,
            `
            ${
              d.hero.photo
                ? `<img src="${d.hero.photo}" alt="Hero" class="hero-photo-img" />`
                : `<div class="hero-photo-placeholder"><span>Hero photo</span><small>Upload a picture here</small></div>`
            }
            <div class="hero-photo-actions" hidden>
              <label class="photo-pick">
                ${d.hero.photo ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/*" hidden id="hero-photo-input" />
              </label>
              ${
                d.hero.photo
                  ? `<button type="button" class="editor-btn editor-btn-danger" id="hero-photo-remove">Remove</button>`
                  : ""
              }
              <div class="hero-photo-size">
                <label>W <input type="number" id="hero-photo-w" min="120" max="900" step="10" value="${Number(d.hero.photoWidth) || 420}" /></label>
                <label>H <input type="number" id="hero-photo-h" min="120" max="900" step="10" value="${Number(d.hero.photoHeight) || 420}" /></label>
                <button type="button" class="editor-btn" id="hero-photo-lock" title="Keep square">1:1</button>
              </div>
            </div>
            <button type="button" class="hero-photo-resize" id="hero-photo-resize" hidden aria-label="Resize photo" title="Drag to resize"></button>
          `,
            `width:${Number(d.hero.photoWidth) || 420}px;height:${Number(d.hero.photoHeight) || 420}px;`
          )}
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

    applyEditMode();
    bindInteractions();
    setupScrollAnimations();
  }

  function setupScrollAnimations() {
    if (window.__scrollAnimObserver) {
      window.__scrollAnimObserver.disconnect();
      window.__scrollAnimObserver = null;
    }

    const markAll = () => {
      app.querySelectorAll(".scroll-section, .scroll-item, .project-feature, .project-card, .section").forEach((el) => {
        el.classList.add("in-view", "seen");
        el.classList.remove("will-animate", "ready-replay");
      });
    };

    if (editing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      app.querySelectorAll(".section").forEach((section) => section.classList.add("scroll-section"));
      markAll();
      return;
    }

    const targets = [];

    app.querySelectorAll(".section").forEach((section) => {
      section.classList.add("scroll-section", "will-animate");
      targets.push(section);

      section.querySelectorAll(".section-label, h2, .about-copy, .expertise-block, .stat-row li, .exp-header, .exp-list li, .achieve-block, .cred-list li, .contact-panel > *").forEach((child, idx) => {
        child.classList.add("scroll-item", "will-animate");
        child.style.setProperty("--stagger", String(Math.min(idx, 6)));
        targets.push(child);
      });
    });

    app.querySelectorAll(".project-feature, .project-card").forEach((el, idx) => {
      el.classList.add("scroll-item", "will-animate");
      el.style.setProperty("--stagger", String(idx % 5));
      targets.push(el);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          if (entry.isIntersecting) {
            // Restart animation smoothly every time it enters
            el.classList.remove("in-view", "ready-replay");
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.classList.add("in-view", "seen", "will-animate");
              });
            });
            return;
          }

          const rect = entry.boundingClientRect;
          const fullyAbove = rect.bottom <= 0;
          const fullyBelow = rect.top >= window.innerHeight;
          if (fullyAbove || fullyBelow) {
            el.classList.remove("in-view");
            el.classList.add("ready-replay", "will-animate");
            el.dataset.enterFrom = fullyAbove ? "top" : "bottom";
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -2% 0px" }
    );

    window.__scrollAnimObserver = observer;
    targets.forEach((el) => observer.observe(el));
  }

  function setEditing(on) {
    if (!on) {
      syncEditableToState();
      fabVisible = false;
    }
    editing = on;
    applyEditMode();
    if (editing) {
      app.querySelectorAll(".scroll-section, .scroll-item, .project-feature, .project-card").forEach((el) => {
        el.classList.add("in-view");
      });
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

    document.querySelectorAll(".drag-handle, .project-edit-tools, .cta-edit-row, .contact-edit-fields, .gallery-remove, .gallery-add, .hero-photo-actions, .hero-line-handle, .hero-photo-resize, .gallery-resize, .gallery-size").forEach((el) => {
      el.hidden = !editing;
    });

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
      const text = el.innerText.replace(/\u00a0/g, " ").trimEnd();
      setByPath(path, text, true);
    });
    if (logoEl) {
      state.logo = logoEl.innerText.trim();
    }
    if (footerNameEl) {
      state.footerName = footerNameEl.innerText.trim();
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
      el.addEventListener("blur", () => {
        if (!editing) return;
        const text = el.innerText.replace(/\u00a0/g, " ").trimEnd();
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
      logoEl.onblur = () => {
        if (!editing) return;
        state.logo = logoEl.innerText.trim();
        queueDirty();
      };
    }
    if (footerNameEl) {
      footerNameEl.onblur = () => {
        if (!editing) return;
        state.footerName = footerNameEl.innerText.trim();
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
          project.photos = [...(project.photos || []), ...urls];
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
      btn.addEventListener("click", () => {
        const id = btn.dataset.galPrev || btn.dataset.galNext;
        const track = app.querySelector(`[data-gallery="${id}"] .gallery-track`);
        if (!track) return;
        const dir = btn.dataset.galPrev ? -1 : 1;
        track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: "smooth" });
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
      const open = () => openLightbox(slide.dataset.project, Number(slide.dataset.index));
      slide.addEventListener("click", (e) => {
        if (e.target.closest(".gallery-remove, .gallery-resize, .photo-pick, .gallery-size, input, button.editor-btn")) return;
        e.preventDefault();
        open();
      });
      slide.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    app.querySelectorAll("[data-featured]").forEach((input) => {
      input.addEventListener("change", () => {
        const project = state.projects.items.find((p) => p.id === input.dataset.featured);
        if (!project) return;
        project.featured = input.checked;
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

  let dragState = null;

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

  function openLightbox(projectId, index) {
    const project = state.projects.items.find((p) => p.id === projectId);
    if (!project || !project.photos || !project.photos.length) return;
    const safeIndex = ((Number(index) % project.photos.length) + project.photos.length) % project.photos.length;
    lightbox = { projectId, index: safeIndex };
    const lb = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const prev = document.getElementById("lightbox-prev");
    const next = document.getElementById("lightbox-next");
    const counter = document.getElementById("lightbox-counter");
    img.src = project.photos[safeIndex];
    img.alt = `${project.title} photo ${safeIndex + 1}`;
    if (counter) counter.textContent = `${safeIndex + 1} / ${project.photos.length}`;
    const multi = project.photos.length > 1;
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
  }

  function stepLightbox(dir) {
    const project = state.projects.items.find((p) => p.id === lightbox.projectId);
    if (!project || !project.photos.length) return;
    lightbox.index = (lightbox.index + dir + project.photos.length) % project.photos.length;
    openLightbox(lightbox.projectId, lightbox.index);
  }

  document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
  document.getElementById("lightbox-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    stepLightbox(-1);
  });
  document.getElementById("lightbox-next").addEventListener("click", (e) => {
    e.stopPropagation();
    stepLightbox(1);
  });
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox" || e.target.classList.contains("lightbox-backdrop")) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    const lb = document.getElementById("lightbox");
    if (!lb || lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  if (logoEl) {
    logoEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (editing) return;
      fabVisible = !fabVisible;
      applyEditMode();
    });
  }

  document.getElementById("back-to-top")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelectorAll('a[href="#top"]').forEach((link) => {
    if (link.id === "back-to-top") return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  btnEdit.addEventListener("click", () => setEditing(true));
  btnDone.addEventListener("click", async () => {
    syncEditableToState();
    await saveState();
    setEditing(false);
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
    state = clone(window.PORTFOLIO_DEFAULTS);
    dirty = false;
    render();
    if (editing) setEditing(true);
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
      state = normalizeState(parsed);
      dirty = true;
      await saveState();
      render();
      if (editing) setEditing(true);
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
    render();
  }

  boot();
})();
