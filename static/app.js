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
          <thead><tr><th>#</th><th>Период</th><th>Сотрудник</th><th>Грейд</th><th>Дни</th><th>Маржа усл./товар</th><th>Оклад</th><th>Премия</th><th>Gross</th><th>НДФЛ</th><th>К выплате</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const emp = employeesCache.find(e => e.id === r.employee_id);
            return `<tr>
              <td class="tnum">${i + 1}</td>
              <td>${escapeHtml(r.period)}</td>
              <td>${emp ? escapeHtml(emp.full_name) : ("ID " + r.employee_id)}</td>
              <td class="text-muted">${escapeHtml(emp ? (emp.grade_name || emp.grade) : r.grade)}</td>
              <td class="tnum">${r.worked_days}/${r.working_days}</td>
              <td class="tnum">${formatMoney(r.service_margin)} / ${formatMoney(r.goods_margin)}</td>
              <td class="tnum">${formatMoney(r.accrued_base)}</td>
              <td class="tnum">${formatMoney(r.bonus_total)}</td>
              <td class="tnum">${formatMoney(r.gross_pay)}</td>
              <td class="tnum">-${formatMoney(r.tax_amount)}</td>
              <td class="tnum" style="color:var(--color-success)">${formatMoney(r.net_pay)}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function showMarginHelp() {
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Справка: какие столбцы отчёта суммировать</div>
        <div class="help-block">
          <div class="help-label">Маржа с услуг</div>
          <div class="help-hint">Суммируются столбцы отчёта:</div>
          <div class="help-list">
            <span class="help-tag">Услуги</span>
            <span class="help-tag">ЦТО</span>
            <span class="help-tag">Регулярное сопровождение — ИТС</span>
            <span class="help-tag">Консалтинг</span>
            <span class="help-tag">Доставка</span>
          </div>
        </div>
        <div class="help-block">
          <div class="help-label">Маржа с товара</div>
          <div class="help-hint">Суммируются столбцы отчёта:</div>
          <div class="help-list">
            <span class="help-tag">Торговое оборудование</span>
            <span class="help-tag">1С</span>
            <span class="help-tag">Промышленное оборудование</span>
          </div>
        </div>
        <div class="help-formula">
          <div><b>Премия за услуги</b> = Маржа услуг × ${escapeHtml(gradeServiceFactor())} × ${escapeHtml(gradePercent())}</div>
          <div><b>Премия за товар</b> = Маржа товара × ${escapeHtml(gradePercent())}</div>
        </div>
        <div class="modal-actions">
          <button class="btn-accent" onclick="this.closest('.modal-bg').remove()">Понятно</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function gradeServiceFactor() { const g = gradesCache[0]; return g ? g.service_factor.toFixed(2) : "0.50"; }
  function gradePercent() { const g = gradesCache[0]; return g ? (g.bonus_percent + "%") : "4%"; }

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
    toggleTheme, showMarginHelp, onGradeChange,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);