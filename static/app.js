const App = (() => {
  const TOKEN_KEY = "bitserves_token";
  const USER_KEY = "bitserves_user";

  let authMode = "signin";
  let gradesCache = [];
  let departmentsCache = [];
  let positionsCache = [];

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
      const msg = (data && data.detail) ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : `Ошибка ${res.status}`;
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
    $("#auth-submit").textContent = mode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    $("#auth-error").style.display = "none";
    if (mode === "signup") loadCatalogForSignup();
  }

  function showAuthError(msg) { const el = $("#auth-error"); el.textContent = msg; el.style.display = "block"; }

  async function loadCatalogForSignup() {
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
      renderDeptSelect();
      renderGradeSelect();
    } catch (e) {
      showAuthError("Не удалось загрузить справочники: " + e.message);
    }
  }

  function renderDeptSelect() {
    const sel = $("#dept");
    sel.innerHTML = '<option value="">— Выберите отдел —</option>' + departmentsCache.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  }
  function renderGradeSelect() {
    const sel = $("#grade");
    sel.innerHTML = '<option value="">— Выберите грейд —</option>' + gradesCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)} — ${formatMoney(g.base_salary)} / ${g.bonus_percent}%</option>`).join("");
  }

  async function onDeptChange() {
    const deptId = parseInt($("#dept").value);
    if (!deptId) { $("#pos").innerHTML = '<option value="">Сначала выберите отдел</option>'; return; }
    try {
      positionsCache = await api(`/api/positions?department_id=${deptId}`, { auth: false });
      const sel = $("#pos");
      if (!positionsCache.length) { sel.innerHTML = '<option value="">Нет доступных должностей</option>'; return; }
      sel.innerHTML = '<option value="">— Выберите должность —</option>' + positionsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    } catch (e) {
      $("#pos").innerHTML = '<option value="">Ошибка загрузки</option>';
    }
  }

  async function submitAuth() {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    if (!email || !password) { showAuthError("Заполните почту и пароль"); return; }
    if (password.length < 6) { showAuthError("Пароль минимум 6 символов"); return; }
    const btn = $("#auth-submit");
    btn.disabled = true; btn.textContent = "Подождите…";
    try {
      if (authMode === "signup") {
        const full_name = $("#full_name").value.trim();
        const deptId = parseInt($("#dept").value);
        const posId = parseInt($("#pos").value);
        const gradeId = $("#grade").value;
        if (!full_name) { showAuthError("Введите ФИО"); btn.disabled = false; btn.textContent = "Зарегистрироваться"; return; }
        if (!deptId || !posId || !gradeId) { showAuthError("Выберите отдел, должность и грейд"); btn.disabled = false; btn.textContent = "Зарегистрироваться"; return; }
        const data = await api("/api/auth/register", { method: "POST", auth: false, body: { email, password, full_name, department_id: deptId, position_id: posId, grade_id: gradeId } });
        setSession(data.access_token, data.user);
        enterApp();
      } else {
        const data = await api("/api/auth/login", { method: "POST", auth: false, body: { email, password } });
        setSession(data.access_token, data.user);
        enterApp();
      }
    } catch (e) {
      showAuthError(e.message || "Ошибка авторизации");
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    }
  }

  function enterApp() {
    const user = getUser();
    if (!user) { showLogin(); return; }
    $("#login-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    $("#sidebar-username").textContent = user.full_name || user.email.split("@")[0];
    $("#sidebar-email").textContent = user.email;
    $("#sidebar-dept-badge").textContent = "Отдел: " + (user.department ? user.department.name : "—");
    $("#user-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    $("#hello-name").textContent = user.full_name || "менеджер";

    const deptCode = user.department ? user.department.code : "";
    if (deptCode === "dev_art") {
      $("#nav-payroll").classList.remove("disabled");
      $("#payroll-badge").style.display = "inline-block";
      $("#svc-payroll").classList.remove("disabled");
      $("#svc-payroll-status").textContent = "Доступен";
      $("#svc-payroll-status").className = "service-status active-open";
    } else {
      $("#nav-payroll").classList.add("disabled");
      $("#nav-payroll").onclick = () => toast("Отдел Сопровождение — микросервис в разработке", "info");
      $("#payroll-badge").style.display = "none";
      $("#svc-payroll").classList.add("disabled");
      $("#svc-payroll-status").textContent = "Скоро";
      $("#svc-payroll-status").className = "service-status soon";
      $("#svc-payroll").onclick = () => toast("Отдел Сопровождение — микросервис в разработке", "info");
      toast("Отдел «" + (user.department ? user.department.name : "") + "» — микросервис ЗП в разработке", "info");
    }
    navigate("menu");
  }

  function showLogin() { $("#app-screen").classList.remove("active"); $("#login-screen").classList.add("active"); }
  function logout() { clearSession(); location.reload(); }

  function navigate(route) {
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    $$("#app-screen .page").forEach(p => p.style.display = "none");
    const page = $(`#page-${route}`);
    if (page) page.style.display = "block";
    if (route === "payroll") { loadGradePill(); loadHistory(); }
    if (route === "profile") { loadProfile(); }
  }

  function loadGradePill() {
    const user = getUser();
    if (!user) return;
    const g = user.grade || {};
    $("#grade-pill").innerHTML = `
      <div class="gp-item"><div class="gp-label">ФИО</div><div class="gp-value">${escapeHtml(user.full_name || "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Должность</div><div class="gp-value">${escapeHtml(user.position ? user.position.name : "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Грейд</div><div class="gp-value">${escapeHtml(g.name || "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Оклад</div><div class="gp-value">${g.base_salary != null ? formatMoney(g.base_salary) : "—"}</div></div>
      <div class="gp-item"><div class="gp-label">% премии</div><div class="gp-value">${g.bonus_percent != null ? g.bonus_percent + "%" : "—"}</div></div>
      <div class="gp-item"><div class="gp-label">Коэф. услуг</div><div class="gp-value">${g.service_factor != null ? Number(g.service_factor).toFixed(2) : "—"}</div></div>`;
  }

  async function calculate() {
    const body = {
      period: ($("#calc-period").value || new Date().toISOString().slice(0, 7)),
      worked_days: parseInt($("#calc-worked").value),
      working_days: parseInt($("#calc-working").value),
      service_margin: parseFloat($("#calc-svc-margin").value) || 0,
      goods_margin: parseFloat($("#calc-goods-margin").value) || 0,
      tax_rate: parseFloat($("#calc-tax").value) || 13,
    };
    const resBox = $("#calc-result");
    resBox.style.display = "none";
    try {
      const r = await api("/api/payroll/calculate", { method: "POST", body });
      resBox.innerHTML = `
        <div class="cr-title">Расчёт за ${escapeHtml(r.period)} — сохранён</div>
        <div class="cr-grid">
          <div class="cr-item"><div class="cr-label">Начислено (оклад)</div><div class="cr-value">${formatMoney(r.accrued_base)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия за услуги</div><div class="cr-value">${formatMoney(r.services_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия за товар</div><div class="cr-value">${formatMoney(r.goods_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия итого (${r.bonus_percent}%)</div><div class="cr-value">${formatMoney(r.bonus_total)}</div></div>
          <div class="cr-item"><div class="cr-label">Начислено всего</div><div class="cr-value">${formatMoney(r.gross_pay)}</div></div>
          <div class="cr-item"><div class="cr-label">НДФЛ (${r.tax_rate}%)</div><div class="cr-value">-${formatMoney(r.tax_amount)}</div></div>
          <div class="cr-item cr-net"><div class="cr-label">К выплате</div><div class="cr-value">${formatMoney(r.net_pay)}</div></div>
        </div>
        <div class="cr-actions">
          <button class="btn-excel" onclick="App.exportRecord(${r.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Скачать Excel
          </button>
        </div>`;
      resBox.style.display = "block";
      loadHistory();
      toast("Расчёт сохранён", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadHistory() {
    const wrap = $("#payroll-history");
    if (!wrap) return;
    try {
      const rows = await api("/api/payroll/history");
      if (!rows.length) { wrap.innerHTML = '<div class="empty">Нет сохранённых расчётов</div>'; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>№</th><th>Период</th><th>Грейд</th><th>Дни</th><th>Маржа усл./товар</th><th>Оклад</th><th>Премия</th><th>Gross</th><th>НДФЛ</th><th>К выплате</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr>
            <td data-label="№" class="tnum">${i + 1}</td>
            <td data-label="Период">${escapeHtml(r.period)}</td>
            <td data-label="Грейд" class="text-muted">${escapeHtml(r.grade_name)}</td>
            <td data-label="Дни" class="tnum">${r.worked_days}/${r.working_days}</td>
            <td data-label="Маржа усл./товар" class="tnum">${formatMoney(r.service_margin)} / ${formatMoney(r.goods_margin)}</td>
            <td data-label="Оклад" class="tnum">${formatMoney(r.base_salary)}</td>
            <td data-label="Премия" class="tnum">${formatMoney(r.bonus_total)}</td>
            <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
            <td data-label="НДФЛ" class="tnum">-${formatMoney(r.tax_amount)}</td>
            <td data-label="К выплате" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
            <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.id})" title="Скачать Excel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
          </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function loadProfile() {
    const card = $("#profile-card");
    try {
      const u = await api("/api/auth/me");
      const deptName = u.department ? u.department.name : "—";
      const deptDisabledNote = (u.department && u.department.code !== "dev_art") ? '<div class="text-muted" style="font-size:var(--text-xs);margin-top:4px">Отдел нельзя изменить после регистрации</div>' : "";
      const positionsOpts = positionsCache.filter(p => p.department_id === u.department.id).map(p => `<option value="${p.id}" ${u.position && u.position.id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
      const gradesOpts = gradesCache.map(g => `<option value="${g.id}" ${u.grade && u.grade.id === g.id ? "selected" : ""}>${escapeHtml(g.name)} — ${formatMoney(g.base_salary)} / ${g.bonus_percent}%</option>`).join("");
      card.innerHTML = `
        <div class="profile-grid">
          <div class="form-group"><label class="form-label">ФИО</label><input class="form-input" id="prof-name" value="${escapeHtml(u.full_name)}"></div>
          <div class="form-group"><label class="form-label">Почта</label><input class="form-input" value="${escapeHtml(u.email)}" readonly></div>
          <div class="form-group"><label class="form-label">Отдел</label><input class="form-input" value="${escapeHtml(deptName)}" readonly>${deptDisabledNote}</div>
          <div class="form-group"><label class="form-label">Должность</label><select class="form-input" id="prof-pos">${positionsOpts}</select></div>
          <div class="form-group"><label class="form-label">Грейд</label><select class="form-input" id="prof-grade">${gradesOpts}</select></div>
        </div>
        <div class="profile-actions">
          <button class="btn-accent" onclick="App.saveProfile()">Сохранить изменения</button>
        </div>`;
      if (!positionsCache.length || positionsCache[0].department_id !== u.department.id) {
        try {
          positionsCache = await api(`/api/positions?department_id=${u.department.id}`, { auth: false });
          gradesCache = await api("/api/grades", { auth: false });
          loadProfile();
        } catch (e) {}
      }
    } catch (e) {
      card.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  async function saveProfile() {
    const full_name = $("#prof-name").value.trim();
    const position_id = parseInt($("#prof-pos").value);
    const grade_id = $("#prof-grade").value;
    try {
      const updated = await api("/api/auth/me", { method: "PUT", body: { full_name, position_id, grade_id } });
      setSession(getToken(), updated);
      toast("Профиль обновлён", "success");
      $("#sidebar-username").textContent = updated.full_name || updated.email.split("@")[0];
      $("#hello-name").textContent = updated.full_name || "менеджер";
      $("#user-avatar").textContent = (updated.full_name || updated.email)[0].toUpperCase();
      navigate("menu");
    } catch (e) { toast(e.message, "error"); }
  }

  function showFormula() {
    const user = getUser();
    const g = (user && user.grade) ? user.grade : { base_salary: 0, bonus_percent: 0, service_factor: 0.5 };
    const svc = parseFloat($("#calc-svc-margin").value) || 0;
    const goods = parseFloat($("#calc-goods-margin").value) || 0;
    const worked = parseInt($("#calc-worked").value) || 0;
    const working = parseInt($("#calc-working").value) || 1;
    const tax = parseFloat($("#calc-tax").value) || 13;
    const accrued = round2(g.base_salary * worked / working);
    const svcBonus = round2(svc * g.service_factor * g.bonus_percent / 100);
    const goodsBonus = round2(goods * g.bonus_percent / 100);
    const bonusTotal = round2(svcBonus + goodsBonus);
    const gross = round2(accrued + bonusTotal);
    const taxAmt = round2(gross * tax / 100);
    const net = round2(gross - taxAmt);
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal modal-formula">
        <div class="modal-title">Формула расчёта</div>
        <div class="formula-section">
          <div class="formula-section-title">1. Начисление по окладу</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">×</span><span class="fval">${worked}</span><span class="fsep">÷</span><span class="fval">${working}</span><span class="fsep">=</span><span class="fresult">${formatMoney(accrued)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">2. Премия за услуги <span class="formula-hint">× коэффициент ${Number(g.service_factor).toFixed(2)} · ${g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа услуг</span><span class="fsep">×</span><span class="fval">${Number(g.service_factor).toFixed(2)}</span><span class="fsep">×</span><span class="fval">${g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(svcBonus)}</span></div>
          <div class="formula-sub">Маржа услуг = сумма столбцов отчёта: <b>Услуги, ЦТО, Регулярное сопровождение — ИТС, Консалтинг, Доставка</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">3. Премия за товар <span class="formula-hint">${g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа товара</span><span class="fsep">×</span><span class="fval">${g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(goodsBonus)}</span></div>
          <div class="formula-sub">Маржа товара = сумма столбцов отчёта: <b>Торговое оборудование, 1С, Промышленное оборудование</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">4. Начислено всего</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">+</span><span class="ftxt">Премия услуг</span><span class="fsep">+</span><span class="ftxt">Премия товара</span><span class="fsep">=</span><span class="fresult">${formatMoney(gross)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">5. НДФЛ</div>
          <div class="formula-line"><span class="ftxt">${tax}%</span><span class="fsep">от</span><span class="fval">${formatMoney(gross)}</span><span class="fsep">=</span><span class="fresult fresult-mute">-${formatMoney(taxAmt)}</span></div>
        </div>
        <div class="formula-section formula-total">
          <div class="formula-line"><span class="ftotal-label">К выплате</span><span class="fsep">=</span><span class="ftotal-value">${formatMoney(net)}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn-accent" onclick="this.closest('.modal-bg').remove()">Понятно</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function exportRecord(recordId) {
    try {
      const token = getToken();
      const res = await fetch(`/api/payroll/records/${recordId}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const msg = await res.text(); throw new Error(msg || `Ошибка ${res.status}`); }
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
      toast("Excel выгружен", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
  }
  function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("bitserves_theme", next);
  }
  function initTheme() { const saved = localStorage.getItem("bitserves_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); }

  async function init() {
    initTheme();
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
    } catch {}
    if (getToken() && getUser()) enterApp();
    else showLogin();
  }

  return {
    init, switchAuthTab, submitAuth, logout, navigate, onDeptChange,
    loadHistory, loadProfile, saveProfile, calculate, toggleTheme,
    showFormula, exportRecord,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);