// ============================================================
// LOCAL PERSISTENCE
// Everything (tasks, notebook, theme) is saved to localStorage
// so nothing is lost on refresh or tab close. No login needed.
// ============================================================
const STORAGE_KEY = "smart_study_buddy_v2";

function loadSavedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Could not read saved data:", e);
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: state.theme,
      tasks: state.tasks,
      notebookBoxes: state.notebookBoxes,
      weeklyHours: state.weeklyHours,
    }));
  } catch (e) {
    console.warn("Could not save data:", e);
  }
}

// ---------- DEFAULT SAMPLE DATA (used only on first-ever visit) ----------
function demoTask(title, subject, deadlineISO, difficulty, estMinutes, pinned) {
  return {
    id: crypto.randomUUID(),
    title, subject, deadline: deadlineISO, difficulty,
    estMinutes, pinned, completed: false, actualMinutes: 0, notes: "",
  };
}
function hoursFromNow(h) {
  const d = new Date(Date.now() + h * 3600 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

const defaultTasks = [
  demoTask("Chem lab report", "Chemistry", hoursFromNow(6), 5, 120, true),
  demoTask("Calc II problem set 7", "Mathematics", hoursFromNow(20), 4, 90, false),
  demoTask("Spanish vocab quiz prep", "Spanish", hoursFromNow(10), 2, 30, false),
  demoTask("History reading response", "History", hoursFromNow(96), 2, 45, false),
  demoTask("Biology unit test", "Biology", hoursFromNow(30), 5, 75, false),
  demoTask("English essay draft", "English", hoursFromNow(60), 3, 100, false),
  demoTask("Group project slides", "Computer Science", hoursFromNow(150), 3, 60, false),
  demoTask("Weekly gym log", "PE", hoursFromNow(200), 1, 15, false),
];

const saved = loadSavedData();

// ---------- STATE ----------
const state = {
  theme: (saved && saved.theme) || "theme-sunset",
  view: "dashboard",
  filterSubject: "all",
  tasks: (saved && saved.tasks) || defaultTasks,
  notebookBoxes: (saved && saved.notebookBoxes) || [],
  activeBoxId: null,
  activeFont: "sans",
  activeColor: "#1a2433",
  activeTimer: null,
  weeklyHours: (saved && saved.weeklyHours) || [1.2, 2.5, 0.8, 3.1, 2.0, 1.5, 0.6],
};

// ---------- PRIORITY ALGORITHM ----------
// urgencyPoints: closer deadlines score higher, decaying over a 7-day horizon; overdue is capped high.
// difficultyPoints: difficulty (1-5) scaled to weigh in equally with urgency.
// Pinned tasks are always sorted to the very top; priority score still governs order within the rest.
function hoursUntil(iso) {
  return (new Date(iso) - new Date()) / (1000 * 3600);
}
function computePriority(task) {
  const hrs = hoursUntil(task.deadline);
  let urgencyPoints;
  if (hrs <= 0) urgencyPoints = 55; // overdue
  else urgencyPoints = Math.max(0, 50 - (hrs / 168) * 50);
  const difficultyPoints = task.difficulty * 9;
  const score = Math.round(urgencyPoints + difficultyPoints);
  let tier = "low";
  if (hrs <= 0 || (hrs <= 24 && task.difficulty >= 4) || score >= 60) tier = "high";
  else if (score >= 32) tier = "medium";
  return { score, tier, hrs };
}

const TIER_META = {
  high: { label: "urgent", cls: "bg-red-50 text-red-600 border-red-200" },
  medium: { label: "soon", cls: "bg-amber-50 text-amber-600 border-amber-200" },
  low: { label: "later", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
};

function shadeForDifficulty(d) {
  return `var(--shade-${d})`;
}

function fmtCountdown(hrs) {
  if (hrs <= 0) {
    const overdueH = Math.abs(hrs);
    if (overdueH < 1) return `Overdue ${Math.round(overdueH * 60)}m`;
    return `Overdue ${Math.round(overdueH)}h`;
  }
  if (hrs < 1) return `${Math.round(hrs * 60)}m left`;
  if (hrs < 48) return `${Math.round(hrs)}h left`;
  return `${Math.round(hrs / 24)}d left`;
}
function fmtEst(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- RENDER: DASHBOARD ----------
function renderSubjectFilter() {
  const sel = document.getElementById("filterSubject");
  const subjects = [...new Set(state.tasks.map((t) => t.subject))];
  const current = sel.value || "all";
  sel.innerHTML = `<option value="all">All subjects</option>` +
    subjects.map((s) => `<option value="${s}">${s}</option>`).join("");
  sel.value = subjects.includes(current) ? current : "all";
}

function renderTasks() {
  const list = document.getElementById("taskList");
  const empty = document.getElementById("emptyState");
  let tasks = state.tasks.filter((t) => !t.completed);
  if (state.filterSubject !== "all") tasks = tasks.filter((t) => t.subject === state.filterSubject);

  const withScore = tasks.map((t) => ({ t, p: computePriority(t) }));
  withScore.sort((a, b) => {
    if (a.t.pinned !== b.t.pinned) return a.t.pinned ? -1 : 1;
    return b.p.score - a.p.score;
  });

  empty.classList.toggle("hidden", withScore.length > 0);
  list.innerHTML = withScore.map(({ t, p }) => {
    const meta = TIER_META[p.tier];
    return `
    <div class="bg-card rounded-2xl card-shadow p-4 border-l-4" style="border-color:${shadeForDifficulty(t.difficulty)}">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-medium text-[15px] truncate">${escapeHtml(t.title)}</h3>
            ${t.pinned ? '<span class="text-xs">📌</span>' : ""}
          </div>
          <p class="text-xs text-soft mt-0.5">${escapeHtml(t.subject)}</p>
        </div>
        <button class="pin-btn text-lg shrink-0" data-id="${t.id}" title="Pin/unpin">${t.pinned ? "📌" : "📍"}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <span class="text-[11px] border px-2 py-1 rounded-full ${meta.cls}">${fmtCountdown(p.hrs)}</span>
        <span class="text-[11px] px-2 py-1 rounded-full flex items-center gap-1" style="background:var(--shade-1)">
          ${[1,2,3,4,5].map((n) => `<span class="diff-dot ${n <= t.difficulty ? "filled" : ""}"></span>`).join("")}
        </span>
        <span class="text-[11px] px-2 py-1 rounded-full text-soft" style="background:var(--shade-1)">⏱ ${fmtEst(t.estMinutes)}</span>
      </div>
      <div class="flex justify-between items-center mt-3">
        <button class="complete-btn text-xs text-soft underline" data-id="${t.id}">Mark done</button>
        <button class="start-timer-btn text-sm bg-primary text-white px-4 py-1.5 rounded-lg" data-id="${t.id}">Start timer</button>
      </div>
    </div>`;
  }).join("");

  document.querySelectorAll(".pin-btn").forEach((b) => b.onclick = () => togglePin(b.dataset.id));
  document.querySelectorAll(".complete-btn").forEach((b) => b.onclick = () => completeTask(b.dataset.id));
  document.querySelectorAll(".start-timer-btn").forEach((b) => b.onclick = () => openTimer(b.dataset.id));
}

function togglePin(id) {
  const t = state.tasks.find((x) => x.id === id);
  t.pinned = !t.pinned;
  renderTasks();
  persist();
}
function completeTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  t.completed = true;
  renderTasks();
  renderAnalytics();
  persist();
}

// ---------- ADD TASK MODAL ----------
const taskModal = document.getElementById("taskModalBackdrop");
document.getElementById("fabAddTask").onclick = () => {
  taskModal.classList.add("active");
  document.getElementById("taskDeadline").value = hoursFromNow(24);
};
document.getElementById("closeTaskModal").onclick = () => taskModal.classList.remove("active");
document.getElementById("taskDifficulty").oninput = (e) => document.getElementById("diffValue").textContent = e.target.value;

document.getElementById("submitTaskBtn").onclick = () => {
  const title = document.getElementById("taskTitle").value.trim();
  const subject = document.getElementById("taskSubject").value.trim() || "General";
  const deadline = document.getElementById("taskDeadline").value;
  const difficulty = Number(document.getElementById("taskDifficulty").value);
  const hours = Number(document.getElementById("taskHours").value) || 0;
  const minutes = Number(document.getElementById("taskMinutes").value) || 0;
  const notes = document.getElementById("taskNotes").value.trim();
  const errEl = document.getElementById("taskFormError");

  if (!title) { errEl.textContent = "Give the task a name."; errEl.classList.remove("hidden"); return; }
  if (!deadline) { errEl.textContent = "Pick a deadline."; errEl.classList.remove("hidden"); return; }
  errEl.classList.add("hidden");

  state.tasks.push({
    id: crypto.randomUUID(), title, subject, deadline, difficulty,
    estMinutes: hours * 60 + minutes, pinned: false, completed: false, actualMinutes: 0, notes,
  });
  document.getElementById("taskTitle").value = "";
  document.getElementById("taskSubject").value = "";
  document.getElementById("taskNotes").value = "";
  document.getElementById("taskDifficulty").value = 3;
  document.getElementById("diffValue").textContent = 3;
  taskModal.classList.remove("active");
  renderSubjectFilter();
  renderTasks();
  persist();
};

// ---------- TIMER ----------
const timerModal = document.getElementById("timerModalBackdrop");
function openTimer(taskId) {
  const t = state.tasks.find((x) => x.id === taskId);
  const estimateSec = t.estMinutes * 60;
  state.activeTimer = { taskId, remainingSec: estimateSec, elapsedSec: 0, running: false, intervalId: null, estimateSec };
  document.getElementById("timerTaskName").textContent = t.title;
  document.getElementById("timerSubtext").textContent = `Estimated ${fmtEst(t.estMinutes)}`;
  document.getElementById("timerStartPause").textContent = "Start";
  updateTimerDisplay();
  timerModal.classList.add("active");
}
function updateTimerDisplay() {
  const s = state.activeTimer.remainingSec;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  document.getElementById("timerDisplay").textContent =
    [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}
document.getElementById("timerStartPause").onclick = () => {
  const timer = state.activeTimer;
  if (!timer) return;
  timer.running = !timer.running;
  document.getElementById("timerStartPause").textContent = timer.running ? "Pause" : "Resume";
  if (timer.running) {
    timer.intervalId = setInterval(() => {
      timer.elapsedSec += 1;
      if (timer.remainingSec > 0) timer.remainingSec -= 1;
      updateTimerDisplay();
    }, 1000);
  } else {
    clearInterval(timer.intervalId);
  }
};
document.getElementById("timerReset").onclick = () => {
  const timer = state.activeTimer;
  clearInterval(timer.intervalId);
  timer.remainingSec = timer.estimateSec;
  timer.elapsedSec = 0;
  timer.running = false;
  document.getElementById("timerStartPause").textContent = "Start";
  updateTimerDisplay();
};
document.getElementById("timerFinish").onclick = () => {
  const timer = state.activeTimer;
  if (!timer) return;
  clearInterval(timer.intervalId);
  const t = state.tasks.find((x) => x.id === timer.taskId);
  t.actualMinutes = Math.round(timer.elapsedSec / 60);
  state.weeklyHours[6] += timer.elapsedSec / 3600;
  timerModal.classList.remove("active");
  state.activeTimer = null;
  renderAnalytics();
  persist();
};
document.getElementById("closeTimerModal").onclick = () => {
  if (state.activeTimer) clearInterval(state.activeTimer.intervalId);
  timerModal.classList.remove("active");
};

// ---------- ANALYTICS ----------
let weeklyChart, statusChart;
function renderAnalytics() {
  const completed = state.tasks.filter((t) => t.completed).length;
  const pending = state.tasks.filter((t) => !t.completed).length;
  document.getElementById("statCompleted").textContent = completed;
  document.getElementById("statHours").textContent = `${state.weeklyHours.reduce((a, b) => a + b, 0).toFixed(1)}h`;

  const wCtx = document.getElementById("weeklyChart");
  const sCtx = document.getElementById("statusChart");
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  const shade2 = getComputedStyle(document.documentElement).getPropertyValue("--shade-2").trim();

  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(wCtx, {
    type: "bar",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [{ data: state.weeklyHours.map((h) => Number(h.toFixed(2))), backgroundColor: primary, borderRadius: 6 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(sCtx, {
    type: "doughnut",
    data: {
      labels: ["Completed", "Pending"],
      datasets: [{ data: [completed, pending], backgroundColor: [primary, shade2] }],
    },
    options: { plugins: { legend: { position: "bottom" } } },
  });
}

// ============================================================
// GOODNOTES-STYLE NOTEBOOK
// Click anywhere on the page to drop a floating text box at
// that exact position. The toolbar edits only the active box.
// ============================================================
const FONT_MAP = { sans: "'Poppins', sans-serif", serif: "Georgia, serif", hand: "'Caveat', cursive" };
const notebookPage = document.getElementById("notebookPage");

function renderNotebook() {
  notebookPage.innerHTML = "";
  state.notebookBoxes.forEach((box) => {
    const el = document.createElement("div");
    el.className = "text-box" + (box.id === state.activeBoxId ? " active" : "");
    el.style.left = box.x + "px";
    el.style.top = box.y + "px";
    el.style.fontFamily = FONT_MAP[box.font] || FONT_MAP.sans;
    el.style.color = box.color;
    el.contentEditable = "true";
    el.dataset.id = box.id;
    el.textContent = box.text;

    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveBox(box.id);
    });
    el.addEventListener("focus", () => setActiveBox(box.id));
    el.addEventListener("input", () => {
      box.text = el.textContent;
      persist();
    });

    const del = document.createElement("span");
    del.className = "box-del";
    del.textContent = "×";
    del.addEventListener("mousedown", (e) => e.stopPropagation());
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      state.notebookBoxes = state.notebookBoxes.filter((b) => b.id !== box.id);
      if (state.activeBoxId === box.id) state.activeBoxId = null;
      renderNotebook();
      persist();
    });
    el.appendChild(del);
    notebookPage.appendChild(el);
  });
  updateToolbarHint();
}

function setActiveBox(id) {
  state.activeBoxId = id;
  const box = state.notebookBoxes.find((b) => b.id === id);
  if (box) {
    state.activeFont = box.font;
    state.activeColor = box.color;
    syncToolbarSelection();
  }
  renderNotebook();
  const el = notebookPage.querySelector(`[data-id="${id}"]`);
  if (el) el.focus();
}

function syncToolbarSelection() {
  document.querySelectorAll(".font-btn").forEach((b) => {
    b.classList.toggle("ring-2", b.dataset.font === state.activeFont);
    b.style.outline = b.dataset.font === state.activeFont ? `2px solid var(--primary)` : "none";
  });
}

function updateToolbarHint() {
  const hint = document.getElementById("toolbarHint");
  hint.textContent = state.activeBoxId
    ? "Editing selected text box — pick a font or color below"
    : "Click the page to add a text box";
}

notebookPage.addEventListener("click", (e) => {
  const rect = notebookPage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top + notebookPage.scrollTop;
  const box = { id: crypto.randomUUID(), x, y, text: "", font: state.activeFont, color: state.activeColor };
  state.notebookBoxes.push(box);
  renderNotebook();
  const el = notebookPage.querySelector(`[data-id="${box.id}"]`);
  setActiveBox(box.id);
  persist();
});

document.querySelectorAll(".font-btn").forEach((btn) => {
  btn.onclick = () => {
    state.activeFont = btn.dataset.font;
    if (state.activeBoxId) {
      const box = state.notebookBoxes.find((b) => b.id === state.activeBoxId);
      if (box) box.font = state.activeFont;
      renderNotebook();
      persist();
    }
    syncToolbarSelection();
  };
});
document.querySelectorAll("#view-notebook .swatch[data-color]").forEach((sw) => {
  sw.onclick = () => {
    state.activeColor = sw.dataset.color;
    if (state.activeBoxId) {
      const box = state.notebookBoxes.find((b) => b.id === state.activeBoxId);
      if (box) box.color = state.activeColor;
      renderNotebook();
      persist();
    }
  };
});
document.getElementById("clearPageBtn").onclick = () => {
  if (state.notebookBoxes.length && !confirm("Clear all notes on this page?")) return;
  state.notebookBoxes = [];
  state.activeBoxId = null;
  renderNotebook();
  persist();
};

// ---------- THEME SWITCHING ----------
document.querySelectorAll("#themeSwitcher .swatch").forEach((el) => {
  if (el.dataset.theme === state.theme) el.classList.add("active");
  el.onclick = () => {
    document.documentElement.classList.remove("theme-navy", "theme-sunset", "theme-maroon", "theme-forest");
    document.documentElement.classList.add(el.dataset.theme);
    state.theme = el.dataset.theme;
    document.querySelectorAll("#themeSwitcher .swatch").forEach((s) => s.classList.remove("active"));
    el.classList.add("active");
    renderTasks();
    renderAnalytics();
    persist();
  };
});
document.documentElement.classList.add(state.theme);

// ---------- NAV / VIEW SWITCHING ----------
document.querySelectorAll(".nav-icon[data-view]").forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll(".nav-icon[data-view]").forEach((n) => n.classList.remove("active"));
    el.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${el.dataset.view}`).classList.add("active");
    state.view = el.dataset.view;
    if (el.dataset.view === "analytics") renderAnalytics();
  };
});

// ---------- FILTER ----------
document.getElementById("filterSubject").onchange = (e) => {
  state.filterSubject = e.target.value;
  renderTasks();
};

// ============================================================
// AI STUDY ASSISTANT DRAWER
// UI shell only — getAssistantReply() below is a simple local
// heuristic. Swap it for a real backend call to Claude (or any
// LLM) to get genuine answers; never call a model API directly
// from client-side code with an exposed key.
// ============================================================
const aiDrawer = document.getElementById("aiDrawer");
const aiBackdrop = document.getElementById("aiDrawerBackdrop");
const aiMessages = document.getElementById("aiMessages");

function openAiDrawer() {
  aiDrawer.classList.add("open");
  aiBackdrop.classList.remove("hidden");
  if (!aiMessages.dataset.greeted) {
    addAiMessage("ai", "Hi! I'm your study assistant. Ask me about your workload, deadlines, or study tips.");
    aiMessages.dataset.greeted = "1";
  }
}
function closeAiDrawer() {
  aiDrawer.classList.remove("open");
  aiBackdrop.classList.add("hidden");
}
document.getElementById("navAI").onclick = openAiDrawer;
document.getElementById("closeAiDrawer").onclick = closeAiDrawer;
aiBackdrop.onclick = closeAiDrawer;

function addAiMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `max-w-[85%] text-sm px-3 py-2 rounded-2xl ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;
  bubble.textContent = text;
  aiMessages.appendChild(bubble);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function getAssistantReply(query) {
  const q = query.toLowerCase();
  const pending = state.tasks.filter((t) => !t.completed);
  const urgent = pending.filter((t) => computePriority(t).tier === "high");
  if (q.includes("what") && (q.includes("first") || q.includes("next") || q.includes("priorit"))) {
    if (!pending.length) return "You're all caught up — no pending tasks!";
    const top = pending.map((t) => ({ t, p: computePriority(t) })).sort((a, b) => b.p.score - a.p.score)[0].t;
    return `Start with "${top.title}" (${top.subject}) — it's your highest-priority task right now.`;
  }
  if (q.includes("urgent") || q.includes("overdue")) {
    return urgent.length
      ? `You have ${urgent.length} urgent task${urgent.length > 1 ? "s" : ""}: ${urgent.map((t) => t.title).join(", ")}.`
      : "Nothing urgent right now — nice work staying ahead.";
  }
  if (q.includes("how many") || q.includes("workload")) {
    return `You have ${pending.length} pending task${pending.length === 1 ? "" : "s"} across ${new Set(pending.map((t) => t.subject)).size} subjects.`;
  }
  if (q.includes("tip") || q.includes("focus") || q.includes("study")) {
    const tips = [
      "Try the Pomodoro technique: 25 minutes focused work, then a 5-minute break.",
      "Tackle your hardest task first while your energy is highest.",
      "Break large assignments into smaller sub-tasks with their own mini-deadlines.",
      "Review notes within 24 hours of taking them — it dramatically improves retention.",
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }
  return "I can help with priorities, workload, and study tips — try asking \"what should I do first?\" This is a demo assistant; connect a real LLM backend for open-ended answers.";
}

document.getElementById("aiSendBtn").onclick = sendAiQuery;
document.getElementById("aiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendAiQuery(); });
function sendAiQuery() {
  const input = document.getElementById("aiInput");
  const text = input.value.trim();
  if (!text) return;
  addAiMessage("user", text);
  input.value = "";
  setTimeout(() => addAiMessage("ai", getAssistantReply(text)), 300);
}

// ---------- INIT ----------
renderSubjectFilter();
renderTasks();
renderAnalytics();
renderNotebook();

// Live-refresh countdowns every minute
setInterval(renderTasks, 60000);
