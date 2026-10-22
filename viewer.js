(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    seriesList: $("series-list"),
    patientName: $("patient-name"),
    studyMeta: $("study-meta"),
    seriesLabel: $("series-label"),
    sliceCounter: $("slice-counter"),
    img: $("slice-img"),
    slider: $("slice-slider"),
    prevBtn: $("prev-btn"),
    nextBtn: $("next-btn"),
    sidebar: $("sidebar"),
    sidebarToggle: $("sidebar-toggle"),
    brightness: $("brightness"),
    contrast: $("contrast"),
    invertBtn: $("invert-btn"),
    resetBtn: $("reset-btn"),
    hint: $("hint"),
    pathReadout: $("path-readout"),
    dropzone: $("dropzone"),
    pickBtn: $("pick-btn"),
    openBtn: $("open-btn"),
    folderInput: $("folder-input"),
    manifestLink: $("manifest-link"),
    stage: $("image-stage"),
  };

  // series: [{id, index, folder, label, orientation, kind, count, files:[name], urlFor(i)}]
  let data = null;
  let state = { seriesId: null, slice: 0 };
  let inverted = false;
  let objectUrls = new Map(); // series id -> Map(slice -> blob url), local-folder mode only

  const IMG_RE = /\.(jpe?g|png)$/i;
  const ORIENTATION = { ax: "Axial", sag: "Sagittal", cor: "Coronal" };

  // ---------- data sources ----------
  function parseFolderName(name) {
    const m = /^(\d+)_(.*)$/.exec(name);
    return m ? { index: parseInt(m[1], 10), rest: m[2] } : { index: 999, rest: name };
  }

  function guessOrientation(rest) {
    const low = rest.toLowerCase();
    for (const key of Object.keys(ORIENTATION)) {
      if (new RegExp("(^|[^a-z])" + key + "([^a-z]|$)").test(low)) return ORIENTATION[key];
    }
    return null;
  }

  function classify(rest, count) {
    const low = rest.toLowerCase();
    if (count === 1 && low.includes("protocol")) return "document";
    return low.includes("topogram") ? "topogram" : "series";
  }

  function fromManifest(m) {
    const series = m.series.map((s) => ({
      ...s,
      urlFor: (i) => encodeURIComponent(s.folder) + "/" + encodeURIComponent(s.files[i]),
    }));
    return { title: m.generatedFrom || "CT study", series, total: m.totalImages, mode: "server" };
  }

  // fileEntries: [{ folder, name, file }]
  function fromFiles(fileEntries, title) {
    const byFolder = new Map();
    for (const e of fileEntries) {
      if (!IMG_RE.test(e.name)) continue;
      if (!byFolder.has(e.folder)) byFolder.set(e.folder, []);
      byFolder.get(e.folder).push(e);
    }
    const series = [];
    for (const [folder, list] of byFolder) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const { index, rest } = parseFolderName(folder);
      const id = "s" + String(index).padStart(2, "0");
      const s = {
        id, index, folder,
        label: rest.trim() || folder,
        orientation: guessOrientation(rest),
        kind: classify(rest, list.length),
        count: list.length,
        files: list.map((e) => e.name),
        urlFor(i) {
          let cache = objectUrls.get(s.id);
          if (!cache) { cache = new Map(); objectUrls.set(s.id, cache); }
          if (!cache.has(i)) cache.set(i, URL.createObjectURL(list[i].file));
          return cache.get(i);
        },
      };
      series.push(s);
    }
    series.sort((a, b) => a.index - b.index || a.folder.localeCompare(b.folder));
    // guarantee unique ids if two folders share the same numeric prefix
    const seen = new Set();
    series.forEach((s) => { while (seen.has(s.id)) s.id += "b"; seen.add(s.id); });
    return {
      title, series,
      total: series.reduce((n, s) => n + s.count, 0),
      mode: "local",
    };
  }

  function revokeAllUrls() {
    objectUrls.forEach((cache) => cache.forEach((u) => URL.revokeObjectURL(u)));
    objectUrls = new Map();
  }

  function filesFromInput(fileList) {
    const out = [];
    let root = "";
    for (const f of fileList) {
      const parts = (f.webkitRelativePath || f.name).split("/");
      if (!root && parts.length > 1) root = parts[0];
      out.push({ folder: parts.length > 1 ? parts[parts.length - 2] : "", name: f.name, file: f });
    }
    return { out, root };
  }

  // Recursively read a dropped directory.
  async function walkEntry(entry, parentName, acc) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      acc.push({ folder: parentName, name: entry.name, file });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walkEntry(child, entry.name, acc);
      } while (batch.length);
    }
  }

  async function filesFromDrop(dataTransfer) {
    const acc = [];
    let root = "";
    const entries = [];
    for (const item of dataTransfer.items) {
      const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (entries.length === 1 && entries[0].isDirectory) root = entries[0].name;
    for (const entry of entries) await walkEntry(entry, "", acc);
    return { out: acc, root };
  }

  // ---------- rendering ----------
  const seriesById = (id) => data && data.series.find((s) => s.id === id);

  function updateUrl() {
    const params = new URLSearchParams();
    if (state.seriesId) params.set("series", state.seriesId);
    params.set("slice", String(state.slice + 1));
    history.replaceState(null, "", "?" + params.toString());
  }

  function applyFilters() {
    const inv = inverted ? " invert(1)" : "";
    el.img.style.filter = `brightness(${el.brightness.value}%) contrast(${el.contrast.value}%)${inv}`;
  }

  function renderSeriesList() {
    el.seriesList.textContent = "";
    data.series.forEach((s) => {
      const item = document.createElement("div");
      item.className = "series-item" + (s.id === state.seriesId ? " active" : "");
      item.dataset.id = s.id;

      const row1 = document.createElement("div");
      row1.className = "row1";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = s.label;
      const count = document.createElement("div");
      count.className = "count";
      count.textContent = s.count;
      row1.append(label, count);

      const row2 = document.createElement("div");
      row2.className = "row1";
      const idx = document.createElement("div");
      idx.className = "idx";
      idx.textContent = s.folder;
      row2.append(idx);

      item.append(row1, row2);
      if (s.orientation) {
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = s.orientation + (s.kind === "document" ? " · doc" : "");
        item.append(badge);
      }
      item.addEventListener("click", () => selectSeries(s.id, 0));
      el.seriesList.append(item);
    });
  }

  function selectSeries(id, slice) {
    const s = seriesById(id);
    if (!s) return;
    state.seriesId = id;
    state.slice = Math.min(Math.max(slice || 0, 0), s.count - 1);
    document.querySelectorAll(".series-item").forEach((n) => {
      n.classList.toggle("active", n.dataset.id === id);
    });
    el.slider.max = String(s.count - 1);
    el.seriesLabel.textContent = s.label + "  (" + s.folder + ")";
    renderSlice();
  }

  function renderSlice() {
    const s = seriesById(state.seriesId);
    if (!s) return;
    el.img.src = s.urlFor(state.slice);
    el.slider.value = String(state.slice);
    el.sliceCounter.textContent = (state.slice + 1) + " / " + s.count;
    el.pathReadout.textContent = s.folder + "/" + s.files[state.slice];
    updateUrl();
    [state.slice - 1, state.slice + 1].forEach((i) => {
      if (i >= 0 && i < s.count) new Image().src = s.urlFor(i);
    });
  }

  function step(delta) {
    const s = seriesById(state.seriesId);
    if (!s) return;
    const next = state.slice + delta;
    if (next < 0 || next >= s.count) return;
    state.slice = next;
    renderSlice();
  }

  function stepSeries(delta) {
    const idx = data.series.findIndex((s) => s.id === state.seriesId);
    const next = idx + delta;
    if (next >= 0 && next < data.series.length) selectSeries(data.series[next].id, 0);
  }

  function loadData(d, wantSeries, wantSlice) {
    if (!d.series.length) {
      alert("Nu am găsit imagini (.jpg/.png) în folderul ales.");
      return;
    }
    data = d;
    el.dropzone.hidden = true;
    el.patientName.textContent = d.title;
    el.studyMeta.textContent = d.series.length + " serii · " + d.total + " imagini";
    el.manifestLink.hidden = d.mode !== "server";
    renderSeriesList();
    const first = (wantSeries && seriesById(wantSeries)) ? wantSeries
      : (d.series.find((s) => s.kind === "series") || d.series[0]).id;
    selectSeries(first, wantSlice ? wantSlice - 1 : 0);
  }

  async function openFolder(result) {
    revokeAllUrls();
    loadData(fromFiles(result.out, result.root || "CT study"));
  }

  // ---------- events ----------
  el.prevBtn.addEventListener("click", () => step(-1));
  el.nextBtn.addEventListener("click", () => step(1));
  el.slider.addEventListener("input", () => { state.slice = Number(el.slider.value); renderSlice(); });
  el.brightness.addEventListener("input", applyFilters);
  el.contrast.addEventListener("input", applyFilters);
  el.invertBtn.addEventListener("click", () => {
    inverted = !inverted;
    el.invertBtn.classList.toggle("on", inverted);
    applyFilters();
  });
  el.resetBtn.addEventListener("click", () => {
    el.brightness.value = 100;
    el.contrast.value = 100;
    inverted = false;
    el.invertBtn.classList.remove("on");
    applyFilters();
  });
  el.sidebarToggle.addEventListener("click", () => el.sidebar.classList.toggle("collapsed"));

  el.stage.addEventListener("wheel", (e) => {
    if (!data) return;
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (!data || e.target.tagName === "INPUT") return;
    const s = seriesById(state.seriesId);
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": step(1); break;
      case "ArrowLeft": case "ArrowUp": step(-1); break;
      case "PageDown": step(10); break;
      case "PageUp": step(-10); break;
      case "Home": state.slice = 0; renderSlice(); break;
      case "End": if (s) { state.slice = s.count - 1; renderSlice(); } break;
      case "]": stepSeries(1); break;
      case "[": stepSeries(-1); break;
      default: return;
    }
    e.preventDefault();
  });

  const pick = () => el.folderInput.click();
  el.pickBtn.addEventListener("click", pick);
  el.openBtn.addEventListener("click", pick);
  el.folderInput.addEventListener("change", () => {
    if (el.folderInput.files.length) openFolder(filesFromInput(el.folderInput.files));
    el.folderInput.value = "";
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length) {
      openFolder(await filesFromDrop(e.dataTransfer));
    }
  });

  setTimeout(() => el.hint.classList.add("hidden"), 4000);

  // ---------- programmatic API (for LLM agents driving the page via a browser tool) ----------
  window.CTViewer = {
    listSeries: () => data ? data.series.map((s) => ({
      id: s.id, folder: s.folder, label: s.label, orientation: s.orientation, kind: s.kind, count: s.count,
    })) : [],
    getState: () => {
      const s = seriesById(state.seriesId);
      return s ? { series: s.id, folder: s.folder, slice: state.slice + 1, count: s.count, file: s.files[state.slice] } : null;
    },
    goTo: (seriesId, slice) => { selectSeries(seriesId, (slice || 1) - 1); return window.CTViewer.getState(); },
    step: (delta) => { step(delta || 1); return window.CTViewer.getState(); },
  };

  // ---------- init ----------
  const params = new URLSearchParams(location.search);
  fetch("manifest.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((m) => loadData(fromManifest(m), params.get("series"), Number(params.get("slice")) || 0))
    .catch(() => { el.dropzone.hidden = false; });
})();
