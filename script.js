const state = { all: [], filtered: [] };

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn");
const money = (n) => `${nf.format(Math.round(n || 0))} ر.س`;
const pct = (n) => `${(n || 0).toFixed(1)}%`;

function excelDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400 * 1000));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed;
}

function formatDate(value) {
  const date = excelDate(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function showNotice(message, mode = "warn") {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice show ${mode}`;
}

function hideNotice() {
  $("notice").className = "notice";
  $("notice").textContent = "";
}

function normalizeStaticRow(row) {
  return {
    property: String(row.property || "").trim(),
    district: String(row.district || "غير محدد").trim(),
    type: String(row.type || "غير محدد").trim(),
    tenant: String(row.tenant || "").trim(),
    rent: Number(row.rent) || 0,
    start: row.start || "",
    paid: row.paid || "",
    payment: String(row.payment || "غير محدد").trim(),
    occupancy: String(row.occupancy || "غير محدد").trim()
  };
}

function loadStaticData() {
  state.all = (window.RENTALS_DATA || []).map(normalizeStaticRow).filter((row) => row.property || row.district || row.rent);
  if (!state.all.length) {
    showNotice("لم يتم العثور على بيانات العرض. تأكد من رفع rentals-data.js بجانب index.html.");
    return;
  }
  hideNotice();
  populateFilters();
  applyFilters();
  $("dataMeta").textContent = `تعرض الصفحة ${nf.format(state.all.length)} سجل من بيانات ثابتة جاهزة للمشاركة`;
  $("sideMeta").textContent = `${nf.format(state.all.length)} سجل ثابت`;
}

function uniqueValues(key) {
  return [...new Set(state.all.map((row) => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

function fillSelect(id, values, firstLabel) {
  const select = $(id);
  const current = select.value;
  select.innerHTML = `<option value="">${firstLabel}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function populateFilters() {
  fillSelect("districtFilter", uniqueValues("district"), "كل الأحياء");
  fillSelect("typeFilter", uniqueValues("type"), "كل الأنواع");
  fillSelect("paymentFilter", uniqueValues("payment"), "كل الحالات");
  fillSelect("occupancyFilter", uniqueValues("occupancy"), "الكل");
}

function applyFilters() {
  const query = $("searchInput").value.trim().toLowerCase();
  const district = $("districtFilter").value;
  const type = $("typeFilter").value;
  const payment = $("paymentFilter").value;
  const occupancy = $("occupancyFilter").value;
  const minRent = Number($("rentFilter").value) || 0;

  state.filtered = state.all.filter((row) => {
    const haystack = `${row.property} ${row.tenant} ${row.district} ${row.type}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!district || row.district === district)
      && (!type || row.type === type)
      && (!payment || row.payment === payment)
      && (!occupancy || row.occupancy === occupancy)
      && row.rent >= minRent;
  });

  renderDashboard();
}

function renderDashboard() {
  const rows = state.filtered;
  const allRevenue = sum(state.all.filter((row) => isOccupied(row)), "rent");
  const revenue = sum(rows.filter((row) => isOccupied(row)), "rent");
  const occupied = rows.filter((row) => isOccupied(row)).length;
  const risk = rows.filter((row) => row.payment === "متأخر" || row.payment === "متعثر").length;
  const avgRent = occupied ? revenue / occupied : 0;

  $("revenueMetric").textContent = money(revenue);
  $("unitsMetric").textContent = nf.format(rows.length);
  $("occupancyMetric").textContent = rows.length ? pct((occupied / rows.length) * 100) : "0.0%";
  $("riskMetric").textContent = nf.format(risk);
  $("revenueShare").textContent = allRevenue ? pct((revenue / allRevenue) * 100) : "0.0%";
  $("filteredShare").textContent = state.all.length ? pct((rows.length / state.all.length) * 100) : "0.0%";
  $("occupiedCount").textContent = nf.format(occupied);
  $("riskShare").textContent = rows.length ? pct((risk / rows.length) * 100) : "0.0%";
  $("avgRentMetric").textContent = `متوسط ${money(avgRent)}`;

  renderDistrictChart(rows);
  renderTypeChart(rows);
  renderPaymentDonut(rows);
  renderTable(rows);
}

function isOccupied(row) {
  return row.occupancy === "مؤجّرة" || row.occupancy === "مؤجرة";
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function groupBy(rows, key, valueFn = () => 1) {
  const map = new Map();
  rows.forEach((row) => {
    const name = row[key] || "غير محدد";
    map.set(name, (map.get(name) || 0) + valueFn(row));
  });
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function renderDistrictChart(rows) {
  const data = groupBy(rows.filter((row) => isOccupied(row)), "district", (row) => row.rent).slice(0, 5);
  const max = Math.max(...data.map((item) => item.value), 1);
  const colors = ["teal", "blue", "brand", "deep", "soft"];
  $("districtChart").innerHTML = data.length ? data.map((item, index) => {
    const totalHeight = Math.max(18, Math.round((item.value / max) * 150));
    const parts = [0.30, 0.24, 0.22, 0.16, 0.08].map((ratio) => Math.max(7, Math.round(totalHeight * ratio)));
    return `<div class="stack-col" title="${escapeHtml(item.name)}: ${money(item.value)}">
      <div class="stack-amount">${money(item.value)}</div>
      <div class="stack">${parts.map((height, i) => `<span class="seg ${colors[i]}" style="height:${height}px"></span>`).join("")}</div>
      <div class="stack-label">${escapeHtml(item.name)}</div>
    </div>`;
  }).join("") : emptyState("لا توجد إيرادات ضمن الفلتر الحالي");
}

function renderTypeChart(rows) {
  const data = groupBy(rows, "type").slice(0, 6);
  const max = Math.max(...data.map((item) => item.value), 1);
  $("topType").textContent = data[0] ? data[0].name : "--";
  $("typeChart").innerHTML = data.length ? data.map((item, index) => {
    const height = Math.max(20, Math.round((item.value / max) * 175));
    return `<div class="bar-item" title="${escapeHtml(item.name)}: ${nf.format(item.value)}">
      <div class="bar ${index === 0 ? "hot" : ""}" style="--h:${height}px"></div>
      <div class="bar-label">${escapeHtml(item.name)}</div>
    </div>`;
  }).join("") : emptyState("لا توجد وحدات ضمن الفلتر الحالي");
}

function renderPaymentDonut(rows) {
  const order = [
    ["منتظم", "var(--brand)"],
    ["متأخر", "var(--amber)"],
    ["متعثر", "var(--rose)"],
    ["غير مؤجّرة", "#dfe5ef"]
  ];
  const counts = new Map(order.map(([name]) => [name, 0]));
  rows.forEach((row) => counts.set(row.payment, (counts.get(row.payment) || 0) + 1));
  const total = Math.max(rows.length, 1);
  const p1 = ((counts.get("منتظم") || 0) / total) * 100;
  const p2 = p1 + ((counts.get("متأخر") || 0) / total) * 100;
  const p3 = p2 + ((counts.get("متعثر") || 0) / total) * 100;
  $("paymentDonut").style.cssText = `--a:${p1}%; --b:${p2}%; --c:${p3}%`;
  $("paymentLegend").innerHTML = order.map(([name, color]) => {
    const value = counts.get(name) || 0;
    return `<div class="legend-row">
      <span class="legend-name"><span class="swatch" style="background:${color}"></span>${name}</span>
      <strong>${nf.format(value)}</strong>
    </div>`;
  }).join("");
}

function renderTable(rows) {
  const visible = rows.slice(0, 100);
  $("tableCaption").textContent = `${nf.format(rows.length)} نتيجة مطابقة للفلاتر`;
  $("rowLimit").textContent = rows.length > 100 ? "أول 100 سجل" : "كل النتائج";
  $("rentalsTable").innerHTML = visible.length ? visible.map((row) => {
    const statusClass = row.payment === "منتظم" ? "good" : row.payment === "متأخر" ? "late" : row.payment === "متعثر" ? "bad" : "empty";
    const tenant = row.tenant || "بدون مستأجر";
    const rentRate = Math.min(100, Math.max(4, (row.rent / 27000) * 100));
    return `<tr>
      <td>${escapeHtml(row.property)}</td>
      <td>${escapeHtml(row.district)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td>${escapeHtml(tenant)}</td>
      <td class="num"><span class="rate-track"><span style="--w:${rentRate}%"></span></span>${money(row.rent)}</td>
      <td>${formatDate(row.paid)}</td>
      <td><span class="status ${statusClass}">${escapeHtml(row.payment)}</span></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7">لا توجد نتائج مطابقة للفلاتر الحالية.</td></tr>`;
}

function emptyState(message) {
  return `<div style="grid-column:1/-1;color:var(--muted);align-self:center;justify-self:center;padding:34px">${message}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function exportCsv() {
  const rows = state.filtered;
  const header = ["رقم العقار", "الحي", "نوع الوحدة", "اسم المستأجر", "الإيجار الشهري", "تاريخ آخر دفعة", "حالة السداد", "حالة الإشغال"];
  const lines = [header, ...rows.map((row) => [row.property, row.district, row.type, row.tenant, row.rent, formatDate(row.paid), row.payment, row.occupancy])]
    .map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","));
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rentals-filtered.csv";
  link.click();
  URL.revokeObjectURL(url);
}

["searchInput", "districtFilter", "typeFilter", "paymentFilter", "occupancyFilter", "rentFilter"].forEach((id) => {
  $(id).addEventListener(id === "searchInput" ? "input" : "change", applyFilters);
});
$("applyBtn").addEventListener("click", applyFilters);
$("resetBtn").addEventListener("click", () => {
  ["searchInput", "districtFilter", "typeFilter", "paymentFilter", "occupancyFilter", "rentFilter"].forEach((id) => { $(id).value = ""; });
  applyFilters();
});
$("exportBtn").addEventListener("click", exportCsv);

loadStaticData();
