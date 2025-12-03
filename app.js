// LoopOS · SystemFlow Edition
// Lokale PWA mit Kernel-Autopilot (regelbasiert, offline)

// ---------- STORAGE KEYS ----------

const STORAGE_KEYS = {
  LOOPS: "loopos_loops",
  ENTRIES: "loopos_entries",
  IDEAS: "loopos_ideas",
  MODE: "loopos_mode",
};

const FOCUS_STORAGE_KEY = "loopos_focus_timer";
const KERNEL_STORAGE_KEY = "loopos_kernel_state";

// ---------- APP STATE ----------

let loops = [];
let entries = [];
let ideas = [];
let mode = "operator";
let showOnlyOpenLoops = true;

// Fokus-Timer State
const defaultFocusState = {
  minutes: 25,
  remainingSec: 25 * 60,
  running: false,
  endTs: null,
  notifications: false,
  loopId: "",
};

let focusState = { ...defaultFocusState };
let focusTimerId = null;

// Kernel / Autopilot State
const KERNEL_MODES = {
  OPERATOR: "operator",
  OVERLOAD: "overload",
  RECOVERY: "recovery",
};

let kernelState = {
  mode: KERNEL_MODES.OPERATOR,
  overload: 20,
  momentum: 40,
  shutdown: 10,
  lastEventAt: Date.now(),
};

// ---------- INIT ----------

document.addEventListener("DOMContentLoaded", () => {
  initState();
  initTabs();
  initLoopSection();
  initEntrySection();
  initModeSection();
  initIdeaSection();
  initFocusSection();
  initKernel(); // Kernel-UI & Autopilot
  registerServiceWorker();
});

// ---------- GENERIC STORAGE ----------

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Storage read error for", key, e);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Storage write error for", key, e);
  }
}

// ---------- APP STATE INIT ----------

function initState() {
  loops = readStorage(STORAGE_KEYS.LOOPS, []);
  entries = readStorage(STORAGE_KEYS.ENTRIES, []);
  ideas = readStorage(STORAGE_KEYS.IDEAS, []);
  mode = readStorage(STORAGE_KEYS.MODE, "operator");
  kernelState = loadKernelState();

  renderLoops();
  renderEntries();
  renderMode();
  renderIdeas();
}

// ---------- TABS ----------

function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = {
    loops: document.getElementById("tab-loops"),
    belege: document.getElementById("tab-belege"),
    modus: document.getElementById("tab-modus"),
    ideen: document.getElementById("tab-ideen"),
    focus: document.getElementById("tab-focus"),
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        panel.classList.toggle("active", name === tab);
      });
      kernelEvent("TAB_SWITCH", { tab });
    });
  });
}

// ---------- LOOPS ----------

function initLoopSection() {
  const form = document.getElementById("loop-form");
  const toggleBtn = document.getElementById("toggle-loops-view");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleEl = document.getElementById("loop-title");
    const critEl = document.getElementById("loop-criterion");
    const title = titleEl.value.trim();
    const criterion = critEl.value.trim();

    if (!title) return;

    const loop = {
      id: Date.now().toString(),
      title,
      criterion: criterion || "",
      status: "open",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    loops.unshift(loop);
    writeStorage(STORAGE_KEYS.LOOPS, loops);
    titleEl.value = "";
    critEl.value = "";
    renderLoops();
    kernelEvent("LOOP_ADDED");
  });

  toggleBtn.addEventListener("click", () => {
    showOnlyOpenLoops = !showOnlyOpenLoops;
    toggleBtn.textContent = showOnlyOpenLoops
      ? "Nur offene / alle"
      : "Alle / nur offene";
    renderLoops();
  });
}

function renderLoops() {
  const container = document.getElementById("loop-list");
  container.innerHTML = "";

  const list = showOnlyOpenLoops
    ? loops.filter((l) => l.status === "open")
    : loops;

  if (!list.length) {
    container.innerHTML =
      '<li class="item-meta">Keine Loops in dieser Ansicht.</li>';
    return;
  }

  list.forEach((loop) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = loop.title;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const created = new Date(loop.createdAt);
    meta.textContent =
      (loop.status === "done" ? "Abgeschlossen" : "Angelegt") +
      " · " +
      created.toLocaleDateString();

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";

    if (loop.criterion) {
      const crit = document.createElement("div");
      crit.textContent = "Abschluss-Kriterium: " + loop.criterion;
      body.appendChild(crit);
    }

    if (loop.completedAt) {
      const done = document.createElement("div");
      done.className = "item-meta";
      done.textContent =
        "Fertig: " + new Date(loop.completedAt).toLocaleString();
      body.appendChild(done);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const statusChip = document.createElement("span");
    statusChip.className = "chip " + (loop.status === "done" ? "done" : "");
    statusChip.textContent =
      loop.status === "done" ? "Abgeschlossen" : "Offen";
    actions.appendChild(statusChip);

    if (loop.status === "open") {
      const completeBtn = document.createElement("button");
      completeBtn.className = "ghost-btn";
      completeBtn.textContent = "Loop schließen";
      completeBtn.addEventListener("click", () => completeLoop(loop.id));
      actions.appendChild(completeBtn);
    } else {
      const reopenBtn = document.createElement("button");
      reopenBtn.className = "ghost-btn";
      reopenBtn.textContent = "Wieder öffnen";
      reopenBtn.addEventListener("click", () => reopenLoop(loop.id));
      actions.appendChild(reopenBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost-btn";
    deleteBtn.textContent = "Löschen";
    deleteBtn.addEventListener("click", () => deleteLoop(loop.id));
    actions.appendChild(deleteBtn);

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(actions);
    container.appendChild(li);
  });

  updateFocusLoopSelect();
}

function completeLoop(id) {
  const loop = loops.find((l) => l.id === id);
  if (!loop) return;
  loop.status = "done";
  loop.completedAt = new Date().toISOString();
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
  kernelEvent("LOOP_COMPLETED");
}

function reopenLoop(id) {
  const loop = loops.find((l) => l.id === id);
  if (!loop) return;
  loop.status = "open";
  loop.completedAt = null;
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
  kernelEvent("LOOP_REOPENED");
}

function deleteLoop(id) {
  loops = loops.filter((l) => l.id !== id);
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
  kernelEvent("LOOP_DELETED");
}

// ---------- ENTRIES (BELEGE) ----------

function initEntrySection() {
  const form = document.getElementById("entry-form");
  const dateField = document.getElementById("entry-date");
  const clearBtn = document.getElementById("clear-entries");

  // Default date = today
  dateField.value = new Date().toISOString().slice(0, 10);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = dateField.value || new Date().toISOString().slice(0, 10);
    const outputEl = document.getElementById("entry-output");
    const fulfilledEl = document.getElementById("entry-fulfilled");

    const output = outputEl.value.trim();
    if (!output) return;

    const entry = {
      id: Date.now().toString(),
      date,
      output,
      fulfilled: !!fulfilledEl.checked,
    };

    entries.unshift(entry);
    writeStorage(STORAGE_KEYS.ENTRIES, entries);
    outputEl.value = "";
    fulfilledEl.checked = false;
    renderEntries();
    kernelEvent("ENTRY_ADDED", { fulfilled: entry.fulfilled });
  });

  clearBtn.addEventListener("click", () => {
    if (!entries.length) return;
    const asText = entries
      .map(
        (e) =>
          `${e.date} | ${e.output} | Zweck erfüllt: ${
            e.fulfilled ? "Ja" : "Nein"
          }`
      )
      .join("\n");
    const blob = new Blob([asText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loopos-belege.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (confirm("Belege wirklich lokal leeren?")) {
      entries = [];
      writeStorage(STORAGE_KEYS.ENTRIES, entries);
      renderEntries();
      kernelEvent("ENTRIES_CLEARED");
    }
  });
}

function renderEntries() {
  const container = document.getElementById("entry-list");
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML =
      '<li class="item-meta">Noch keine Belege. Kleine Schritte zählen.</li>';
    return;
  }

  entries.forEach((e) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = e.output;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = e.date;

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";
    const status = document.createElement("span");
    status.className = "chip " + (e.fulfilled ? "done" : "");
    status.textContent = e.fulfilled
      ? "Zweck erfüllt"
      : "Noch offen im System";
    body.appendChild(status);

    li.appendChild(header);
    li.appendChild(body);
    container.appendChild(li);
  });
}

// ---------- MODE ----------

function initModeSection() {
  const buttons = document.querySelectorAll(".chip-toggle[data-mode]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const newMode = btn.dataset.mode;
      setMode(newMode);
      buttons.forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === newMode)
      );
    });
  });
}

function setMode(newMode) {
  mode = newMode === "overload" ? "overload" : "operator";
  writeStorage(STORAGE_KEYS.MODE, mode);
  renderMode();
  kernelEvent("MODE_CHANGED", { mode });
}

function renderMode() {
  const modeLabel = document.getElementById("mode-label");
  const modeDesc = document.getElementById("mode-description");
  const buttons = document.querySelectorAll(".chip-toggle[data-mode]");

  if (!modeDesc) return;

  if (mode === "operator") {
    if (modeLabel) modeLabel.textContent = "Modus: Operator";
    modeDesc.textContent =
      "Operator: Klar, strukturiert, Loops schließen, Systeme stabilisieren.";
  } else {
    if (modeLabel) modeLabel.textContent = "Modus: Überlast";
    modeDesc.textContent =
      "Überlast: Zu viele Reize, zu viele Loops. Kleine Schritte, nichts Großes planen.";
  }

  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
}

// ---------- IDEAS ----------

function initIdeaSection() {
  const form = document.getElementById("idea-form");
  const exportBtn = document.getElementById("export-ideas");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleEl = document.getElementById("idea-title");
    const notesEl = document.getElementById("idea-notes");
    const title = titleEl.value.trim();
    const notesRaw = notesEl.value.trim();

    if (!title) return;

    const idea = {
      id: Date.now().toString(),
      title,
      notes: notesRaw,
      createdAt: new Date().toISOString(),
    };

    ideas.unshift(idea);
    writeStorage(STORAGE_KEYS.IDEAS, ideas);
    titleEl.value = "";
    notesEl.value = "";
    renderIdeas();
    kernelEvent("IDEA_ADDED");
  });

  exportBtn.addEventListener("click", () => {
    if (!ideas.length) return;
    const asText = ideas
      .map(
        (i) =>
          `${new Date(i.createdAt).toLocaleString()} | ${i.title}\n${
            i.notes || ""
          }`
      )
      .join("\n\n---\n\n");
    const blob = new Blob([asText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loopos-ideen.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    kernelEvent("IDEAS_EXPORTED");
  });
}

function renderIdeas() {
  const container = document.getElementById("idea-list");
  container.innerHTML = "";

  if (!ideas.length) {
    container.innerHTML =
      '<li class="item-meta">Noch keine geparkten Ideen. Gut – weniger offene Loops.</li>';
    return;
  }

  ideas.forEach((idea) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = idea.title;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent =
      "Geparkt am " + new Date(idea.createdAt).toLocaleDateString();

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";

    if (idea.notes) {
      const notes = document.createElement("div");
      notes.className = "idea-notes";
      notes.textContent = idea.notes;
      body.appendChild(notes);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Entfernen";
    removeBtn.addEventListener("click", () => {
      ideas = ideas.filter((i) => i.id !== idea.id);
      writeStorage(STORAGE_KEYS.IDEAS, ideas);
      renderIdeas();
      kernelEvent("IDEA_REMOVED");
    });
    actions.appendChild(removeBtn);

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(actions);
    container.appendChild(li);
  });
}

// ---------- FOKUS-TIMER ----------

function initFocusSection() {
  const minutesInput = document.getElementById("focus-minutes");
  const displayEl = document.getElementById("focus-display");
  const startBtn = document.getElementById("focus-start");
  const pauseBtn = document.getElementById("focus-pause");
  const resetBtn = document.getElementById("focus-reset");
  const notifyBtn = document.getElementById("focus-notify-btn");
  const notifyLabel = document.getElementById("focus-notify-label");
  const loopSelect = document.getElementById("focus-loop-select");

  if (!displayEl) return;

  loadFocusState();
  updateFocusLoopSelect();

  if (minutesInput) {
    minutesInput.value = focusState.minutes;
    minutesInput.addEventListener("change", () => {
      let m = parseInt(minutesInput.value, 10);
      if (Number.isNaN(m) || m < 5) m = 5;
      if (m > 120) m = 120;
      focusState.minutes = m;

      if (!focusState.running) {
        focusState.remainingSec = m * 60;
      }

      minutesInput.value = m;
      saveFocusState();
      renderFocusTimer(displayEl);
    });
  }

  restoreFocusTimer(displayEl);

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startFocusTimer(displayEl);
      kernelEvent("FOCUS_STARTED");
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      pauseFocusTimer();
      renderFocusTimer(displayEl);
      kernelEvent("FOCUS_PAUSED");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFocusTimer();
      renderFocusTimer(displayEl);
      kernelEvent("FOCUS_RESET");
    });
  }

  if (notifyBtn && notifyLabel) {
    notifyBtn.addEventListener("click", () => {
      if (!("Notification" in window)) {
        notifyLabel.textContent = "Benachrichtigung nicht verfügbar";
        return;
      }

      if (Notification.permission === "granted") {
        focusState.notifications = !focusState.notifications;
        saveFocusState();
        updateFocusNotifyUI(notifyBtn, notifyLabel);
      } else {
        Notification.requestPermission().then(() => {
          focusState.notifications = Notification.permission === "granted";
          saveFocusState();
          updateFocusNotifyUI(notifyBtn, notifyLabel);
        });
      }
    });

    updateFocusNotifyUI(notifyBtn, notifyLabel);
  }

  if (loopSelect) {
    loopSelect.addEventListener("change", () => {
      focusState.loopId = loopSelect.value || "";
      saveFocusState();
    });

    if (focusState.loopId) {
      loopSelect.value = focusState.loopId;
    }
  }

  renderFocusTimer(displayEl);
}

function updateFocusLoopSelect() {
  const select = document.getElementById("focus-loop-select");
  if (!select) return;

  const openLoops = loops.filter((l) => l.status === "open");
  const prevId = focusState.loopId || "";

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = openLoops.length
    ? "-- Bitte wählen --"
    : "Keine offenen Loops";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  openLoops.forEach((loop) => {
    const option = document.createElement("option");
    option.value = loop.id;
    option.textContent = loop.title;
    select.appendChild(option);
  });

  if (openLoops.some((l) => l.id === prevId)) {
    select.value = prevId;
    placeholder.selected = false;
  } else {
    if (focusState.loopId) {
      focusState.loopId = "";
      saveFocusState();
    }
    select.value = "";
  }

  select.disabled = openLoops.length === 0;
}

function loadFocusState() {
  try {
    const raw = localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) {
      focusState = { ...defaultFocusState };
      return;
    }
    const parsed = JSON.parse(raw);
    focusState = {
      ...defaultFocusState,
      ...parsed,
    };
  } catch {
    focusState = { ...defaultFocusState };
  }
}

function saveFocusState() {
  try {
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusState));
  } catch {}
}

function formatFocusTime(sec) {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function renderFocusTimer(displayEl) {
  if (!displayEl) return;
  displayEl.textContent = formatFocusTime(focusState.remainingSec);
}

function startFocusTimer(displayEl) {
  if (focusState.running) return;

  const now = Date.now();
  if (!focusState.endTs) {
    focusState.endTs = now + focusState.remainingSec * 1000;
  }

  focusState.running = true;
  saveFocusState();

  clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    const now = Date.now();
    const remaining = Math.round((focusState.endTs - now) / 1000);

    if (remaining <= 0) {
      focusState.remainingSec = 0;
      focusState.running = false;
      focusState.endTs = null;
      saveFocusState();
      renderFocusTimer(displayEl);
      clearInterval(focusTimerId);
      focusTimerId = null;
      handleFocusFinished();
      return;
    }

    focusState.remainingSec = remaining;
    renderFocusTimer(displayEl);
    saveFocusState();
  }, 1000);
}

function pauseFocusTimer() {
  if (!focusState.running) return;
  focusState.running = false;
  focusState.endTs = null;
  clearInterval(focusTimerId);
  focusTimerId = null;
  saveFocusState();
}

function resetFocusTimer() {
  pauseFocusTimer();
  focusState.remainingSec = focusState.minutes * 60;
  focusState.endTs = null;
  saveFocusState();
}

function restoreFocusTimer(displayEl) {
  if (!focusState.running || !focusState.endTs) {
    renderFocusTimer(displayEl);
    return;
  }

  const now = Date.now();
  const remaining = Math.round((focusState.endTs - now) / 1000);

  if (remaining <= 0) {
    focusState.remainingSec = 0;
    focusState.running = false;
    focusState.endTs = null;
    saveFocusState();
    renderFocusTimer(displayEl);
    handleFocusFinished();
    return;
  }

  focusState.remainingSec = remaining;
  renderFocusTimer(displayEl);

  clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    const now = Date.now();
    const remaining = Math.round((focusState.endTs - now) / 1000);

    if (remaining <= 0) {
      focusState.remainingSec = 0;
      focusState.running = false;
      focusState.endTs = null;
      saveFocusState();
      renderFocusTimer(displayEl);
      clearInterval(focusTimerId);
      focusTimerId = null;
      handleFocusFinished();
      return;
    }

    focusState.remainingSec = remaining;
    renderFocusTimer(displayEl);
    saveFocusState();
  }, 1000);
}

function updateFocusNotifyUI(btn, label) {
  if (!("Notification" in window)) {
    btn.classList.add("disabled");
    label.textContent = "Benachrichtigung nicht verfügbar";
    return;
  }

  if (Notification.permission === "denied") {
    btn.classList.remove("active");
    label.textContent = "Benachrichtigungen blockiert";
    return;
  }

  if (focusState.notifications && Notification.permission === "granted") {
    btn.classList.add("active");
    label.textContent = "Benachrichtigungen: An";
  } else {
    btn.classList.remove("active");
    label.textContent = "Benachrichtigungen: Aus";
  }
}

function handleFocusFinished() {
  playGentleChime();
  showFocusNotification();
  kernelEvent("FOCUS_FINISHED");

  try {
    const original = document.title || "LoopOS";
    document.title = "⏱ Fokusblock fertig · LoopOS";
    setTimeout(() => {
      document.title = original;
    }, 8000);
  } catch {}
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const freqs = [880, 660, 880]; // drei sanfte Töne
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      const start = ctx.currentTime + i * 0.25;
      const end = start + 0.22;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, end);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(end);
    });

    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    // leise scheitern
  }
}

function showFocusNotification() {
  if (!focusState.notifications) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification("Fokusblock fertig", {
      body: "Einmal durchatmen – diesen Loop bewusst schließen.",
      icon: "./icon-192.png",
    });
  } catch (e) {
    // egal
  }
}

// ---------- KERNEL / AUTOPILOT (regelbasiert, lokal) ----------

function loadKernelState() {
  try {
    const raw = localStorage.getItem(KERNEL_STORAGE_KEY);
    if (!raw) return { ...kernelState };
    const parsed = JSON.parse(raw);
    return {
      ...kernelState,
      ...parsed,
    };
  } catch {
    return { ...kernelState };
  }
}

function saveKernelState() {
  try {
    localStorage.setItem(KERNEL_STORAGE_KEY, JSON.stringify(kernelState));
  } catch {}
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function initKernel() {
  const core = document.getElementById("kernel-core");
  if (core) {
    core.addEventListener("click", () => {
      // Manuelles "Ping" an den Autopiloten
      runKernelAutopilot("MANUAL_PING");
    });
  }
  renderKernel();
  runKernelAutopilot("INIT");
}

function kernelEvent(type, payload = {}) {
  // Score-Änderungen nach Event
  switch (type) {
    case "LOOP_ADDED":
      kernelState.momentum = clamp(kernelState.momentum + 4, 0, 100);
      kernelState.overload = clamp(kernelState.overload + 2, 0, 100);
      break;
    case "LOOP_COMPLETED":
      kernelState.momentum = clamp(kernelState.momentum + 10, 0, 100);
      kernelState.overload = clamp(kernelState.overload - 8, 0, 100);
      kernelState.shutdown = clamp(kernelState.shutdown - 4, 0, 100);
      break;
    case "LOOP_REOPENED":
      kernelState.overload = clamp(kernelState.overload + 3, 0, 100);
      break;
    case "ENTRY_ADDED":
      kernelState.momentum = clamp(
        kernelState.momentum + (payload.fulfilled ? 8 : 3),
        0,
        100
      );
      break;
    case "ENTRIES_CLEARED":
      kernelState.shutdown = clamp(kernelState.shutdown - 5, 0, 100);
      break;
    case "IDEA_ADDED":
      kernelState.overload = clamp(kernelState.overload + 3, 0, 100);
      break;
    case "IDEA_REMOVED":
      kernelState.overload = clamp(kernelState.overload - 4, 0, 100);
      break;
    case "FOCUS_STARTED":
      kernelState.momentum = clamp(kernelState.momentum + 4, 0, 100);
      break;
    case "FOCUS_FINISHED":
      kernelState.momentum = clamp(kernelState.momentum + 12, 0, 100);
      kernelState.overload = clamp(kernelState.overload - 10, 0, 100);
      kernelState.shutdown = clamp(kernelState.shutdown - 6, 0, 100);
      break;
    case "MODE_CHANGED":
      if (payload.mode === "overload") {
        kernelState.mode = KERNEL_MODES.OVERLOAD;
        kernelState.overload = clamp(kernelState.overload + 10, 0, 100);
      } else {
        kernelState.mode = KERNEL_MODES.OPERATOR;
        kernelState.overload = clamp(kernelState.overload - 6, 0, 100);
        kernelState.momentum = clamp(kernelState.momentum + 4, 0, 100);
      }
      break;
    case "TAB_SWITCH":
      // leichtes Rauschen, kein großer Effekt
      break;
    default:
      break;
  }

  kernelState.lastEventAt = Date.now();
  // Passiver Drift Richtung Shutdown, wenn lange nichts passiert
  applyKernelDrift();
  saveKernelState();
  renderKernel();
  runKernelAutopilot(type);
}

function applyKernelDrift() {
  const now = Date.now();
  const diffMin = (now - kernelState.lastEventAt) / (1000 * 60);
  if (diffMin < 10) return;

  const steps = Math.floor(diffMin / 10);
  if (steps <= 0) return;

  kernelState.momentum = clamp(kernelState.momentum - steps * 2, 0, 100);
  kernelState.shutdown = clamp(kernelState.shutdown + steps * 3, 0, 100);
}

// Kernel-Autopilot: generiert kurze Hinweise, ohne API, rein regelbasiert.
function runKernelAutopilot(trigger) {
  const adviceBox = document.getElementById("ai-advice");
  const kernelAdvice = document.getElementById("kernel-advice");
  const overload = kernelState.overload;
  const momentum = kernelState.momentum;
  const shutdown = kernelState.shutdown;
  const mode = kernelState.mode;

  let statusTag = "";
  let adviceText = "";

  // Status-Tag
  if (shutdown >= 70) {
    statusTag = "Energieschutz nötig";
  } else if (overload >= 70) {
    statusTag = "Reizlast hoch";
  } else if (momentum >= 65 && overload <= 40) {
    statusTag = "Guter Fluss";
  } else {
    statusTag = "Stabil";
  }

  // Hinweise
  if (shutdown >= 75) {
    adviceText =
      "Energie kritisch: 3 Minuten System-Reset, dann nur einen winzigen Loop schließen.";
  } else if (overload >= 80) {
    adviceText =
      "Reizlast sehr hoch: keine neuen Loops, nur Unwesentliches parken und ein kleines To-do abschließen.";
  } else if (overload >= 60 && mode === KERNEL_MODES.OVERLOAD) {
    adviceText =
      "Überlast erkannt: Nur kleinstes nächstes Element machen – nichts planen, nichts Großes anfangen.";
  } else if (momentum >= 70 && overload <= 40) {
    adviceText =
      "Momentum gut, System ruhig: Bleib bei genau einem Loop, bis er fertig ist.";
  } else if (momentum <= 30 && overload <= 40) {
    adviceText =
      "Geringes Momentum bei moderater Last: Finde einen 2-Minuten-Loop, um das System in Bewegung zu bringen.";
  } else if (trigger === "FOCUS_FINISHED") {
    adviceText =
      "Fokusblock fertig: Mini-Review, dann bewusst entscheiden, ob du noch einen Loop ziehst oder stoppst.";
  } else {
    adviceText =
      "System okay: Einen Loop sauber definieren, einen Abschluss erreichen, dann neu entscheiden.";
  }

  // Kernel-Modus für UI ableiten (Recovery, wenn Shutdown hoch aber Overload nicht extrem)
  if (shutdown >= 60 && overload <= 50) {
    kernelState.mode = KERNEL_MODES.RECOVERY;
  } else if (mode !== KERNEL_MODES.OVERLOAD) {
    kernelState.mode = KERNEL_MODES.OPERATOR;
  }

  saveKernelState();
  renderKernel(); // visuelles Update mit neuem Mode

  if (kernelAdvice) {
    kernelAdvice.textContent = adviceText;
  }

  if (!adviceBox) return;
  adviceBox.textContent = adviceText;
  adviceBox.classList.add("visible");
  setTimeout(() => {
    adviceBox.classList.remove("visible");
  }, 6500);
}

function renderKernel() {
  const core = document.getElementById("kernel-core");
  const modeLabel = document.getElementById("kernel-mode-label");
  const statusTag = document.getElementById("kernel-status-tag");

  const overloadFill = document.getElementById("metric-overload");
  const momentumFill = document.getElementById("metric-momentum");
  const shutdownFill = document.getElementById("metric-shutdown");

  const overloadVal = document.getElementById("metric-overload-value");
  const momentumVal = document.getElementById("metric-momentum-value");
  const shutdownVal = document.getElementById("metric-shutdown-value");

  const overload = clamp(kernelState.overload, 0, 100);
  const momentum = clamp(kernelState.momentum, 0, 100);
  const shutdown = clamp(kernelState.shutdown, 0, 100);

  if (overloadFill) overloadFill.style.width = `${overload}%`;
  if (momentumFill) momentumFill.style.width = `${momentum}%`;
  if (shutdownFill) shutdownFill.style.width = `${shutdown}%`;

  if (overloadVal) overloadVal.textContent = `${overload}%`;
  if (momentumVal) momentumVal.textContent = `${momentum}%`;
  if (shutdownVal) shutdownVal.textContent = `${shutdown}%`;

  if (core) {
    core.classList.remove("mode-operator", "mode-overload", "mode-recovery");
    if (kernelState.mode === KERNEL_MODES.OPERATOR) {
      core.classList.add("mode-operator");
    } else if (kernelState.mode === KERNEL_MODES.OVERLOAD) {
      core.classList.add("mode-overload");
    } else {
      core.classList.add("mode-recovery");
    }
  }

  if (modeLabel) {
    const text =
      kernelState.mode === KERNEL_MODES.OPERATOR
        ? "Systemmodus: Operator"
        : kernelState.mode === KERNEL_MODES.OVERLOAD
        ? "Systemmodus: Überlast"
        : "Systemmodus: Recovery";
    modeLabel.textContent = text;
  }

  if (statusTag) {
    let label = "Stabil";
    if (shutdown >= 70) label = "Energieschutz";
    else if (overload >= 70) label = "Reizlast hoch";
    else if (momentum >= 65 && overload <= 40) label = "Guter Fluss";
    statusTag.textContent = label;
  }
}

// ---------- SERVICE WORKER ----------

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((err) => console.warn("SW registration failed", err));
  }
}
