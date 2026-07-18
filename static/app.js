const App = (() => {
  const TOKEN_KEY = "bitserves_token";
  const USER_KEY = "bitserves_user";

  let authMode = "signin";
  let gradesCache = [];
  let departmentsCache = [];
  let positionsCache = [];
  let summaryCache = [];
  let currentMetric = "net_pay";
  let historyOpen = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
  function setSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      const msg = (data && data.detail) ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : `РћС€РёР±РєР° ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function toast(message, type = "info") {
    const container = $("#toast-container");
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add("visible"), 10);
    setTimeout(() => { el.classList.remove("visible"); setTimeout(() => el.remove(), 300); }, 3500);
  }

  function switchAuthTab(mode) {
    authMode = mode;
    $$("#login-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === mode));
    $("#signup-fields").style.display = mode === "signup" ? "block" : "none";
    $("#auth-submit").textContent = mode === "signup" ? "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ" : "Р’РѕР№С‚Рё РІ СЃРёСЃС‚РµРјСѓ";
    $("#auth-error").style.display = "none";
    if (mode === "signup") loadCatalogForSignup();
  }

  function showAuthError(msg) { const el = $("#auth-error"); el.textContent = msg; el.style.display = "block"; }

  function onRoleChange() {
    const role = document.querySelector('input[name="role"]:checked').value;
    const gradeGroup = $("#grade-group");
    if (gradeGroup) gradeGroup.style.display = role === "manager" ? "block" : "none";
    const pw = $("#password");
    pw.placeholder = "Р’РІРµРґРёС‚Рµ РїР°СЂРѕР»СЊ";
  }

  async function loadCatalogForSignup() {
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
      renderDeptSelect();
      renderGradeSelect();
    } catch (e) { showAuthError("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїСЂР°РІРѕС‡РЅРёРєРё: " + e.message); }
  }

  function renderDeptSelect() {
    const sel = $("#dept");
    sel.innerHTML = '<option value="">вЂ” Р’С‹Р±РµСЂРёС‚Рµ РѕС‚РґРµР» вЂ”</option>' + departmentsCache.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  }
  function renderGradeSelect() {
    const sel = $("#grade");
    sel.innerHTML = '<option value="">вЂ” Р’С‹Р±РµСЂРёС‚Рµ РіСЂРµР№Рґ вЂ”</option>' + gradesCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  }

  async function onDeptChange() {
    const deptId = parseInt($("#dept").value);
    if (!deptId) { $("#pos").innerHTML = '<option value="">РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РѕС‚РґРµР»</option>'; return; }
    try {
      positionsCache = await api(`/api/positions?department_id=${deptId}`, { auth: false });
      const sel = $("#pos");
      if (!positionsCache.length) { sel.innerHTML = '<option value="">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґРѕР»Р¶РЅРѕСЃС‚РµР№</option>'; return; }
      sel.innerHTML = '<option value="">вЂ” Р’С‹Р±РµСЂРёС‚Рµ РґРѕР»Р¶РЅРѕСЃС‚СЊ вЂ”</option>' + positionsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    } catch (e) { $("#pos").innerHTML = '<option value="">РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё</option>'; }
  }

  async function submitAuth() {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    if (!email || !password) { showAuthError("Р—Р°РїРѕР»РЅРёС‚Рµ РїРѕС‡С‚Сѓ Рё РїР°СЂРѕР»СЊ"); return; }
    const btn = $("#auth-submit");
    btn.disabled = true; btn.textContent = "РџРѕРґРѕР¶РґРёС‚РµвЂ¦";
    try {
      if (authMode === "signup") {
        const full_name = $("#full_name").value.trim();
        const deptId = parseInt($("#dept").value);
        const posId = parseInt($("#pos").value);
        const gradeId = $("#grade").value || null;
        const role = document.querySelector('input[name="role"]:checked').value;
        if (!full_name) { showAuthError("Р’РІРµРґРёС‚Рµ Р¤РРћ"); btn.disabled = false; btn.textContent = "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ"; return; }
        if (!deptId || !posId) { showAuthError("Р’С‹Р±РµСЂРёС‚Рµ РѕС‚РґРµР» Рё РґРѕР»Р¶РЅРѕСЃС‚СЊ"); btn.disabled = false; btn.textContent = "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ"; return; }
        if (role === "manager" && !gradeId) { showAuthError("Р’С‹Р±РµСЂРёС‚Рµ РіСЂРµР№Рґ"); btn.disabled = false; btn.textContent = "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ"; return; }
        const data = await api("/api/auth/register", { method: "POST", auth: false, body: { email, password, full_name, department_id: deptId, position_id: posId, grade_id: gradeId, role } });
        setSession(data.access_token, data.user);
        enterApp();
      } else {
        const data = await api("/api/auth/login", { method: "POST", auth: false, body: { email, password } });
        setSession(data.access_token, data.user);
        enterApp();
      }
    } catch (e) {
      showAuthError(e.message || "РћС€РёР±РєР° Р°РІС‚РѕСЂРёР·Р°С†РёРё");
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === "signup" ? "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ" : "Р’РѕР№С‚Рё РІ СЃРёСЃС‚РµРјСѓ";
    }
  }

  function enterApp() {
    const user = getUser();
    if (!user) { showLogin(); return; }
    if (user.role === "head") return enterHeadApp(user);
    enterManagerApp(user);
  }

  function enterManagerApp(user) {
    $("#login-screen").classList.remove("active");
    $("#head-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    $("#sidebar-username").textContent = user.full_name || user.email.split("@")[0];
    $("#sidebar-email").textContent = user.email;
    $("#sidebar-dept-badge").textContent = "РћС‚РґРµР»: " + (user.department ? user.department.name : "вЂ”");
    $("#user-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    $("#hello-name").textContent = user.full_name || "РјРµРЅРµРґР¶РµСЂ";

    const deptCode = user.department ? user.department.code : "";
    if (deptCode === "dev_art") {
      $("#nav-payroll").classList.remove("disabled");
      $("#payroll-badge").style.display = "inline-block";
      $("#svc-payroll").classList.remove("disabled");
      $("#svc-payroll-status").textContent = "Р”РѕСЃС‚СѓРїРµРЅ";
      $("#svc-payroll-status").className = "service-status active-open";
    } else {
      $("#nav-payroll").classList.add("disabled");
      $("#nav-payroll").onclick = () => toast("РћС‚РґРµР» РЎРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ вЂ” РјРёРєСЂРѕСЃРµСЂРІРёСЃ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ", "info");
      $("#payroll-badge").style.display = "none";
      $("#svc-payroll").classList.add("disabled");
      $("#svc-payroll-status").textContent = "РЎРєРѕСЂРѕ";
      $("#svc-payroll-status").className = "service-status soon";
      $("#svc-payroll").onclick = () => toast("РћС‚РґРµР» РЎРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ вЂ” РјРёРєСЂРѕСЃРµСЂРІРёСЃ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ", "info");
      toast("РћС‚РґРµР» В«" + (user.department ? user.department.name : "") + "В» вЂ” РјРёРєСЂРѕСЃРµСЂРІРёСЃ Р—Рџ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ", "info");
    }
    navigate("menu");
  }

  function enterHeadApp(user) {
    $("#login-screen").classList.remove("active");
    $("#app-screen").classList.remove("active");
    $("#head-screen").classList.add("active");
    $("#head-username").textContent = user.full_name || user.email.split("@")[0];
    $("#head-email").textContent = user.email;
    $("#head-dept-badge").textContent = "РћС‚РґРµР»: " + (user.department ? user.department.name : "вЂ”");
    $("#head-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    const now = new Date().toISOString().slice(0, 7);
    if ($("#head-team-period")) $("#head-team-period").value = now;
    if ($("#head-profit-period")) $("#head-profit-period").value = now;
    if ($("#head-costs-period")) $("#head-costs-period").value = now;
    navigate("head-dashboard");
  }

  function showLogin() { $("#app-screen").classList.remove("active"); $("#head-screen").classList.remove("active"); $("#login-screen").classList.add("active"); }
  function logout() { clearSession(); location.reload(); }

  function navigate(route) {
    const isHead = (getUser() || {}).role === "head";
    const container = isHead ? "#head-screen" : "#app-screen";
    $(`${container} .nav-item`).forEach ? null : null;
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    document.querySelectorAll(".page").forEach(p => p.style.display = "none");
    const page = $(`#page-${route}`);
    if (page) page.style.display = "block";
    if (route === "payroll") { attachAllMasksIn($("#page-payroll")); loadGradePill(); loadHistory(); }
    if (route === "profile") { loadProfile(); setTimeout(() => attachAllMasksIn($("#page-profile").parentNode), 50); }
    if (route === "head-dashboard") { loadDashboard(); }
    if (route === "head-profitability") { loadProfitForm(); setTimeout(attachMasksProfit, 50); }
    if (route === "head-costs") { loadCosts(); }
    if (route === "head-analytics") { loadAnalytics(); }
  }

  function attachMasksProfit() {
    if ($("#profit-form")) attachAllMasksIn($("#profit-form"));
    if ($("#calc-form")) attachAllMasksIn($("#calc-form"));
  }

  function loadGradePill() {
    const user = getUser();
    if (!user) return;
    const g = user.grade || {};
    const planText = g.has_plan && g.plan_margin != null ? formatMoney(g.plan_margin) : "вЂ”";
    $("#grade-pill").innerHTML = `
      <div class="gp-grid">
        <div class="gp-item"><div class="gp-label">Р¤РРћ</div><div class="gp-value">${escapeHtml(user.full_name || "вЂ”")}</div></div>
        <div class="gp-item"><div class="gp-label">Р”РѕР»Р¶РЅРѕСЃС‚СЊ</div><div class="gp-value">${escapeHtml(user.position ? user.position.name : "вЂ”")}</div></div>
        <div class="gp-item"><div class="gp-label">Р“СЂРµР№Рґ</div><div class="gp-value">${escapeHtml(g.name || "вЂ”")}</div></div>
        <div class="gp-item"><div class="gp-label">РћРєР»Р°Рґ</div><div class="gp-value">${g.base_salary != null ? formatMoney(g.base_salary) : "вЂ”"}</div></div>
        <div class="gp-item"><div class="gp-label">РљРѕСЌС„. СѓСЃР»СѓРі</div><div class="gp-value">${g.service_factor != null ? Number(g.service_factor).toFixed(2) : "вЂ”"}</div></div>
        <div class="gp-item"><div class="gp-label">РџР»Р°РЅ РїРѕ РјР°СЂР¶Рµ</div><div class="gp-value">${planText}</div></div>
      </div>
      <div id="plan-progress" class="plan-progress" style="display:${g.has_plan ? "block" : "none"}">
        <div class="plan-progress-row">
          <span class="plan-label">РњР°СЂР¶Р° Р·Р° РїРµСЂРёРѕРґ:</span> <b id="plan-margin-now">0 в‚Ѕ</b>
          <span class="plan-muted">| РњР°СЂР¶Р° РґР»СЏ РїР»Р°РЅР° (в€’5% РќР”РЎ): <b id="plan-margin-net">0 в‚Ѕ</b></span>
          <span class="plan-muted">| Р’С‹РїРѕР»РЅРµРЅРѕ: <b id="plan-perf">0%</b></span>
          <span class="plan-muted">| РЎС‚СѓРїРµРЅСЊ: <b id="plan-tier">вЂ”</b></span>
        </div>
        <div class="plan-bar-wrap"><div class="plan-bar" id="plan-bar"></div>
          <div class="plan-bar-tick" style="left:45%"></div>
          <div class="plan-bar-tick" style="left:65%"></div>
          <div class="plan-bar-tick" style="left:75%"></div>
          <div class="plan-bar-tick" style="left:100%"></div>
        </div>
        <div class="plan-bar-scale">
          <span>0%</span><span>90%</span><span>130%</span><span>150%</span><span>200%</span>
        </div>
      </div>`;
    updateLiveEstimate();
    attachLiveInputs();
  }

  function attachLiveInputs() {
    ["#calc-svc-margin", "#calc-goods-margin"].forEach(sel => {
      const el = $(sel);
      if (el && !el.dataset.liveAttached) {
        el.dataset.liveAttached = "1";
        el.addEventListener("input", updateLiveEstimate);
      }
    });
  }

  function updateLiveEstimate() {
    const user = getUser();
    if (!user || !user.grade || !user.grade.has_plan) return;
    const g = user.grade;
    const svc = parseNumInput($("#calc-svc-margin"));
    const goods = parseNumInput($("#calc-goods-margin"));
    const marginTotal = svc + goods;
    const marginNet = round2(marginTotal * 0.95);
    const plan = Number(g.plan_margin) || 0;
    const perf = plan > 0 ? round2(marginNet / plan * 100) : 0;
    const tier = resolveTier(g, perf);
    setPlanUI(marginTotal, marginNet, perf, tier);
  }

  function resolveTier(grade, perf) {
    const tiers = (grade.tiers || []).slice().sort((a, b) => b.min_pct - a.min_pct);
    for (const t of tiers) {
      if (perf >= Number(t.min_pct)) return Number(t.bonus_percent);
    }
    return 0;
  }

  function setPlanUI(marginTotal, marginNet, perf, tier) {
    const mNow = $("#plan-margin-now"); if (mNow) mNow.textContent = formatMoney(marginTotal);
    const mNet = $("#plan-margin-net"); if (mNet) mNet.textContent = formatMoney(marginNet);
    const pEl = $("#plan-perf"); if (pEl) pEl.textContent = perf + "%";
    const tEl = $("#plan-tier");
    if (tEl) {
      tEl.textContent = tier + "%";
      tEl.className = tier === 0 ? "plan-tier-zero" : "plan-tier-ok";
    }
    const bar = $("#plan-bar");
    if (bar) {
      const w = Math.min(100, perf / 200 * 100);
      bar.style.width = w + "%";
      bar.className = "plan-bar " + (perf < 90 ? "plan-bar-low" : perf < 130 ? "plan-bar-mid" : "plan-bar-high");
    }
  }

  function parseNumInput(el) {
    if (!el) return 0;
    const raw = (el.value || "").toString().replace(/\s/g, "").replace(",", ".");
    const v = parseFloat(raw);
    return isNaN(v) ? 0 : v;
  }

  function formatNumber(v) { return Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }); }

  function attachNumberMask(el) {
    if (!el || el.dataset.maskAttached) return;
    el.dataset.maskAttached = "1";
    el.dataset.raw = el.value || "0";
    el.type = "text";
    el.inputMode = "decimal";
    if (el.value !== "" && el.value !== "0") el.value = formatNumber(parseFloat(el.value) || 0);
    el.addEventListener("input", () => {
      let raw = el.value.replace(/[^\d.,-]/g, "").replace(/\s+/g, "");
      raw = raw.replace(",", ".");
      const negative = raw.startsWith("-");
      raw = raw.replace(/-/g, "");
      if (raw === "" || raw === ".") { el.dataset.raw = "0"; el.value = negative ? "-" : ""; return; }
      const parts = raw.split(".");
      const intPart = parts[0].replace(/^0+(?=\d)/, "");
      let decPart = parts.length > 1 ? "." + parts.slice(1).join("").slice(0, 2) : "";
      const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      el.value = (negative ? "-" : "") + intFmt + decPart;
      el.dataset.raw = (negative ? "-" : "") + (intPart || "0") + decPart;
    });
    el.addEventListener("focus", () => { el.select(); });
  }

  function attachAllMasksIn(scope) {
    (scope || document).querySelectorAll(".number-input").forEach(attachNumberMask);
  }

  function toggleHistory() {
    historyOpen = !historyOpen;
    $("#history-collapse").style.display = historyOpen ? "block" : "none";
    $("#history-toggle").innerHTML = historyOpen
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg> РЎРєСЂС‹С‚СЊ РёСЃС‚РѕСЂРёСЋ'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg> РџРѕСЃРјРѕС‚СЂРµС‚СЊ РёСЃС‚РѕСЂРёСЋ';
    if (historyOpen) loadSummary();
  }

  async function calculate() {
    const body = {
      period: ($("#calc-period").value || new Date().toISOString().slice(0, 7)),
      worked_days: parseInt($("#calc-worked").value),
      working_days: parseInt($("#calc-working").value),
      service_margin: parseNumInput($("#calc-svc-margin")),
      goods_margin: parseNumInput($("#calc-goods-margin")),
      tax_rate: parseFloat($("#calc-tax").value) || 13,
    };
    const resBox = $("#calc-result");
    resBox.style.display = "none";
    try {
      const r = await api("/api/payroll/calculate", { method: "POST", body });
      resBox.innerHTML = `
        <div class="cr-title">Р Р°СЃС‡С‘С‚ Р·Р° ${escapeHtml(r.period)} вЂ” СЃРѕС…СЂР°РЅС‘РЅ</div>
        <div class="cr-grid">
          <div class="cr-item"><div class="cr-label">РќР°С‡РёСЃР»РµРЅРѕ (РѕРєР»Р°Рґ)</div><div class="cr-value">${formatMoney(r.accrued_base)}</div></div>
          <div class="cr-item"><div class="cr-label">РџСЂРµРјРёСЏ Р·Р° СѓСЃР»СѓРіРё</div><div class="cr-value">${formatMoney(r.services_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">РџСЂРµРјРёСЏ Р·Р° С‚РѕРІР°СЂ</div><div class="cr-value">${formatMoney(r.goods_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">РџСЂРµРјРёСЏ РёС‚РѕРіРѕ (${r.bonus_percent}%)</div><div class="cr-value">${formatMoney(r.bonus_total)}</div></div>
          <div class="cr-item"><div class="cr-label">РќР°С‡РёСЃР»РµРЅРѕ РІСЃРµРіРѕ</div><div class="cr-value">${formatMoney(r.gross_pay)}</div></div>
          <div class="cr-item"><div class="cr-label">РќР”Р¤Р› (${r.tax_rate}%)</div><div class="cr-value">-${formatMoney(r.tax_amount)}</div></div>
          <div class="cr-item cr-net"><div class="cr-label">Рљ РІС‹РїР»Р°С‚Рµ</div><div class="cr-value">${formatMoney(r.net_pay)}</div></div>
        </div>
        <div class="cr-actions">
          <button class="btn-excel" onclick="App.exportRecord(${r.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>РЎРєР°С‡Р°С‚СЊ Excel</button>
        </div>`;
      resBox.style.display = "block";
      loadHistory();
      toast("Р Р°СЃС‡С‘С‚ СЃРѕС…СЂР°РЅС‘РЅ", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadHistory() {
    const wrap = $("#payroll-history");
    if (!wrap) return;
    try {
      const rows = await api("/api/payroll/history");
      if (!rows.length) { wrap.innerHTML = '<div class="empty">РќРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЂР°СЃС‡С‘С‚РѕРІ</div>'; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>в„–</th><th>РџРµСЂРёРѕРґ</th><th>Р“СЂРµР№Рґ</th><th>Р”РЅРё</th><th>РњР°СЂР¶Р° СѓСЃР»./С‚РѕРІР°СЂ</th><th>РћРєР»Р°Рґ</th><th>РџСЂРµРјРёСЏ</th><th>Gross</th><th>РќР”Р¤Р›</th><th>Рљ РІС‹РїР»Р°С‚Рµ</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr>
            <td data-label="в„–" class="tnum">${i + 1}</td>
            <td data-label="РџРµСЂРёРѕРґ">${escapeHtml(r.period)}</td>
            <td data-label="Р“СЂРµР№Рґ" class="text-muted">${escapeHtml(r.grade_name)}</td>
            <td data-label="Р”РЅРё" class="tnum">${r.worked_days}/${r.working_days}</td>
            <td data-label="РњР°СЂР¶Р° СѓСЃР»./С‚РѕРІР°СЂ" class="tnum">${formatMoney(r.service_margin)} / ${formatMoney(r.goods_margin)}</td>
            <td data-label="РћРєР»Р°Рґ" class="tnum">${formatMoney(r.base_salary)}</td>
            <td data-label="РџСЂРµРјРёСЏ" class="tnum">${formatMoney(r.bonus_total)}</td>
            <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
            <td data-label="РќР”Р¤Р›" class="tnum">-${formatMoney(r.tax_amount)}</td>
            <td data-label="Рљ РІС‹РїР»Р°С‚Рµ" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
            <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.id})" title="РЎРєР°С‡Р°С‚СЊ Excel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
          </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function loadSummary() {
    const chartArea = $("#chart-area");
    const tableWrap = $("#summary-table");
    try {
      const rows = await api("/api/payroll/summary");
      summaryCache = rows;
      if (!rows.length) {
        chartArea.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С… РґР»СЏ РіСЂР°С„РёРєР°</div>';
        tableWrap.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>';
        return;
      }
      renderChart(rows, currentMetric);
      renderSummaryTable(rows);
    } catch (e) {
      chartArea.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      tableWrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function switchMetric(metric) {
    currentMetric = metric;
    $$(".chart-tab").forEach(t => t.classList.toggle("active", t.dataset.metric === metric));
    if (summaryCache.length) renderChart(summaryCache, metric);
  }

  function renderChart(rows, metric) {
    const area = $("#chart-area");
    const values = rows.map(r => Number(r[metric]) || 0);
    const maxV = Math.max(1, ...values);
    const W = Math.max(360, Math.min(900, rows.length * 90 + 60));
    const H = 280;
    const padL = 48, padR = 16, padT = 16, padB = 48;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barGap = 14;
    const barW = Math.max(18, Math.min(60, (innerW - barGap * (rows.length - 1)) / Math.max(1, rows.length)));
    const stepX = (barW * rows.length + barGap * (rows.length - 1)) / rows.length;
    const yScale = (v) => padT + innerH - (v / maxV) * innerH;
    const niceMax = Math.ceil(maxV / 1000) * 1000 || 1;
    const ticks = 4;
    let grid = "";
    for (let i = 0; i <= ticks; i++) {
      const v = (niceMax / ticks) * i;
      const y = padT + innerH - (v / niceMax) * innerH;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-divider)" stroke-width="1" stroke-dasharray="3 3"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--color-text-faint)" font-family="JetBrains Mono">${shortMoney(v)}</text>`;
    }
    let bars = "";
    rows.forEach((r, i) => {
      const v = Number(r[metric]) || 0;
      const x = padL + i * stepX + (stepX - barW) / 2;
      const y = yScale(v);
      const bh = padT + innerH - y;
      bars += `<g class="bar-group" data-idx="${i}">
        <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, bh)}" rx="4" fill="#e5006e" class="bar-rect"/>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--color-text)" font-family="JetBrains Mono" font-weight="600">${shortMoney(v)}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 18}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)">${escapeHtml(r.period)}</text>
      </g>`;
    });
    area.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">
        ${grid}${bars}
      </svg>
      <div id="chart-tooltip" class="chart-tooltip" style="display:none"></div>`;
    const tooltip = $("#chart-tooltip");
    $$(".bar-group").forEach(g => {
      g.addEventListener("mousemove", (e) => {
        const idx = parseInt(g.dataset.idx);
        const r = rows[idx];
        tooltip.innerHTML = `
          <div class="tt-period">${escapeHtml(r.period)}</div>
          <div class="tt-row"><span>РћРєР»Р°Рґ</span><b>${formatMoney(r.accrued_base)}</b></div>
          <div class="tt-row"><span>РџСЂРµРјРёСЏ СѓСЃР»СѓРі</span><b>${formatMoney(r.services_bonus)}</b></div>
          <div class="tt-row"><span>РџСЂРµРјРёСЏ С‚РѕРІР°СЂР°</span><b>${formatMoney(r.goods_bonus)}</b></div>
          <div class="tt-row"><span>РџСЂРµРјРёСЏ РёС‚РѕРіРѕ</span><b>${formatMoney(r.bonus_total)}</b></div>
          <div class="tt-row"><span>Gross</span><b>${formatMoney(r.gross_pay)}</b></div>
          <div class="tt-row"><span>РќР”Р¤Р›</span><b>-${formatMoney(r.tax_amount)}</b></div>
          <div class="tt-row tt-net"><span>Рљ РІС‹РїР»Р°С‚Рµ</span><b>${formatMoney(r.net_pay)}</b></div>
          <div class="tt-date">Р Р°СЃС‡С‘С‚ РѕС‚ ${escapeHtml(r.created_at)}</div>`;
        tooltip.style.display = "block";
        const rect = area.getBoundingClientRect();
        tooltip.style.left = Math.min(e.clientX - rect.left + 10, rect.width - 240) + "px";
        tooltip.style.top = Math.max(0, e.clientY - rect.top - 150) + "px";
      });
      g.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  function renderSummaryTable(rows) {
    const wrap = $("#summary-table");
    if (!rows.length) { wrap.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>'; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>РџРµСЂРёРѕРґ</th><th>РћРєР»Р°Рґ</th><th>РџСЂРµРјРёСЏ СѓСЃР»СѓРі</th><th>РџСЂРµРјРёСЏ С‚РѕРІР°СЂР°</th><th>РџСЂРµРјРёСЏ РёС‚РѕРіРѕ</th><th>Gross</th><th>РќР”Р¤Р›</th><th>Рљ РІС‹РїР»Р°С‚Рµ</th><th>Р”Р°С‚Р°</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td data-label="РџРµСЂРёРѕРґ"><b>${escapeHtml(r.period)}</b></td>
          <td data-label="РћРєР»Р°Рґ" class="tnum">${formatMoney(r.accrued_base)}</td>
          <td data-label="РџСЂРµРјРёСЏ СѓСЃР»СѓРі" class="tnum">${formatMoney(r.services_bonus)}</td>
          <td data-label="РџСЂРµРјРёСЏ С‚РѕРІР°СЂР°" class="tnum">${formatMoney(r.goods_bonus)}</td>
          <td data-label="РџСЂРµРјРёСЏ РёС‚РѕРіРѕ" class="tnum">${formatMoney(r.bonus_total)}</td>
          <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
          <td data-label="РќР”Р¤Р›" class="tnum">-${formatMoney(r.tax_amount)}</td>
          <td data-label="Рљ РІС‹РїР»Р°С‚Рµ" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
          <td data-label="Р”Р°С‚Р° СЂР°СЃС‡С‘С‚Р°" class="text-muted">${escapeHtml(r.created_at)}</td>
          <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.record_id})" title="РЎРєР°С‡Р°С‚СЊ Excel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
        </tr>`).join("")}</tbody>
      </table>`;
  }

  async function loadProfile() {
    const isHead = (getUser() || {}).role === "head";
    const cardId = isHead ? "#head-profile-card" : "#profile-card";
    const card = $(cardId);
    if (!card) return;
    try {
      const u = await api("/api/auth/me");
      const deptName = u.department ? u.department.name : "вЂ”";
      const positionsOpts = positionsCache.filter(p => p.department_id === u.department.id).map(p => `<option value="${p.id}" ${u.position && u.position.id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
      const gradesOpts = gradesCache.map(g => `<option value="${g.id}" ${u.grade && u.grade.id === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("");
      card.innerHTML = `
        <div class="profile-grid">
          <div class="form-group"><label class="form-label">Р¤РРћ</label><input class="form-input" id="prof-name" value="${escapeHtml(u.full_name)}"></div>
          <div class="form-group"><label class="form-label">РџРѕС‡С‚Р°</label><input class="form-input" value="${escapeHtml(u.email)}" readonly></div>
          <div class="form-group"><label class="form-label">РћС‚РґРµР»</label><input class="form-input" value="${escapeHtml(deptName)}" readonly></div>
          <div class="form-group"><label class="form-label">Р”РѕР»Р¶РЅРѕСЃС‚СЊ</label><select class="form-input" id="prof-pos">${positionsOpts}</select></div>
          <div class="form-group"><label class="form-label">Р“СЂРµР№Рґ</label><select class="form-input" id="prof-grade">${gradesOpts}</select></div>
        </div>
        <div class="profile-actions"><button class="btn-accent" onclick="App.saveProfile()">РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ</button></div>`;
      if (!positionsCache.length || positionsCache[0].department_id !== u.department.id) {
        try {
          positionsCache = await api(`/api/positions?department_id=${u.department.id}`, { auth: false });
          gradesCache = await api("/api/grades", { auth: false });
          loadProfile();
        } catch (e) {}
      }
    } catch (e) { card.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function saveProfile() {
    const full_name = $("#prof-name").value.trim();
    const position_id = parseInt($("#prof-pos").value);
    const grade_id = $("#prof-grade").value;
    try {
      const updated = await api("/api/auth/me", { method: "PUT", body: { full_name, position_id, grade_id } });
      setSession(getToken(), updated);
      toast("РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ", "success");
      location.reload();
    } catch (e) { toast(e.message, "error"); }
  }

  function showFormula() {
    const user = getUser();
    const g = (user && user.grade) ? user.grade : { base_salary: 0, bonus_percent: 0, service_factor: 0.5, has_plan: false, plan_margin: null, tiers: [] };
    const svc = parseNumInput($("#calc-svc-margin"));
    const goods = parseNumInput($("#calc-goods-margin"));
    const worked = parseInt($("#calc-worked").value) || 0;
    const working = parseInt($("#calc-working").value) || 1;
    const tax = parseFloat($("#calc-tax").value) || 13;
    const accrued = round2(g.base_salary * worked / working);
    const marginTotal = svc + goods;
    const marginNet = round2(marginTotal * 0.95);
    let bonusPercent = g.bonus_percent || 0;
    let perf = null;
    if (g.has_plan && g.plan_margin && g.plan_margin > 0) {
      perf = round2(marginNet / g.plan_margin * 100);
      bonusPercent = resolveTier(g, perf);
    }
    const svcBonus = round2(svc * g.service_factor * bonusPercent / 100);
    const goodsBonus = round2(goods * bonusPercent / 100);
    const bonusTotal = round2(svcBonus + goodsBonus);
    const gross = round2(accrued + bonusTotal);
    const taxAmt = round2(gross * tax / 100);
    const net = round2(gross - taxAmt);
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    let planHtml = "";
    if (g.has_plan && g.plan_margin) {
      planHtml = `
        <div class="formula-section">
          <div class="formula-section-title">0. РџР»Р°РЅ Рё СЃС‚СѓРїРµРЅСЊ</div>
          <div class="formula-line"><span class="ftxt">РџР»Р°РЅ</span><span class="fsep">=</span><span class="fval">${formatMoney(g.plan_margin)}</span><span class="fsep">В·</span><span class="ftxt">РњР°СЂР¶Р° РґР»СЏ РїР»Р°РЅР°</span><span class="fsep">=</span><span class="fval">${formatMoney(marginNet)}</span><span class="fsep">(в€’5% РќР”РЎ)</span></div>
          <div class="formula-line"><span class="ftxt">Р’С‹РїРѕР»РЅРµРЅРёРµ</span><span class="fsep">=</span><span class="fval">${perf}%</span><span class="fsep">в†’</span><span class="fresult">РЎС‚СѓРїРµРЅСЊ: ${bonusPercent}%</span></div>
        </div>`;
    }
    overlay.innerHTML = `
      <div class="modal modal-formula">
        <div class="modal-title-row"><div class="modal-title">Р¤РѕСЂРјСѓР»Р° СЂР°СЃС‡С‘С‚Р°</div><button class="modal-close" type="button" onclick="this.closest('.modal-bg').remove()">вњ•</button></div>
        ${planHtml}
        <div class="formula-section">
          <div class="formula-section-title">1. РќР°С‡РёСЃР»РµРЅРёРµ РїРѕ РѕРєР»Р°РґСѓ</div>
          <div class="formula-line"><span class="ftxt">РћРєР»Р°Рґ</span><span class="fsep">Г—</span><span class="fval">${worked}</span><span class="fsep">Г·</span><span class="fval">${working}</span><span class="fsep">=</span><span class="fresult">${formatMoney(accrued)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">2. РџСЂРµРјРёСЏ Р·Р° СѓСЃР»СѓРіРё <span class="formula-hint">Г— РєРѕСЌС„С„РёС†РёРµРЅС‚ ${Number(g.service_factor).toFixed(2)} В· ${bonusPercent}%</span></div>
          <div class="formula-line"><span class="ftxt">РњР°СЂР¶Р° СѓСЃР»СѓРі</span><span class="fsep">Г—</span><span class="fval">${Number(g.service_factor).toFixed(2)}</span><span class="fsep">Г—</span><span class="fval">${bonusPercent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(svcBonus)}</span></div>
          <div class="formula-sub">РњР°СЂР¶Р° СѓСЃР»СѓРі = СЃСѓРјРјР° СЃС‚РѕР»Р±С†РѕРІ: <b>РЈСЃР»СѓРіРё, Р¦РўРћ, Р РµРіСѓР»СЏСЂРЅРѕРµ СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ вЂ” РРўРЎ, РљРѕРЅСЃР°Р»С‚РёРЅРі, Р”РѕСЃС‚Р°РІРєР°</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">3. РџСЂРµРјРёСЏ Р·Р° С‚РѕРІР°СЂ <span class="formula-hint">${bonusPercent}%</span></div>
          <div class="formula-line"><span class="ftxt">РњР°СЂР¶Р° С‚РѕРІР°СЂР°</span><span class="fsep">Г—</span><span class="fval">${bonusPercent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(goodsBonus)}</span></div>
          <div class="formula-sub">РњР°СЂР¶Р° С‚РѕРІР°СЂР° = СЃСѓРјРјР° СЃС‚РѕР»Р±С†РѕРІ: <b>РўРѕСЂРіРѕРІРѕРµ РѕР±РѕСЂСѓРґРѕРІР°РЅРёРµ, 1РЎ, РџСЂРѕРјС‹С€Р»РµРЅРЅРѕРµ РѕР±РѕСЂСѓРґРѕРІР°РЅРёРµ</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">4. РќР°С‡РёСЃР»РµРЅРѕ РІСЃРµРіРѕ</div>
          <div class="formula-line"><span class="ftxt">РћРєР»Р°Рґ</span><span class="fsep">+</span><span class="ftxt">РџСЂРµРјРёСЏ СѓСЃР»СѓРі</span><span class="fsep">+</span><span class="ftxt">РџСЂРµРјРёСЏ С‚РѕРІР°СЂР°</span><span class="fsep">=</span><span class="fresult">${formatMoney(gross)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">5. РќР”Р¤Р›</div>
          <div class="formula-line"><span class="ftxt">${tax}%</span><span class="fsep">РѕС‚</span><span class="fval">${formatMoney(gross)}</span><span class="fsep">=</span><span class="fresult fresult-mute">-${formatMoney(taxAmt)}</span></div>
        </div>
        <div class="formula-section formula-total">
          <div class="formula-line"><span class="ftotal-label">Рљ РІС‹РїР»Р°С‚Рµ</span><span class="fsep">=</span><span class="ftotal-value">${formatMoney(net)}</span></div>
        </div>
        <div class="modal-actions"><button class="btn-accent" onclick="this.closest('.modal-bg').remove()">РџРѕРЅСЏС‚РЅРѕ</button></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function exportRecord(recordId) {
    try {
      const token = getToken();
      const res = await fetch(`/api/payroll/records/${recordId}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const msg = await res.text(); throw new Error(msg || `РћС€РёР±РєР° ${res.status}`); }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const m = disposition.match(/filename\*=UTF-8''([^;]+)/);
      let filename = `Raschet_ZP_${recordId}.xlsx`;
      if (m) { try { filename = decodeURIComponent(m[1]); } catch {} }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Excel РІС‹РіСЂСѓР¶РµРЅ", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  const fotStatusClass = { normal: "kpi-fot-status-normal", warning: "kpi-fot-status-warning", critical: "kpi-fot-status-critical", none: "kpi-fot-status-none" };
  const fotCellClass = { normal: "cell-fot-status-normal", warning: "cell-fot-status-warning", critical: "cell-fot-status-critical" };
  const fotLabel = { normal: "РќРѕСЂРјР°", warning: "Р’РЅРёРјР°РЅРёРµ", critical: "РљСЂРёС‚РёС‡РЅРѕ", none: "РќРµС‚ РґР°РЅРЅС‹С…" };

  async function loadDashboard() {
    const period = $("#head-team-period").value || new Date().toISOString().slice(0, 7);
    const kpisEl = $("#dashboard-kpis");
    try {
      const data = await api(`/api/head/dashboard?period=${encodeURIComponent(period)}`);
      const k = data.kpis;
      const fotSt = k.fot_status || "none";
      kpisEl.innerHTML = `
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(k.margin)}</div><div class="kpi-lbl">РјР°СЂР¶Р°</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(k.gross)}</div><div class="kpi-lbl">Р¤РћРў (gross)</div></div>
        <div class="kpi ${k.profit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-val">${formatMoneyShort(k.profit)}</div><div class="kpi-lbl">РїСЂРёР±С‹Р»СЊ</div></div>
        <div class="kpi"><div class="kpi-val">${k.profitability_pct == null ? "вЂ”" : k.profitability_pct + "%"}</div><div class="kpi-lbl">СЂРµРЅС‚Р°Р±РµР»СЊРЅРѕСЃС‚СЊ</div></div>
        <div class="kpi"><div class="kpi-val">${k.fot_margin_pct == null ? "вЂ”" : k.fot_margin_pct + "%"}</div><div class="kpi-lbl">Р¤РћРў / РњР°СЂР¶Р°</div>
          <div class="kpi-fot-status ${fotStatusClass[fotSt]}">${fotLabel[fotSt]}</div>
          <div class="fot-norm-note">РќРѕСЂРјР° в‰¤20% | РљСЂРёС‚РёС‡РЅРѕ >25%</div></div>
        <div class="kpi"><div class="kpi-val">${k.managers_with_data}/${k.managers_total}</div><div class="kpi-lbl">СЃ СЂР°СЃС‡С‘С‚РѕРј</div></div>`;

      // 4 РіСЂР°С„РёРєР° РїРѕ СЃРѕС‚СЂСѓРґРЅРёРєР°Рј
      const activeMetrics = data.metrics.filter(m => m.has_record);
      if (!activeMetrics.length) {
        ["chart-margin","chart-gross","chart-profit","chart-profitability"].forEach(id => $(`#${id}`).innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>');
      } else {
        renderBarChartH("#chart-margin", activeMetrics, "margin", "РњР°СЂР¶Р°");
        renderBarChartH("#chart-gross", activeMetrics, "gross", "Р¤РћРў");
        renderBarChartH("#chart-profit", activeMetrics, "profit", "РџСЂРёР±С‹Р»СЊ");
        renderBarChartH("#chart-profitability", activeMetrics, "profitability_pct", "Р РµРЅС‚Р°Р±.%");
      }

      // 4 Р±Р»РѕРєР° С‚Р°Р±Р»РёС†
      renderBlockMargin(data.members);
      renderBlockPayroll(data.members);
      renderBlockCosts(data.metrics);
      renderBlockProfit(data.metrics);
    } catch (e) {
      kpisEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function renderBarChartH(selector, rows, valueKey, label) {
    const area = $(selector);
    if (!area) return;
    const values = rows.map(r => Number(r[valueKey]) || 0);
    if (!values.length || values.every(v => v === 0)) { area.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>'; return; }
    const maxV = Math.max(1, ...values.map(Math.abs));
    const minV = Math.min(0, ...values);
    const W = Math.max(320, Math.min(460, rows.length * 60 + 50));
    const H = 240;
    const padL = 8, padR = 8, padT = 18, padB = 50;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barW = Math.max(16, Math.min(46, (innerW - 8 * (rows.length - 1)) / rows.length));
    const gap = (innerW - barW * rows.length) / Math.max(1, rows.length - 1 || 1);
    const scaleX = innerW / rows.length;
    const zeroY = padT + innerH - (-minV) / (maxV - minV) * innerH;
    const yScale = (v) => padT + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;
    const niceMax = Math.ceil(maxV / 1000) * 1000 || 1;
    let bars = "";
    rows.forEach((r, i) => {
      const v = Number(r[valueKey]) || 0;
      const x = padL + i * (scaleX) + (scaleX - barW) / 2;
      const y = v >= 0 ? yScale(v) : zeroY;
      const bh = Math.max(1, Math.abs(zeroY - yScale(v)));
      const color = (valueKey === "profit" || valueKey === "profitability_pct") ? (v >= 0 ? "var(--color-success)" : "var(--color-error)") : "#e5006e";
      const valTxt = valueKey === "profitability_pct" ? (v == null ? "вЂ”" : v + "%") : shortMoney(v);
      bars += `<g class="bar-group" data-idx="${i}">
        <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="${color}" class="bar-rect"/>
        <text x="${x + barW / 2}" y="${(v >= 0 ? y : yScale(v)) - 6}" text-anchor="middle" font-size="10" fill="var(--color-text)" font-family="JetBrains Mono" font-weight="600">${valTxt}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 14}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${escapeHtml(shortName(r.full_name))}</text>
      </g>`;
    });
    area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">${bars}</svg><div id="tt-${selector.slice(1)}" class="chart-tooltip" style="display:none"></div>`;
    const tooltip = $(`#tt-${selector.slice(1)}`);
    area.querySelectorAll(".bar-group").forEach(g => {
      g.addEventListener("mousemove", (e) => {
        const idx = parseInt(g.dataset.idx);
        const r = rows[idx];
        tooltip.innerHTML = `<div class="tt-period">${escapeHtml(r.full_name)}</div>
          <div class="tt-row"><span>${label}</span><b>${valueKey === "profitability_pct" ? (r[valueKey] == null ? "вЂ”" : r[valueKey] + "%") : formatMoney(r[valueKey])}</b></div>`;
        tooltip.style.display = "block";
        const rect = area.getBoundingClientRect();
        tooltip.style.left = Math.min(e.clientX - rect.left + 10, rect.width - 220) + "px";
        tooltip.style.top = Math.max(0, e.clientY - rect.top - 100) + "px";
      });
      g.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  function shortName(full) {
    if (!full) return "вЂ”";
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return parts[0] + " " + (parts[1] || "").slice(0, 1) + ".";
  }

  function renderBlockMargin(members) {
    const el = $("#block-margin");
    if (!el) return;
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>РњР°СЂР¶Р° СѓСЃР»СѓРі</th><th>РњР°СЂР¶Р° С‚РѕРІР°СЂР°</th><th>РџСЂРµРјРёСЏ</th></tr></thead>
        <tbody>${members.map(m => `<tr>
          <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(m.full_name)}</b></td>
          ${m.record
            ? `<td data-label="РњР°СЂР¶Р° СѓСЃР»СѓРі" class="tnum">${formatMoney(m.record.service_margin)}</td><td data-label="РњР°СЂР¶Р° С‚РѕРІР°СЂР°" class="tnum">${formatMoney(m.record.goods_margin)}</td><td data-label="РџСЂРµРјРёСЏ" class="tnum">${formatMoney(m.record.bonus_total)}</td>`
            : `<td colspan="3" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
        </tr>`).join("")}</tbody>
      </table>`;
  }

  function renderBlockPayroll(members) {
    const el = $("#block-payroll");
    if (!el) return;
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>Gross</th><th>РќР”Р¤Р›</th><th>Рљ РІС‹РїР»Р°С‚Рµ</th></tr></thead>
        <tbody>${members.map(m => `<tr>
          <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(m.full_name)}</b></td>
          ${m.record
            ? `<td data-label="Gross" class="tnum">${formatMoney(m.record.gross_pay)}</td><td data-label="РќР”Р¤Р›" class="tnum">-${formatMoney(m.record.tax_amount)}</td><td data-label="Рљ РІС‹РїР»Р°С‚Рµ" class="tnum net-cell">${formatMoney(m.record.net_pay)}</td>`
            : `<td colspan="3" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
        </tr>`).join("")}</tbody>
      </table>`;
  }

  function renderBlockCosts(metrics) {
    const el = $("#block-costs");
    if (!el) return;
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>Р¤РћРў</th><th>Р’Р·РЅРѕСЃС‹</th><th>РќР”РЎ</th><th>РћС„РёСЃ</th></tr></thead>
        <tbody>${metrics.map(m => `<tr>
          <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(m.full_name)}</b></td>
          ${m.has_record
            ? `<td data-label="Р¤РћРў" class="tnum">${formatMoney(m.gross)}</td><td data-label="Р’Р·РЅРѕСЃС‹ 30%" class="tnum">${formatMoney(m.insurance)}</td><td data-label="РќР”РЎ 5%" class="tnum">${formatMoney(m.vat)}</td><td data-label="РћС„РёСЃ" class="tnum">${formatMoney(m.office)}</td>`
            : `<td colspan="4" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
        </tr>`).join("")}</tbody>
      </table>`;
  }

  function renderBlockProfit(metrics) {
    const el = $("#block-profit");
    if (!el) return;
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>РњР°СЂР¶Р°</th><th>РџСЂРёР±С‹Р»СЊ</th><th>Р РµРЅС‚Р°Р±.</th><th>Р¤РћРў/РњР°СЂР¶Р°</th></tr></thead>
        <tbody>${metrics.map(m => {
          const fotSt = m.fot_status || "none";
          return `<tr>
            <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(m.full_name)}</b></td>
            ${m.has_record
              ? `<td data-label="РњР°СЂР¶Р°" class="tnum">${formatMoney(m.margin)}</td><td data-label="РџСЂРёР±С‹Р»СЊ" class="tnum ${m.profit >= 0 ? "net-cell" : "kpi-red"}">${formatMoney(m.profit)}</td><td data-label="Р РµРЅС‚Р°Р±." class="tnum"><b>${m.profitability_pct == null ? "вЂ”" : m.profitability_pct + "%"}</b></td><td data-label="Р¤РћРў/РњР°СЂР¶Р°" class="tnum ${fotCellClass[fotSt] || ""}">${m.fot_margin_pct == null ? "вЂ”" : m.fot_margin_pct + "%"}</td>`
              : `<td colspan="4" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  }

  async function loadAnalytics() {
    const from = $("#head-from").value || new Date().toISOString().slice(0, 7);
    const to = $("#head-to").value || from;
    try {
      const data = await api(`/api/head/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      renderHistoryCharts(data);
      renderHeatMap(data);
    } catch (e) {
      ["hst-margin","hst-gross","hst-profit","hst-rent"].forEach(id => { const el = $(`#${id}`); if (el) el.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; });
      const hm = $("#heat-map"); if (hm) hm.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
    loadWaterfall();
  }

  function renderHistoryCharts(data) {
    const rows = data.monthly;
    renderTrendChart("#hst-margin", rows, "margin", "РњР°СЂР¶Р°");
    renderTrendChart("#hst-gross", rows, "gross", "Р¤РћРў");
    renderTrendChart("#hst-profit", rows, "profit", "РџСЂРёР±С‹Р»СЊ");
    renderTrendChart("#hst-rent", rows, "profitability_pct", "Р РµРЅС‚Р°Р±.%");
  }

  function renderTrendChart(selector, rows, key, label) {
    const area = $(selector);
    if (!area) return;
    if (!rows.length) { area.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>'; return; }
    const values = rows.map(r => Number(r[key]) || 0);
    const maxV = Math.max(1, ...values);
    const W = Math.max(320, Math.min(460, rows.length * 60 + 50));
    const H = 240;
    const padL = 8, padR = 8, padT = 18, padB = 50;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barW = Math.max(16, Math.min(46, (innerW - 8 * (rows.length - 1)) / rows.length));
    const scaleX = innerW / rows.length;
    const yScale = (v) => padT + innerH - (v / maxV) * innerH;
    let bars = "";
    rows.forEach((r, i) => {
      const v = Number(r[key]) || 0;
      const x = padL + i * scaleX + (scaleX - barW) / 2;
      const y = yScale(v);
      const bh = padT + innerH - y;
      const valTxt = key === "profitability_pct" ? (v == null ? "вЂ”" : v + "%") : shortMoney(v);
      const color = (key === "profit" || key === "profitability_pct") ? (v >= 0 ? "var(--color-success)" : "var(--color-error)") : "#e5006e";
      bars += `<g class="bar-group" data-idx="${i}">
        <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, bh)}" rx="3" fill="${color}" class="bar-rect"/>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--color-text)" font-family="JetBrains Mono" font-weight="600">${valTxt}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 14}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${escapeHtml(r.period.slice(5))}</text>
      </g>`;
    });
    area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">${bars}</svg>`;
  }

  function renderHeatMap(data) {
    const wrap = $("#heat-map");
    if (!wrap) return;
    const managers = data.managers;
    const byManager = data.by_manager;
    if (!managers.length || !byManager.length) { wrap.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>'; return; }
    // РЎРµС‚РєР°: СЃС‚СЂРѕРєРё = РјРµРЅРµРґР¶РµСЂС‹ (РїРѕ data РїРѕ РїРµСЂРёРѕРґР°Рј), СЃС‚РѕР»Р±С†С‹ = РјРµСЃСЏС†С‹
    const periods = data.monthly.map(m => m.period);
    const cellW = 60, cellH = 32, padL = 120, padT = 28;
    const W = padL + periods.length * cellW + 10;
    const H = padT + managers.length * cellH + 10;
    // РџРѕРёСЃРє РјР°РєСЃРёРјСѓРјР° РјР°СЂР¶Рё РґР»СЏ С†РІРµС‚Р°
    let maxV = 1;
    byManager.forEach(bm => bm.data.forEach(d => { if (d.margin > maxV) maxV = d.margin; }));
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="heat-svg">`;
    // Р—Р°РіРѕР»РѕРІРєРё СЃС‚РѕР»Р±С†РѕРІ (РјРµСЃСЏС†С‹)
    periods.forEach((p, i) => {
      svg += `<text x="${padL + i * cellW + cellW / 2}" y="${padT - 8}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)" font-weight="600">${escapeHtml(p.slice(5))}</text>`;
    });
    // РџРѕРґРїРёСЃРё СЃС‚СЂРѕРє + СЏС‡РµР№РєРё
    byManager.forEach((bm, r) => {
      const y = padT + r * cellH;
      svg += `<text x="${padL - 8}" y="${y + cellH / 2 + 3}" text-anchor="end" font-size="10" fill="var(--color-text)" font-weight="600">${escapeHtml(bm.full_name)}</text>`;
      bm.data.forEach((d, c) => {
        const x = padL + c * cellW;
        const intensity = d.margin / maxV;
        const fill = heatColor(intensity);
        svg += `<rect class="heat-cell" x="${x + 2}" y="${y + 2}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="${fill}" data-period="${escapeHtml(d.period)}" data-name="${escapeHtml(bm.full_name)}" data-margin="${d.margin}" data-profit="${d.profit || 0}" data-rent="${d.profitability_pct == null ? 'вЂ”' : d.profitability_pct}"/>`;
        svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 2}" text-anchor="middle" font-size="9" fill="${intensity > 0.55 ? 'white' : 'var(--color-text)'}" font-family="JetBrains Mono" font-weight="600">${d.margin > 0 ? shortMoney(d.margin) : "вЂ”"}</text>`;
      });
    });
    svg += "</svg>";
    wrap.innerHTML = svg + '<div id="hm-tooltip" class="wf-tooltip" style="display:none"></div>';
    const tooltip = $("#hm-tooltip");
    wrap.querySelectorAll(".heat-cell").forEach(cell => {
      cell.addEventListener("mousemove", (e) => {
        tooltip.innerHTML = `<div class="tt-period">${escapeHtml(cell.dataset.name)} вЂ” ${escapeHtml(cell.dataset.period)}</div>
          <div class="tt-row"><span>РњР°СЂР¶Р°</span><b>${formatMoney(parseFloat(cell.dataset.margin))}</b></div>
          <div class="tt-row"><span>РџСЂРёР±С‹Р»СЊ</span><b>${formatMoney(parseFloat(cell.dataset.profit))}</b></div>
          <div class="tt-row"><span>Р РµРЅС‚Р°Р±.</span><b>${cell.dataset.rent}${cell.dataset.rent !== "вЂ”" ? "%" : ""}</b></div>`;
        tooltip.style.display = "block";
        const rect = wrap.getBoundingClientRect();
        tooltip.style.left = Math.min(e.clientX - rect.left + 10, rect.width - 200) + "px";
        tooltip.style.top = Math.max(0, e.clientY - rect.top - 100) + "px";
      });
      cell.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  function heatColor(t) {
    // РёРЅС‚РµСЂРїРѕР»СЏС†РёСЏ РѕС‚ #ededf0 (surface-offset) Рє #e5006e (primary)
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(237 + (229 - 237) * t);
    const g = Math.round(237 + (0 - 237) * t);
    const b = Math.round(240 + (110 - 240) * t);
    return `rgb(${r},${g},${b})`;
  }

  async function loadWaterfall() {
    const period = $("#waterfall-period").value || new Date().toISOString().slice(0, 7);
    const area = $("#waterfall");
    if (!area) return;
    try {
      const data = await api(`/api/head/waterfall?period=${encodeURIComponent(period)}`);
      renderWaterfall(area, data);
    } catch (e) { area.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function renderWaterfall(area, data) {
    const items = data.items.filter(it => it.has_current || it.has_previous);
    const prev = data.previous_total;
    const cur = data.current_total;
    if (!items.length && prev === 0 && cur === 0) { area.innerHTML = '<div class="empty">РќРµС‚ РґР°РЅРЅС‹С…</div>'; return; }
    // РЈС‡РёС‚С‹РІР°РµРј СЃС‚Р°СЂС‚РѕРІС‹Р№ Р±Р°СЂ (previous), РґРµР»СЊС‚С‹ РјРµРЅРµРґР¶РµСЂРѕРІ, РёС‚РѕРіРѕРІС‹Р№ Р±Р°СЂ (current)
    const all = [{ label: data.previous_period, val: prev, type: "start" }];
    let running = prev;
    items.forEach(it => {
      all.push({ label: shortName(it.full_name), val: it.delta, type: it.delta >= 0 ? "pos" : "neg", runningBefore: running });
      running += it.delta;
    });
    all.push({ label: data.period, val: cur, type: "end" });

    const maxV = Math.max(prev, cur, ...items.map(it => Math.abs(it.delta)), 1);
    const W = Math.max(400, Math.min(700, all.length * 70 + 60));
    const H = 280;
    const padL = 50, padR = 16, padT = 20, padB = 50;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barW = Math.max(20, Math.min(50, (innerW - 4 * (all.length - 1)) / all.length));
    const scaleX = innerW / all.length;
    const yScale = (v) => padT + innerH - (v / maxV) * innerH;
    let bars = "";
    let connectors = "";
    let prevRight = null;
    let prevY = null;
    all.forEach((b, i) => {
      const cx = padL + i * scaleX + scaleX / 2;
      const x = cx - barW / 2;
      if (b.type === "start" || b.type === "end") {
        const y = yScale(b.val);
        const bh = padT + innerH - y;
        const color = b.type === "start" ? "var(--color-text-faint)" : "var(--color-primary)";
        bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, bh)}" rx="3" fill="${color}" class="waterfall-bar-total" data-idx="${i}"/>`;
        bars += `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--color-text)" font-family="JetBrains Mono" font-weight="700">${shortMoney(b.val)}</text>`;
        if (prevRight !== null) connectors += `<line x1="${prevRight}" y1="${prevY}" x2="${x}" y2="${prevY}" class="waterfall-connector"/>`;
        prevRight = x + barW; prevY = y;
      } else {
        const delta = b.val;
        const baseV = b.runningBefore;
        const baseY = yScale(baseV);
        const tipY = yScale(baseV + delta);
        const topY = Math.min(baseY, tipY);
        const bh = Math.max(1, Math.abs(baseY - tipY));
        const color = delta >= 0 ? "var(--color-success)" : "var(--color-error)";
        bars += `<rect x="${x}" y="${topY}" width="${barW}" height="${bh}" rx="3" fill="${color}" class="${delta >= 0 ? "waterfall-bar-pos" : "waterfall-bar-neg"}" data-idx="${i}"/>`;
        bars += `<text x="${cx}" y="${(delta >= 0 ? tipY : baseY) - 6}" text-anchor="middle" font-size="10" fill="${delta >= 0 ? "var(--color-success)" : "var(--color-error)"}" font-family="JetBrains Mono" font-weight="700">${delta >= 0 ? "+" : ""}${shortMoney(delta)}</text>`;
        if (prevRight !== null) connectors += `<line x1="${prevRight}" y1="${prevY}" x2="${x}" y2="${prevY}" class="waterfall-connector"/>`;
        prevRight = x + barW; prevY = delta >= 0 ? tipY : baseY;
      }
      bars += `<text x="${cx}" y="${padT + innerH + 16}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)">${escapeHtml(b.label)}</text>`;
    });
    area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">${connectors}${bars}</svg>
      <div style="margin-top:var(--space-3); display:flex; gap:var(--space-4); justify-content:center; font-size:var(--text-xs); color:var(--color-text-muted)">
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-text-faint);vertical-align:middle;margin-right:4px;border-radius:2px"></span>${escapeHtml(data.previous_period)} (СЃС‚Р°СЂС‚)</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-success);vertical-align:middle;margin-right:4px;border-radius:2px"></span>СЂРѕСЃС‚</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-error);vertical-align:middle;margin-right:4px;border-radius:2px"></span>РїР°РґРµРЅРёРµ</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-primary);vertical-align:middle;margin-right:4px;border-radius:2px"></span>${escapeHtml(data.period)} (РёС‚РѕРі)</span>
        <span><b>О” РёС‚РѕРіРѕ: ${data.total_delta >= 0 ? "+" : ""}${formatMoney(data.total_delta)}</b></span>
      </div>`;
  }

  async function loadProfitForm() {
    const period = $("#head-profit-period").value || new Date().toISOString().slice(0, 7);
    const wrap = $("#profit-form");
    try {
      const data = await api(`/api/head/dashboard?period=${encodeURIComponent(period)}`);
      const activeMembers = data.members.filter(m => m.record);
      if (!data.members.length) { wrap.innerHTML = '<div class="empty">Р’ РѕС‚РґРµР»Рµ РЅРµС‚ РјРµРЅРµРґР¶РµСЂРѕРІ</div>'; return; }
      if (!activeMembers.length) { wrap.innerHTML = `<div class="empty">РЈ РјРµРЅРµРґР¶РµСЂРѕРІ РЅРµС‚ СЂР°СЃС‡С‘С‚РѕРІ Р·Р° ${escapeHtml(period)}</div>`; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>Р“СЂРµР№Рґ / РћРєР»Р°Рґ</th><th>РњР°СЂР¶Р° Р·Р° РїРµСЂРёРѕРґ</th><th>РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ РїСЂРѕРґР°Р¶, в‚Ѕ</th></tr></thead>
          <tbody>${activeMembers.map(m => `
            <tr>
              <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(m.full_name)}</b></td>
              <td data-label="Р“СЂРµР№Рґ" class="text-muted">${escapeHtml(m.grade_name || "вЂ”")} / ${m.base_salary != null ? formatMoney(m.base_salary) : "вЂ”"}</td>
              <td data-label="РњР°СЂР¶Р°" class="tnum">${formatMoney((m.record.service_margin || 0) + (m.record.goods_margin || 0))}</td>
              <td data-label="РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ"><input type="number" class="form-input number-input profit-input" data-uid="${m.user_id}" min="0" step="0.01" value="0" style="text-align:right"></td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function calcProfitability() {
    const period = $("#head-profit-period").value || new Date().toISOString().slice(0, 7);
    const items = [];
    $$(".profit-input").forEach(inp => {
      items.push({ user_id: parseInt(inp.dataset.uid), cost_price: parseFloat(inp.value) || 0 });
    });
    if (!items.length) { toast("РЎРЅР°С‡Р°Р»Р° Р·Р°РіСЂСѓР·РёС‚Рµ РјРµРЅРµРґР¶РµСЂРѕРІ", "error"); return; }
    const resBox = $("#profit-result");
    try {
      const r = await api("/api/head/profitability", { method: "POST", body: { period, items } });
      const t = r.totals;
      const fotSt = t.fot_status || "none";
      resBox.innerHTML = `
        <div class="card-header"><div class="card-title">Р РµРЅС‚Р°Р±РµР»СЊРЅРѕСЃС‚СЊ вЂ” ${escapeHtml(r.period)}</div></div>
        <div class="kpis-row">
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.margin)}</div><div class="kpi-lbl">РјР°СЂР¶Р°</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.labor_cost)}</div><div class="kpi-lbl">Р·Рї-СЂР°СЃС…РѕРґС‹</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.operating_cost)}</div><div class="kpi-lbl">РѕРїРµСЂР°С†.</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.cost_price)}</div><div class="kpi-lbl">СЃРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ</div></div>
          <div class="kpi ${t.profit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-val">${formatMoneyShort(t.profit)}</div><div class="kpi-lbl">РїСЂРёР±С‹Р»СЊ</div></div>
          <div class="kpi"><div class="kpi-val">${t.profitability_pct == null ? "вЂ”" : t.profitability_pct + "%"}</div><div class="kpi-lbl">СЂРµРЅС‚Р°Р±.</div></div>
          <div class="kpi"><div class="kpi-val">${t.fot_margin_pct == null ? "вЂ”" : t.fot_margin_pct + "%"}</div><div class="kpi-lbl">Р¤РћРў/РњР°СЂР¶Р°</div><div class="kpi-fot-status ${fotStatusClass[fotSt]}">${fotLabel[fotSt]}</div></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ</th><th>РњР°СЂР¶Р°</th><th>Р¤РћРў</th><th>РќР”Р¤Р›</th><th>Р’Р·РЅРѕСЃС‹</th><th>РќР”РЎ</th><th>РћС„РёСЃ</th><th>Р Р°СЃС…РѕРґС‹</th><th>РџСЂРёР±С‹Р»СЊ</th><th>Р РµРЅС‚Р°Р±.</th><th>Р¤РћРў/Рњ</th></tr></thead>
            <tbody>${r.rows.map(row => {
              const st = row.fot_status || "none";
              return `<tr>
                <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(row.full_name)}</b></td>
                <td data-label="РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ" class="tnum">${formatMoney(row.cost_price)}</td>
                <td data-label="РњР°СЂР¶Р°" class="tnum">${formatMoney(row.margin)}</td>
                <td data-label="Р¤РћРў" class="tnum">${formatMoney(row.gross)}</td>
                <td data-label="РќР”Р¤Р›" class="tnum">${formatMoney(row.ndfl)}</td>
                <td data-label="Р’Р·РЅРѕСЃС‹" class="tnum">${formatMoney(row.insurance)}</td>
                <td data-label="РќР”РЎ" class="tnum">${formatMoney(row.vat)}</td>
                <td data-label="РћС„РёСЃ" class="tnum">${formatMoney(row.office)}</td>
                <td data-label="Р Р°СЃС…РѕРґС‹" class="tnum">${formatMoney(row.total_cost)}</td>
                <td data-label="РџСЂРёР±С‹Р»СЊ" class="tnum ${row.profit >= 0 ? "net-cell" : "kpi-red"}">${formatMoney(row.profit)}</td>
                <td data-label="Р РµРЅС‚Р°Р±." class="tnum"><b>${row.profitability_pct == null ? "вЂ”" : row.profitability_pct + "%"}</b></td>
                <td data-label="Р¤РћРў/РњР°СЂР¶Р°" class="tnum ${fotCellClass[st] || ""}">${row.fot_margin_pct == null ? "вЂ”" : row.fot_margin_pct + "%"}</td>
              </tr>`;
            }).join("")}</tbody>
            <tfoot><tr style="font-weight:700;background:var(--color-surface-2)">
              <td>РС‚РѕРі</td>
              <td class="tnum">${formatMoney(t.cost_price)}</td><td class="tnum">${formatMoney(t.margin)}</td>
              <td class="tnum">${formatMoney(t.gross)}</td><td class="tnum">${formatMoney(t.ndfl)}</td>
              <td class="tnum">${formatMoney(t.insurance)}</td><td class="tnum">${formatMoney(t.vat)}</td>
              <td class="tnum">${formatMoney(t.office)}</td><td class="tnum">${formatMoney(t.total_cost)}</td>
              <td class="tnum ${t.profit >= 0 ? "net-cell" : "kpi-red"}">${formatMoney(t.profit)}</td>
              <td class="tnum"><b>${t.profitability_pct == null ? "вЂ”" : t.profitability_pct + "%"}</b></td>
              <td class="tnum ${fotCellClass[fotSt] || ""}">${t.fot_margin_pct == null ? "вЂ”" : t.fot_margin_pct + "%"}</td>
            </tr></tfoot>
          </table>
        </div>`;
      resBox.style.display = "block";
      toast("Р РµРЅС‚Р°Р±РµР»СЊРЅРѕСЃС‚СЊ СЂР°СЃСЃС‡РёС‚Р°РЅР°", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadCosts() {
    const period = $("#head-costs-period").value || new Date().toISOString().slice(0, 7);
    const totalsEl = $("#costs-totals");
    const laborEl = $("#costs-labor");
    const operatingEl = $("#costs-operating");
    try {
      const r = await api(`/api/head/costs?period=${encodeURIComponent(period)}`);
      const t = r.totals;
      const fotSt = t.fot_status || "none";
      totalsEl.innerHTML = `
        <div class="kpi"><div class="kpi-val">${t.managers}</div><div class="kpi-lbl">РјРµРЅРµРґР¶РµСЂРѕРІ</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.gross)}</div><div class="kpi-lbl">Р¤РћРў gross</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.ndfl)}</div><div class="kpi-lbl">РќР”Р¤Р›</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.insurance)}</div><div class="kpi-lbl">РІР·РЅРѕСЃС‹ 30%</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.vat)}</div><div class="kpi-lbl">РќР”РЎ 5%</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.office)}</div><div class="kpi-lbl">РѕС„РёСЃ</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.labor_cost)}</div><div class="kpi-lbl">Р·Рї-СЂР°СЃС…РѕРґС‹</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.operating_cost)}</div><div class="kpi-lbl">РѕРїРµСЂР°С†.</div></div>
        <div class="kpi"><div class="kpi-val">${t.fot_margin_pct == null ? "вЂ”" : t.fot_margin_pct + "%"}</div><div class="kpi-lbl">Р¤РћРў/РњР°СЂР¶Р°</div><div class="kpi-fot-status ${fotStatusClass[fotSt]}">${fotLabel[fotSt]}</div></div>`;
      if (!r.items.length) {
        laborEl.innerHTML = '<div class="empty">Р’ РѕС‚РґРµР»Рµ РЅРµС‚ РјРµРЅРµРґР¶РµСЂРѕРІ</div>';
        operatingEl.innerHTML = '<div class="empty">Р’ РѕС‚РґРµР»Рµ РЅРµС‚ РјРµРЅРµРґР¶РµСЂРѕРІ</div>';
        return;
      }
      laborEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>Р¤РћРў (gross)</th><th>РќР”Р¤Р›</th><th>Р’Р·РЅРѕСЃС‹ 30%</th></tr></thead>
          <tbody>${r.items.map(it => `<tr>
            <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(it.full_name)}</b></td>
            ${it.has_record
              ? `<td data-label="Р¤РћРў" class="tnum">${formatMoney(it.gross)}</td><td data-label="РќР”Р¤Р›" class="tnum">${formatMoney(it.ndfl)}</td><td data-label="Р’Р·РЅРѕСЃС‹" class="tnum">${formatMoney(it.insurance)}</td>`
              : `<td colspan="3" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
          </tr>`).join("")}</tbody>
        </table>`;
      operatingEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>РњРµРЅРµРґР¶РµСЂ</th><th>РњР°СЂР¶Р°</th><th>РќР”РЎ 5%</th><th>РћС„РёСЃ</th><th>Р¤РћРў/РњР°СЂР¶Р°</th></tr></thead>
          <tbody>${r.items.map(it => {
            const st = it.fot_status || "none";
            return `<tr>
              <td data-label="РњРµРЅРµРґР¶РµСЂ"><b>${escapeHtml(it.full_name)}</b></td>
              ${it.has_record
                ? `<td data-label="РњР°СЂР¶Р°" class="tnum">${formatMoney(it.margin)}</td><td data-label="РќР”РЎ" class="tnum">${formatMoney(it.vat)}</td>`
                : `<td colspan="2" class="text-muted" style="text-align:center">РќРµС‚ СЂР°СЃС‡С‘С‚Р°</td>`}
              <td data-label="РћС„РёСЃ" class="tnum">${formatMoney(it.office)}</td>
              <td data-label="Р¤РћРў/РњР°СЂР¶Р°" class="tnum ${fotCellClass[st] || ""}">${it.fot_margin_pct == null ? "вЂ”" : it.fot_margin_pct + "%"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>`;
    } catch (e) {
      totalsEl.innerHTML = "";
      laborEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      operatingEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function showCostFormulas() {
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal modal-formula">
        <div class="modal-title-row"><div class="modal-title">Р¤РѕСЂРјСѓР»С‹ СЂР°СЃС…РѕРґРѕРІ</div><button class="modal-close" type="button" onclick="this.closest('.modal-bg').remove()">вњ•</button></div>
        <div class="formula-section">
          <div class="formula-section-title">1. Р¤РћРў (gross)</div>
          <div class="formula-line"><span class="ftxt">Р¤РћРў</span><span class="fsep">=</span><span class="ftxt">РћРєР»Р°Рґ</span><span class="fsep">Г—</span><span class="fval">РѕС‚СЂР°Р±РѕС‚Р°РЅРѕГ·СЂР°Р±.РґРЅРµР№</span><span class="fsep">+</span><span class="ftxt">РџСЂРµРјРёСЏ СѓСЃР»СѓРі + РџСЂРµРјРёСЏ С‚РѕРІР°СЂР°</span></div>
          <div class="formula-sub">Р‘РµСЂС‘С‚СЃСЏ РёР· СЂР°СЃС‡С‘С‚Р° Р—Рџ РјРµРЅРµРґР¶РµСЂР° (РїРѕР»Рµ <b>gross_pay</b>)</div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">2. РќР”Р¤Р› <span class="formula-hint">13%</span></div>
          <div class="formula-line"><span class="ftxt">РќР”Р¤Р›</span><span class="fsep">=</span><span class="ftxt">Р¤РћРў</span><span class="fsep">Г—</span><span class="fval">13%</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">3. РЎС‚СЂР°С…РѕРІС‹Рµ РІР·РЅРѕСЃС‹ IT-Р»СЊРіРѕС‚Р° <span class="formula-hint">30%</span></div>
          <div class="formula-line"><span class="ftxt">Р’Р·РЅРѕСЃС‹</span><span class="fsep">=</span><span class="ftxt">Р¤РћРў</span><span class="fsep">Г—</span><span class="fval">30%</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">4. РќР”РЎ <span class="formula-hint">5% СЃ РјР°СЂР¶Рё</span></div>
          <div class="formula-line"><span class="ftxt">РќР”РЎ</span><span class="fsep">=</span><span class="ftxt">РњР°СЂР¶Р° (СѓСЃР»СѓРіРё+С‚РѕРІР°СЂ)</span><span class="fsep">Г—</span><span class="fval">5%</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">5. РћС„РёСЃ <span class="formula-hint">45 000 в‚Ѕ РЅР° СЃРѕС‚СЂСѓРґРЅРёРєР°</span></div>
          <div class="formula-line"><span class="ftxt">РћС„РёСЃ</span><span class="fsep">=</span><span class="fval">45 000 в‚Ѕ</span><span class="fsep">Г—</span><span class="ftxt">РєРѕР»-РІРѕ РјРµРЅРµРґР¶РµСЂРѕРІ</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">6. Р—Рџ-СЂР°СЃС…РѕРґС‹</div>
          <div class="formula-line"><span class="ftxt">Р—Рџ-СЂР°СЃС…РѕРґС‹</span><span class="fsep">=</span><span class="ftxt">Р¤РћРў + РќР”Р¤Р› + Р’Р·РЅРѕСЃС‹</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">7. РћРїРµСЂР°С†РёРѕРЅРЅС‹Рµ СЂР°СЃС…РѕРґС‹</div>
          <div class="formula-line"><span class="ftxt">РћРїРµСЂР°С†.</span><span class="fsep">=</span><span class="ftxt">РќР”РЎ + РћС„РёСЃ</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">8. Р¤РћРў / РњР°СЂР¶Р° <span class="formula-hint">РЅРѕСЂРјС‹ РђР Рў</span></div>
          <div class="formula-line"><span class="ftxt">Р¤РћРў/РњР°СЂР¶Р°</span><span class="fsep">=</span><span class="ftxt">Р¤РћРў</span><span class="fsep">Г·</span><span class="ftxt">РњР°СЂР¶Р°</span><span class="fsep">Г—</span><span class="fval">100%</span></div>
          <div class="formula-sub">Р—РµР»С‘РЅР°СЏ Р·РѕРЅР°: <b>в‰¤ 20%</b> (РЅРѕСЂРјР°) В· Р–С‘Р»С‚Р°СЏ: <b>20вЂ“25%</b> В· РљСЂР°СЃРЅР°СЏ: <b>> 25%</b> (РєСЂРёС‚РёС‡РЅРѕ)</div>
        </div>
        <div class="modal-actions"><button class="btn-accent" onclick="this.closest('.modal-bg').remove()">РџРѕРЅСЏС‚РЅРѕ</button></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
  function formatMoney(v) { const n = Number(v || 0); return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " в‚Ѕ"; }
  function formatMoneyShort(v) { const n = Number(v || 0); if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " РјР»РЅ в‚Ѕ"; if (Math.abs(n) >= 1e3) return Math.round(n).toLocaleString("ru-RU") + " в‚Ѕ"; return formatMoney(v); }
  function shortMoney(v) { const n = Number(v || 0); if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "Рњ"; if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "Рє"; return String(Math.round(n)); }

  function toggleTheme() { const html = document.documentElement; const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark"; html.setAttribute("data-theme", next); localStorage.setItem("bitserves_theme", next); }
  function initTheme() { const saved = localStorage.getItem("bitserves_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); }

  async function init() {
    initTheme();
    document.addEventListener("click", (e) => {
      if (e.target.classList && e.target.classList.contains("modal-bg")) {
        e.target.remove();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-bg.visible").forEach(m => m.remove());
      }
    });
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
    } catch {}
    if (getToken() && getUser()) enterApp();
    else showLogin();
  }

  return {
    init, switchAuthTab, submitAuth, logout, navigate, onDeptChange, onRoleChange,
    loadHistory, loadProfile, saveProfile, calculate, toggleTheme,
    showFormula, exportRecord, loadSummary, switchMetric, toggleHistory,
    loadDashboard, loadAnalytics, loadWaterfall, loadProfitForm, calcProfitability,
    loadCosts, showCostFormulas,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
