const App = (() => {
  const TOKEN_KEY = "bitserves_token";
  const USER_KEY = "bitserves_user";

  let authMode = "signin";
  let gradesCache = [];
  let employeesCache = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
  function setSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  async function api(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
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

  function switchAuthTab(mode) {
    authMode = mode;
    $$("#login-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === mode));
    $("#signup-field").style.display = mode === "signup" ? "block" : "none";
    $("#auth-submit").textContent = mode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    $("#auth-error").style.display = "none";
  }

  function showAuthError(msg) { const el = $("#auth-error"); el.textContent = msg; el.style.display = "block"; }

  async function submitAuth() {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const fullName = $("#full_name").value.trim();
    if (!email || !password) { showAuthError("Заполните почту и пароль"); return; }
    if (password.length < 6) { showAuthError("Пароль минимум 6 символов"); return; }
    const btn = $("#auth-submit");
    btn.disabled = true; btn.textContent = "Подождите…";
    try {
      const url = authMode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const payload = authMode === "signup" ? { email, password, full_name: fullName } : { email, password };
      const data = await api(url, { method: "POST", body: payload });
      setSession(data.access_token, data.user);
      enterApp();
    } catch (e) {
      showAuthError(e.message || "Ошибка авторизации");
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    }
  }

  async function enterApp() {
    const user = getUser();
    if (!user) { showLogin(); return; }
    $("#login-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    $("#sidebar-username").textContent = user.full_name || user.email.split("@")[0];
    $("#sidebar-email").textContent = user.email;
    $("#user-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    $("#hello-name").textContent = user.full_name || "менеджер";
    await loadGrades();
    navigate("menu");
  }

  function showLogin() { $("#app-screen").classList.remove("active"); $("#login-screen").classList.add("active"); }

  function logout() { clearSession(); showLogin(); }

  function navigate(route) {
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    $$("#app-screen .page").forEach(p => p.style.display = "none");
    const page = $(`#page-${route}`);
    if (page) page.style.display = "block";
    if (route === "payroll") { loadEmployees(); loadHistory(); }
    if (route === "profile") { loadProfile(); }
  }

  async function loadGrades() {
    try { gradesCache = await api("/api/payroll/grades"); }
    catch (e) { gradesCache = []; }
  }

  function gradeName(id) { const g = gradesCache.find(x => x.id === id); return g ? g.name : id; }

  async function loadProfile() {
    const el = $("#profile-info");
    el.innerHTML = '<div class="empty">Загрузка…</div>';
    try {
      const u = await api("/api/auth/me");
      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:var(--space-3)">
        <div><div class="text-muted">ФИО</div><div style="font-weight:600">${escapeHtml(u.full_name || "—")}</div></div>
        <div><div class="text-muted">Почта</div><div style="font-weight:600">${escapeHtml(u.email)}</div></div>
        <div><div class="text-muted">Роль</div><div style="font-weight:600">${escapeHtml(u.role)}</div></div></div>`;
    } catch (e) { el.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function loadEmployees() {
    const list = $("#employee-list");
    const select = $("#calc-employee");
    try {
      const employees = await api("/api/payroll/employees");
      employeesCache = employees;
      if (!employees.length) {
        list.innerHTML = '<div class="empty">Сотрудников нет. Добавьте первого</div>';
        select.innerHTML = '<option value="">Сначала добавьте сотрудника</option>';
        return;
      }
      list.innerHTML = employees.map(emp => `
        <div class="employee-row">
          <div class="er-avatar">${escapeHtml(emp.full_name[0].toUpperCase())}</div>
          <div class="er-info">
            <div class="er-name">${escapeHtml(emp.full_name)}</div>
            <div class="er-meta">${escapeHtml(emp.grade_name || emp.grade)} · Оклад: ${formatMoney(emp.base_salary)} · ${emp.bonus_percent}%</div>
          </div>
          <div class="er-actions">
            <button class="btn-ghost btn-sm" onclick="App.editEmployee(${emp.id})">Изм</button>
            <button class="btn-ghost btn-sm" onclick="App.deleteEmployee(${emp.id})">✕</button>
          </div>
        </div>`).join("");
      select.innerHTML = '<option value="">— Выберите —</option>' + employees.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)} — ${escapeHtml(e.grade_name || e.grade)}</option>`).join("");
    } catch (e) {
      list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      select.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
  }

  function showEmployeeForm(emp) {
    const mode = emp ? "edit" : "create";
    const gradeOptions = gradesCache.map(g => `<option value="${g.id}" ${(emp && emp.grade === g.id) ? "selected" : ""}>${escapeHtml(g.name)} — ${formatMoney(g.base_salary)} / ${g.bonus_percent}%</option>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${mode === "edit" ? "Изменить сотрудника" : "Новый сотрудник"}</div>
        <div class="form-group"><label class="form-label">ФИО</label><input class="form-input" id="emp-name" value="${emp ? escapeHtml(emp.full_name) : ""}"></div>
        <div class="form-group"><label class="form-label">Должность</label><input class="form-input" id="emp-pos" value="${emp ? escapeHtml(emp.position) : ""}"></div>
        <div class="form-group"><label class="form-label">Грейд</label><select class="form-input" id="emp-grade" onchange="App.onGradeChange()">${gradeOptions}</select></div>
        <div class="form-group"><label class="form-label">Оклад, ₽ <span class="text-muted">(из грейда)</span></label><input class="form-input" id="emp-salary" type="number" readonly></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="emp-cancel">Отмена</button>
          <button class="btn-accent" id="emp-save">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    updateSalaryFromGrade(overlay);
    overlay.querySelector("#emp-cancel").onclick = () => overlay.remove();
    overlay.querySelector("#emp-save").onclick = async () => {
      const name = overlay.querySelector("#emp-name").value.trim();
      const pos = overlay.querySelector("#emp-pos").value.trim();
      const gradeId = overlay.querySelector("#emp-grade").value;
      if (!name) { alert("Введите ФИО"); return; }
      try {
        if (mode === "edit") {
          await api(`/api/payroll/employees/${emp.id}`, { method: "PUT", body: { full_name: name, position: pos, grade: gradeId } });
        } else {
          await api("/api/payroll/employees", { method: "POST", body: { full_name: name, position: pos, grade: gradeId } });
        }
        overlay.remove();
        loadEmployees();
      } catch (e) { alert(e.message); }
    };
  }

  function onGradeChange() {
    const overlay = document.querySelector(".modal-bg.visible");
    if (!overlay) return;
    updateSalaryFromGrade(overlay);
  }

  function updateSalaryFromGrade(overlay) {
    const gradeId = overlay.querySelector("#emp-grade").value;
    const grade = gradesCache.find(g => g.id === gradeId);
    if (grade) overlay.querySelector("#emp-salary").value = grade.base_salary;
  }

  async function editEmployee(id) {
    const emp = employeesCache.find(e => e.id === id);
    if (emp) showEmployeeForm(emp);
  }

  async function deleteEmployee(id) {
    if (!confirm("Удалить сотрудника и все его расчёты?")) return;
    try { await api(`/api/payroll/employees/${id}`, { method: "DELETE" }); loadEmployees(); loadHistory(); }
    catch (e) { alert(e.message); }
  }

  async function calculate() {
    const body = {
      employee_id: parseInt($("#calc-employee").value),
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
      const emp = employeesCache.find(e => e.id === r.employee_id) || { full_name: `Сотрудник #${r.employee_id}`, grade_name: r.grade };
      resBox.innerHTML = `
        <div class="cr-title">Расчёт за ${escapeHtml(r.period)} — ${escapeHtml(emp.full_name)} (${escapeHtml(emp.grade_name || r.grade)}) сохранён</div>
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
    } catch (e) { alert(e.message); }
  }

  async function loadHistory() {
    const wrap = $("#payroll-history");
    if (!wrap) return;
    try {
      const rows = await api("/api/payroll/history");
      if (!rows.length) { wrap.innerHTML = '<div class="empty">Нет сохранённых расчётов</div>'; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>№</th><th>Период</th><th>Сотрудник</th><th>Грейд</th><th>Дни</th><th>Маржа усл./товар</th><th>Оклад</th><th>Премия</th><th>Gross</th><th>НДФЛ</th><th>К выплате</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const emp = employeesCache.find(e => e.id === r.employee_id);
            return `<tr>
              <td data-label="№" class="tnum">${i + 1}</td>
              <td data-label="Период">${escapeHtml(r.period)}</td>
              <td data-label="Сотрудник">${emp ? escapeHtml(emp.full_name) : ("ID " + r.employee_id)}</td>
              <td data-label="Грейд" class="text-muted">${escapeHtml(emp ? (emp.grade_name || emp.grade) : r.grade)}</td>
              <td data-label="Дни" class="tnum">${r.worked_days}/${r.working_days}</td>
              <td data-label="Маржа усл./товар" class="tnum">${formatMoney(r.service_margin)} / ${formatMoney(r.goods_margin)}</td>
              <td data-label="Оклад" class="tnum">${formatMoney(r.accrued_base)}</td>
              <td data-label="Премия" class="tnum">${formatMoney(r.bonus_total)}</td>
              <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
              <td data-label="НДФЛ" class="tnum">-${formatMoney(r.tax_amount)}</td>
              <td data-label="К выплате" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
              <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.id})" title="Скачать Excel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button></td>
            </tr>`;
          }).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function showFormulaApprove() {
    const empId = parseInt($("#calc-employee").value);
    const emp = employeesCache.find(e => e.id === empId);
    const g = gradesCache.find(x => x.id === (emp ? emp.grade : (gradesCache[0] ? gradesCache[0].id : "trainee"))) || gradesCache[0] || { bonus_percent: 4, service_factor: 0.5, base_salary: 45000 };
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
    return { g, svc, goods, worked, working, tax, accrued, svcBonus, goodsBonus, bonusTotal, gross, taxAmt, net };
  }

  function showFormula() {
    const f = showFormulaApprove();
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal modal-formula">
        <div class="modal-title">Формула расчёта</div>
        <div class="formula-section">
          <div class="formula-section-title">1. Начисление по окладу</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">×</span><span class="fval">${f.worked}</span><span class="fsep">÷</span><span class="fval">${f.working}</span><span class="fsep">=</span><span class="fresult">${formatMoney(f.accrued)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">2. Премия за услуги <span class="formula-hint">× коэффициент 0,5 · ${f.g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа услуг</span><span class="fsep">×</span><span class="fval">${f.g.service_factor.toFixed(2)}</span><span class="fsep">×</span><span class="fval">${f.g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(f.svcBonus)}</span></div>
          <div class="formula-sub">Маржа услуг = сумма столбцов отчёта: <b>Услуги, ЦТО, ИТС, Консалтинг, Доставка</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">3. Премия за товар <span class="formula-hint">${f.g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа товара</span><span class="fsep">×</span><span class="fval">${f.g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(f.goodsBonus)}</span></div>
          <div class="formula-sub">Маржа товара = сумма столбцов отчёта: <b>Торговое оборудование, 1С, Промышленное оборудование</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">4. Начислено всего</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">+</span><span class="ftxt">Премия услуг</span><span class="fsep">+</span><span class="ftxt">Премия товара</span><span class="fsep">=</span><span class="fresult">${formatMoney(f.gross)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">5. НДФЛ</div>
          <div class="formula-line"><span class="ftxt">${f.tax}%</span><span class="fsep">от</span><span class="fval">${formatMoney(f.gross)}</span><span class="fsep">=</span><span class="fresult fresult-mute">-${formatMoney(f.taxAmt)}</span></div>
        </div>
        <div class="formula-section formula-total">
          <div class="formula-line"><span class="ftotal-label">К выплате</span><span class="fsep">=</span><span class="ftotal-value">${formatMoney(f.net)}</span></div>
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
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Ошибка ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const m = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = m ? m[1] : `Raschet_ZP_${recordId}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert(e.message); }
  }

  function gradeServiceFactor() { const g = gradesCache[0]; return g ? g.service_factor.toFixed(2) : "0.50"; }
  function gradePercent() { const g = gradesCache[0]; return g ? (g.bonus_percent + "%") : "4%"; }
  function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
  }

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("bitserves_theme", next);
  }

  function initTheme() { const saved = localStorage.getItem("bitserves_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); }

  async function init() {
    initTheme();
    if (getToken() && getUser()) { await enterApp(); }
    else { showLogin(); }
  }

  return {
    init, switchAuthTab, submitAuth, logout, navigate,
    loadEmployees, loadHistory, loadProfile,
    showEmployeeForm, editEmployee, deleteEmployee, calculate,
    toggleTheme, showFormula, onGradeChange, exportRecord,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);