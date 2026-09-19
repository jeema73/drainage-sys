(() => {
  "use strict";

  console.log("✅ print-page.js 로드됨");

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";

  let zoneList = [];
  let recordList = [];
  let displayZones = [];
  let standards = [];
  let supplySettings = [];

  async function getFs() {
    if (!fsMod) {
      fsMod = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    }
    return fsMod;
  }

  async function ensureDb() {
    if (db) return db;
    if (typeof window.initFirebaseIfNeeded === "function") {
      db = await window.initFirebaseIfNeeded();
    }
    if (!db) {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js");
      const { getFirestore } = await getFs();
      const firebaseConfig = {
        apiKey: "AIzaSyCfcMVOOn3l1XbUnp6yezqHPdHjAysA79k",
        authDomain: "smartfarm-drainage-system.firebaseapp.com",
        projectId: "smartfarm-drainage-system",
        storageBucket: "smartfarm-drainage-system.firebasestorage.app",
        messagingSenderId: "699907108321",
        appId: "1:699907108321:web:b71e0ed0d3df141c7836a0",
        measurementId: "G-W7L21Y8JZN"
      };
      db = getFirestore(initializeApp(firebaseConfig));
    }
    return db;
  }

  function getRoleName(role) {
    const map = { admin: "최고관리자", manager: "매니저", worker: "공공근로자", guest: "게스트" };
    return map[role] || role;
  }

  function applyMenuPermissions(role) {
    document.querySelectorAll(".sidebar-menu a").forEach(link => {
      const allowedRoles = (link.dataset.role || "all").split(",");
      if (allowedRoles.includes("all") || allowedRoles.includes(role)) {
        link.classList.add("visible");
      } else {
        link.classList.remove("visible");
      }
    });
  }

  function formatDateYmd(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function loadFarmInfo() {
    const database = await ensureDb();
    if (!database) return;
    const { doc, getDoc } = await getFs();
    try {
      const snap = await getDoc(doc(database, "settings", FARM_SETTINGS_ID));
      const topFarmNameEl = document.getElementById("topFarmName");
      const topMetaEl = document.getElementById("topFarmMeta");
      if (snap.exists()) {
        const farm = snap.data();
        if (topFarmNameEl) topFarmNameEl.textContent = farm.farmName || "강북구 스마트팜 재배단지";
        if (topMetaEl) {
          topMetaEl.innerHTML = `
            <span>🌿 재배작물: ${farm.cropType || "딸기"}</span>
            <span>🍓 품종: ${farm.variety || "금실"}</span>
            <span>🌱 정식일: ${formatDateYmd(farm.plantingDate) || "-"}</span>
          `;
        }
      } else {
        if (topFarmNameEl) topFarmNameEl.textContent = "강북구 스마트팜 재배단지";
        if (topMetaEl) topMetaEl.innerHTML = `<span style="color:#ffd700;">⚠️ 농장설정 미등록</span>`;
      }
    } catch (e) {
      console.error("농장설정 오류:", e);
    }
  }

  function checkAuth() {
    const userStr = localStorage.getItem("user") || localStorage.getItem("user ");
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = (localStorage.getItem("userRole") || localStorage.getItem("userRole ") || "").trim();
    const allowRoles = ["admin", "manager", "worker", "guest"];

    if (!user || !user.userId || !userRole) {
      location.href = "index.html";
      return null;
    }

    if (!allowRoles.includes(userRole)) {
      alert("접근 권한이 없습니다.");
      location.href = "dashboard.html";
      return null;
    }

    const userName = user.userName || user.userId || "사용자";
    const userNameEl = document.getElementById("sidebarUserName");
    if (userNameEl) userNameEl.textContent = `${userName} ${getRoleName(userRole)}`;
    
    applyMenuPermissions(userRole);
    
    const adminArea = document.getElementById("adminArea");
    if (adminArea) adminArea.style.display = "block";
    
    return { user, userRole };
  }

  async function loadWeather() {
    try {
      const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.63&longitude=127.03&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=1");
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m * 10) / 10;
      const minTemp = Math.round(data.daily.temperature_2m_min[0]);
      const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
      const code = data.current.weather_code;
      let icon = "☀️", desc = "맑음";
      if (code === 1 || code === 2) { icon = "🌤️"; desc = "구름조금"; }
      else if (code === 3) { icon = "☁️"; desc = "흐림"; }
      else if (code >= 45 && code <= 48) { icon = "🌫️"; desc = "안개"; }
      else if (code >= 51 && code <= 67) { icon = "🌧️"; desc = "비"; }
      else if (code >= 71 && code <= 77) { icon = "❄️"; desc = "눈"; }
      else if (code >= 80 && code <= 82) { icon = "🌧️"; desc = "소나기"; }

      const elIcon = document.getElementById("weatherIcon");
      const elTemp = document.getElementById("weatherTemp");
      const elDesc = document.getElementById("weatherDesc");
      const elRange = document.getElementById("weatherRange");
      if (elIcon) elIcon.textContent = icon;
      if (elTemp) elTemp.textContent = `${temp}°`;
      if (elDesc) elDesc.textContent = desc;
      if (elRange) elRange.textContent = `최저 ${minTemp}° / 최고 ${maxTemp}°`;
    } catch (e) {
      const elDesc = document.getElementById("weatherDesc");
      if (elDesc) elDesc.textContent = "날씨 불러오기 실패";
    }
  }

  async function loadStandards() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const [stdSnap, ssSnap] = await Promise.all([
        getDocs(collection(database, "supply_standards")),
        getDocs(collection(database, "supply_settings")).catch(() => null)
      ]);
      standards = stdSnap.docs.map(d => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.log("기준/급액셋팅 불러오기 오류:", e);
    }
  }

  // ✅ 배액율 계산 (최신 급액셋팅 매칭)
  function getRatio(r) {
    if (!r) return null;
    const recLine = r.line || r.lineNo || "V01";
    const drainMl = parseFloat(r.drainAmount);
    if (isNaN(drainMl) || drainMl <= 0) return null;
    const ss = supplySettings.filter(s => (s.lineNo || s.line || "V01") === recLine && s.settingDate <= r.measureDate)
      .sort((a, b) => b.settingDate.localeCompare(a.settingDate))[0];
    if (!ss || !(parseFloat(ss.dailySupplyL) > 0)) return null;
    return Math.round((drainMl / 1000) / parseFloat(ss.dailySupplyL) * 1000) / 10;
  }

  async function loadZones() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const zSnap = await getDocs(collection(database, "zones"));
    zoneList = zSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const zoneMap = new Map();
    zoneList.forEach(data => {
      const zoneName = String(data.zoneName || data.name || "");
      if (!zoneName) return;
      const isSample = Boolean(data.hasSampleData === true || data.isSampleZone === true);
      const isSeedling = zoneName.includes("육묘") ? 1 : 0;
      const numMatch = zoneName.match(/(\d+)/);
      const sortNum = numMatch ? parseInt(numMatch[1], 10) : 999;
      const zoneInfo = {
        zoneName: zoneName,
        zoneNo: sortNum,
        isSeedling: isSeedling,
        sortNum: sortNum,
        lineNo: String(data.line || data.supplyLine || "V01"),
        useSample: isSample
      };
      if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, zoneInfo);
    });

    displayZones = Array.from(zoneMap.values()).filter(Boolean).sort((a, b) => {
      if (!a || !b) return 0;
      if (a.isSeedling !== b.isSeedling) return a.isSeedling - b.isSeedling;
      return a.sortNum - b.sortNum;
    });
    zoneList = [...displayZones];
  }

  function getVal(r, field) {
    if (!r) return "-";
    const v = r[field];
    if (v === undefined || v === null || v === "") return "-";
    return String(v);
  }

  async function loadData() {
    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    if (!sDate || !eDate) return alert("시작일과 종료일을 지정하세요!");

    const periodInfo = document.getElementById("periodInfo");
    if (periodInfo) periodInfo.textContent = `${sDate} ~ ${eDate} · 등록 구역 ${displayZones.length}개`;

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const snap = await getDocs(collection(database, "drain_records"));
    const allRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    recordList = allRecords.filter(r => {
      if (!r || !r.measureDate) return false;
      return r.measureDate >= sDate && r.measureDate <= eDate;
    });
    renderTable();

    const printArea = document.getElementById("printArea");
    if (printArea) printArea.style.display = "block";
  }

  function renderTable() {
    const table = document.getElementById("printTable");
    if (!table) return;

    const dateGroups = {};
    recordList.forEach(r => {
      if (!r || !r.measureDate) return;
      const dt = r.measureDate;
      if (!dateGroups[dt]) dateGroups[dt] = [];
      dateGroups[dt].push(r);
    });

    let html = `<thead><tr>
      <th rowspan="2" style="min-width:70px;">측정일자</th>
      <th rowspan="2" style="min-width:50px;">측정시간</th>
      <th rowspan="2" style="min-width:40px;">항목</th>`;
    displayZones.forEach(z => {
      if (!z) return;
      const colSpan = z.useSample ? 2 : 1;
      html += `<th colspan="${colSpan}" class="zone-name">${z.zoneName}<br>(${z.lineNo})</th>`;
    });
    html += `</tr><tr>`;
    displayZones.forEach(z => {
      if (!z) return;
      if (z.useSample) {
        html += `<th class="sub-col">기본</th><th class="sub-col sample-col">샘플</th>`;
      } else {
        html += `<th class="sub-col">값</th>`;
      }
    });
    html += `</tr></thead><tbody>`;

    const sortedDates = Object.keys(dateGroups).sort();
    if (sortedDates.length === 0) {
      const totalCols = 3 + displayZones.filter(Boolean).reduce((s, z) => s + (z.useSample ? 2 : 1), 0);
      html += `<tr><td colspan="${totalCols}" class="empty-box">📭 해당 기간에 측정기록이 없습니다.</td></tr>`;
    }

    for (const dt of sortedDates) {
      const recs = dateGroups[dt] || [];
      const times = recs.map(r => r.measureTime || "09:00").filter(Boolean).sort();
      const firstTime = times[0] || "09:00";
      const zoneData = {};
      recs.forEach(r => {
        if (!r) return;
        const zName = String(r.zoneName || "");
        if (!zName) return;
        const matchedZone = zoneList.find(z => z && String(z.zoneName) === zName);
        if (matchedZone) zoneData[matchedZone.zoneName] = r;
      });

      // ✅ 날짜/시간 셀은 4행(EC/pH/온도배액량/배액율)을 묶음
      html += `<tr>`;
      html += `<td rowspan="4">${dt.replace(/-/g, ".")}</td>`;
      html += `<td rowspan="4">${firstTime}</td>`;
      html += `<td>EC</td>`;
      displayZones.forEach(z => {
        if (!z) return;
        const r = zoneData[z.zoneName];
        if (z.useSample) {
          html += `<td>${getVal(r, "drainEc")}</td><td class="sample-col">${getVal(r, "sampleEc")}</td>`;
        } else {
          html += `<td>${getVal(r, "drainEc")}</td>`;
        }
      });
      html += `</tr>`;

      html += `<tr><td>pH</td>`;
      displayZones.forEach(z => {
        if (!z) return;
        const r = zoneData[z.zoneName];
        if (z.useSample) {
          html += `<td>${getVal(r, "drainPh")}</td><td class="sample-col">${getVal(r, "samplePh")}</td>`;
        } else {
          html += `<td>${getVal(r, "drainPh")}</td>`;
        }
      });
      html += `</tr>`;

      html += `<tr><td>온도/배액량</td>`;
      displayZones.forEach(z => {
        if (!z) return;
        const r = zoneData[z.zoneName];
        const temp = getVal(r, "bedTemp");
        const tempStr = temp === "-" ? "-" : temp + "°C";
        if (z.useSample) {
          html += `<td>${tempStr}</td><td class="sample-col">${getVal(r, "drainAmount")}</td>`;
        } else {
          html += `<td>${tempStr}</td>`;
        }
      });
      html += `</tr>`;

      // ✅ 배액율 행 — 항목칸 + 구역칸 (샘플 구역은 2칸 병합)
      html += `<tr><td>배액율</td>`;
      displayZones.forEach(z => {
        if (!z) return;
        const r = zoneData[z.zoneName];
        const ratio = getRatio(r);
        const cell = ratio == null ? `<span style="color:#999;">-</span>` : `<strong>${ratio}%</strong>`;
        if (z.useSample) html += `<td colspan="2">${cell}</td>`;
        else html += `<td>${cell}</td>`;
      });
      html += `</tr>`;
    }
    html += `</tbody>`;
    table.innerHTML = html;
  }

  function exportCSV() {
    if (!recordList.length) return alert("먼저 조회를 해주세요!");

    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;

    let csv = "\uFEFF";
    csv += `"딸기 배액 측정기록표","${sDate} ~ ${eDate}"\n`;
    csv += `"측정일자","측정시간","항목"`;
    displayZones.filter(Boolean).forEach(z => {
      if (z.useSample) csv += `,"${z.zoneName} 기본","${z.zoneName} 샘플"`;
      else csv += `,"${z.zoneName}"`;
    });
    csv += "\n";

    const dateGroups = {};
    recordList.forEach(r => {
      if (!r || !r.measureDate) return;
      const dt = r.measureDate;
      if (!dateGroups[dt]) dateGroups[dt] = [];
      dateGroups[dt].push(r);
    });

    const sortedDates = Object.keys(dateGroups).sort();
    for (const dt of sortedDates) {
      const recs = dateGroups[dt] || [];
      const times = recs.map(r => r.measureTime || "09:00").filter(Boolean).sort();
      const firstTime = times[0] || "09:00";
      const zoneData = {};
      recs.forEach(r => {
        if (!r) return;
        const zName = String(r.zoneName || "");
        const matchedZone = zoneList.find(z => z && String(z.zoneName) === zName);
        if (matchedZone) zoneData[matchedZone.zoneName] = r;
      });

      // 1️⃣ EC 행
      csv += `"${dt}","${firstTime}","EC"`;
      displayZones.filter(Boolean).forEach(z => {
        const r = zoneData[z.zoneName];
        if (z.useSample) csv += `,"${getVal(r, "drainEc")}","${getVal(r, "sampleEc")}"`;
        else csv += `,"${getVal(r, "drainEc")}"`;
      });
      csv += "\n";

      // 2️⃣ pH 행
      csv += `"${dt}","${firstTime}","pH"`;
      displayZones.filter(Boolean).forEach(z => {
        const r = zoneData[z.zoneName];
        if (z.useSample) csv += `,"${getVal(r, "drainPh")}","${getVal(r, "samplePh")}"`;
        else csv += `,"${getVal(r, "drainPh")}"`;
      });
      csv += "\n";

      // 3️⃣ 온도/배액량 행 (온도 + 배액량)
      csv += `"${dt}","${firstTime}","온도/배액량"`;
      displayZones.filter(Boolean).forEach(z => {
        const r = zoneData[z.zoneName];
        const temp = getVal(r, "bedTemp");
        const tempStr = temp === "-" ? "-" : temp + "°C";
        if (z.useSample) csv += `,"${tempStr}","${getVal(r, "drainAmount")}"`;
        else csv += `,"${tempStr}"`;
      });
      csv += "\n";

      // 4️⃣ 배액율 행 (샘플 구역은 칸 맞추기 위해 2칸 사용)
      csv += `"${dt}","${firstTime}","배액율"`;
      displayZones.filter(Boolean).forEach(z => {
        const r = zoneData[z.zoneName];
        const ratio = getRatio(r);
        const cell = ratio == null ? "-" : `${ratio}%`;
        if (z.useSample) csv += `,"${cell}",""`;
        else csv += `,"${cell}"`;
      });
      csv += "\n";
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `배액기록_${sDate}_${eDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.addEventListener("click", e => {
      if (e.target.id === "hamBtn" || e.target.closest("#hamBtn")) {
        document.getElementById("sidebar").classList.toggle("open");
        document.getElementById("overlay").classList.toggle("show");
      }
      if (e.target.id === "sidebarLogoutBtn" || e.target.closest("#sidebarLogoutBtn")) {
        e.preventDefault();
        if (confirm("로그아웃 하시겠습니까?")) {
          localStorage.removeItem("user");
          localStorage.removeItem("userRole");
          location.href = "index.html";
        }
      }
    });

    // HTML의 onclick과 중복 방지를 위해, 해당 버튼에 onclick이 없을 때만 리스너 추가
    const loadBtn = document.querySelector("button.btn-primary");
    if (loadBtn && !loadBtn.hasAttribute("onclick")) {
      loadBtn.addEventListener("click", loadData);
    }
    const csvBtn = document.querySelector("button.btn-csv");
    if (csvBtn && !csvBtn.hasAttribute("onclick")) {
      csvBtn.addEventListener("click", exportCSV);
    }
    const printBtn = document.querySelector("button.btn-print");
    if (printBtn && !printBtn.hasAttribute("onclick")) {
      printBtn.addEventListener("click", () => window.print());
    }
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();
    loadWeather();

    // 기본 기간: 이번주 월~금
    const today = new Date();
    const day = today.getDay() || 7;
    const mon = new Date(today);
    mon.setDate(today.getDate() - day + 1);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    const sDateEl = document.getElementById("sDate");
    const eDateEl = document.getElementById("eDate");
    if (sDateEl) sDateEl.valueAsDate = mon;
    if (eDateEl) eDateEl.valueAsDate = fri;

    await loadZones();
    await loadStandards();
    await loadData();
  }

  // HTML onclick에서 호출 가능하도록 전역 노출
  window.loadData = loadData;
  window.exportCSV = exportCSV;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();