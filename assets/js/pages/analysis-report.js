(() => {
  "use strict";

  let db = null;
  let fs = null;
  let zoneList = [];
  let standards = [];
  let supplySettings = []; // ✅ 배액율 계산용
  let allRecords = [];
  let currentFilter = "all";
  let deviationChart = null;
  let warningChart = null;

  async function getFs() {
    if (!fs) {
      fs = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    }
    return fs;
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
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
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
      const snap = await getDoc(doc(database, "settings", "current"));
      const topFarmNameEl = document.getElementById("topFarmName");
      const topMetaEl = document.getElementById("topFarmMeta");
      if (snap.exists()) {
        const farm = snap.data();
        if (topFarmNameEl) topFarmNameEl.textContent = farm.farmName || "강북구 스마트팜 재배단지";
        if (topMetaEl) {
          topMetaEl.innerHTML = `
            <span>🌿 재배작물: ${farm.cropType || "딸기"}</span>
            <span>🍓 품종: ${farm.variety || "금실"}</span>
            <span>🌱 정식일: ${formatDateYmd(farm.plantingDate)}</span>
          `;
        }
      } else {
        if (topFarmNameEl) topFarmNameEl.textContent = "강북구 스마트팜 재배단지";
        if (topMetaEl) topMetaEl.innerHTML = `<span style="color:#ffd700;">⚠️ 농장설정 미등록</span>`;
      }
    } catch (e) {
      console.error("농장정보 오류:", e);
    }
  }

  // ✅ 상태 판정 (EC/pH + 배액율)
  function checkStatus(r) {
    const recLine = r.line || r.lineNo || "V01";

    const std = standards.filter(s => {
      const stdLine = s.lineNo || s.line || "V01";
      return s.standardDate <= r.measureDate && stdLine === recLine;
    }).sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0];

    if (!std) {
      return { level: "none", ecDev: "-", phDev: "-", supEc: "-", supPh: "-", statusText: "기준없음", statusColor: "#888", ratio: null, ratioColor: "#999", targetRate: null };
    }

    const rawEc = (std.targetEc !== undefined && std.targetEc !== null && std.targetEc !== "") ? std.targetEc : std.supplyEc;
    const rawPh = (std.targetPh !== undefined && std.targetPh !== null && std.targetPh !== "") ? std.targetPh : std.supplyPh;
    const supEc = parseFloat(rawEc) || 0;
    const supPh = parseFloat(rawPh) || 0;

    const drainEc = parseFloat(r.drainEc);
    const drainPh = parseFloat(r.drainPh);
    const compEc = supEc + 0.2;
    const ecDev = (drainEc - compEc).toFixed(2);
    const phDev = (drainPh - supPh).toFixed(2);
    const eD = parseFloat(ecDev);
    const pD = parseFloat(phDev);

    let ecLevel = "ok";
    if (eD >= 0.7 || eD <= -0.5) ecLevel = "danger";
    else if ((eD >= 0.4 && eD <= 0.6) || (eD <= -0.31 && eD >= -0.4)) ecLevel = "warn";

    let phLevel = "ok";
    if (pD >= 0.9 || pD <= -0.7 || drainPh >= 6.8 || drainPh <= 5.2) phLevel = "danger";
    else if ((pD >= 0.5 && pD <= 0.8) || (pD <= -0.41 && pD >= -0.6)) phLevel = "warn";

    let level = "ok";
    if (ecLevel === "danger" || phLevel === "danger") level = "danger";
    else if (ecLevel === "warn" || phLevel === "warn") level = "warn";

    // ✅ 배액율 = 배액량(mL→L) ÷ 24h 급액량(L·포대당) × 100
    let ratio = null, ratioLevel = "none";
    const targetRate = parseFloat(std.drainRate) || null;
    const drainMl = parseFloat(r.drainAmount);
    const ss = supplySettings.filter(s => {
      const ssLine = s.lineNo || s.line || "V01";
      return ssLine === recLine && s.settingDate <= r.measureDate;
    }).sort((a, b) => b.settingDate.localeCompare(a.settingDate))[0];

    if (ss && parseFloat(ss.dailySupplyL) > 0 && !isNaN(drainMl) && drainMl > 0) {
      ratio = (drainMl / 1000) / parseFloat(ss.dailySupplyL) * 100;
      if (targetRate) {
        const ad = Math.abs(ratio - targetRate);
        ratioLevel = ad <= 10 ? "ok" : ad <= 20 ? "warn" : "danger";
      }
    }
    const ratioColor = ratioLevel === "ok" ? "#2e7d32" : ratioLevel === "warn" ? "#ef6c00" : ratioLevel === "danger" ? "#c62828" : "#999";

    return {
      level, ecDev, phDev,
      supEc: rawEc !== undefined && rawEc !== null && rawEc !== "" ? rawEc : "-",
      supPh: rawPh !== undefined && rawPh !== null && rawPh !== "" ? rawPh : "-",
      statusText: level === "danger" ? "🚨 경고" : level === "warn" ? "⚠️ 주의" : "✅ 정상",
      statusColor: level === "danger" ? "#c62828" : level === "warn" ? "#ef6c00" : "#2e7d32",
      ratio: ratio === null ? null : Math.round(ratio * 10) / 10,
      ratioColor, targetRate
    };
  }

  function zoneCompare(a, b) {
    const ax = String(a.zoneName || "");
    const bx = String(b.zoneName || "");
    const aIsNum = /^[0-9]/.test(ax);
    const bIsNum = /^[0-9]/.test(bx);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (aIsNum && bIsNum) {
      const aNumMatch = ax.match(/(\d+)/);
      const bNumMatch = bx.match(/(\d+)/);
      if (aNumMatch && bNumMatch) {
        const aNum = parseInt(aNumMatch[1], 10);
        const bNum = parseInt(bNumMatch[1], 10);
        if (aNum !== bNum) return aNum - bNum;
      }
    }
    return ax.localeCompare(bx, "ko");
  }

  function localCheckAuth() {
    const userStr = localStorage.getItem("user") || localStorage.getItem("user ");
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = (localStorage.getItem("userRole") || localStorage.getItem("userRole ") || "").trim();

    if (!user || !user.userId || !userRole) {
      location.href = "index.html";
      return null;
    }

    const userNameEl = document.getElementById("sidebarUserName");
    if (userNameEl) userNameEl.textContent = `${user.userName || user.userId || "사용자"} ${getRoleName(userRole)}`;

    applyMenuPermissions(userRole);

    const adminArea = document.getElementById("adminArea");
    if (adminArea) adminArea.style.display = "block";

    return { user, userRole };
  }

  function renderDeviationChart() {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js가 로드되지 않았습니다.");
      return;
    }

    let filtered = allRecords;
    if (currentFilter === "ok") filtered = allRecords.filter(r => checkStatus(r).level === "ok");
    else if (currentFilter === "warn") filtered = allRecords.filter(r => checkStatus(r).level === "warn");
    else if (currentFilter === "danger") filtered = allRecords.filter(r => checkStatus(r).level === "danger");

    if (!filtered.length) {
      if (deviationChart) deviationChart.destroy();
      deviationChart = null;
      return;
    }

    const byDate = {};
    filtered.forEach(r => {
      const d = r.measureDate;
      if (!byDate[d]) byDate[d] = { ecSum: 0, phSum: 0, cnt: 0 };
      const st = checkStatus(r);
      if (st.ecDev !== "-") {
        byDate[d].ecSum += parseFloat(st.ecDev);
        byDate[d].phSum += parseFloat(st.phDev);
        byDate[d].cnt += 1;
      }
    });

    const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
    const ecAvgs = dates.map(d => (byDate[d].ecSum / byDate[d].cnt).toFixed(2));
    const phAvgs = dates.map(d => (byDate[d].phSum / byDate[d].cnt).toFixed(2));

    const canvas = document.getElementById("deviationChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (deviationChart) deviationChart.destroy();
    
    deviationChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates.map(d => d.slice(5)),
        datasets: [
          { label: "EC 편차", data: ecAvgs, borderColor: "#1976d2", backgroundColor: "rgba(25,118,210,0.08)", borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 4, pointBackgroundColor: "#1976d2" },
          { label: "pH 편차", data: phAvgs, borderColor: "#388e3c", backgroundColor: "rgba(56,142,60,0.08)", borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 4, pointBackgroundColor: "#388e3c" }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } }, tooltip: { backgroundColor: "#222", padding: 10, titleFont: { size: 12 }, bodyFont: { size: 12 } } },
        scales: {
          y: { title: { display: true, text: "평균 편차", font: { size: 11 } }, grid: { color: "#e8e8e8" }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        },
        interaction: { mode: "index", intersect: false }
      }
    });
  }

  function renderWarningChart() {
    if (typeof Chart === "undefined") return;

    const byDate = {};
    allRecords.forEach(r => {
      const d = r.measureDate;
      if (!byDate[d]) byDate[d] = { warn: 0, danger: 0 };
      const level = checkStatus(r).level;
      if (level === "warn") byDate[d].warn += 1;
      else if (level === "danger") byDate[d].danger += 1;
    });

    const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
    const warnData = dates.map(d => byDate[d].warn);
    const dangerData = dates.map(d => byDate[d].danger);

    const canvas = document.getElementById("warningChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (warningChart) warningChart.destroy();

    warningChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dates.map(d => d.slice(5)),
        datasets: [
          { label: "주의", data: warnData, backgroundColor: "#ffcc00", borderRadius: 3 },
          { label: "경고", data: dangerData, backgroundColor: "#e53935", borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } }, tooltip: { backgroundColor: "#222", padding: 10, titleFont: { size: 12 }, bodyFont: { size: 12 } } },
        scales: {
          y: { title: { display: true, text: "건수", font: { size: 11 } }, beginAtZero: true, ticks: { font: { size: 11 }, stepSize: 1 } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  function setFilter(level) {
    currentFilter = level;
    document.querySelectorAll(".status-filter-box button").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`button[data-filter="${level}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    
    renderList();
    renderDeviationChart();
    renderWarningChart();
  }

  async function applyFilter() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const s = document.getElementById("sDate").value;
    const e = document.getElementById("eDate").value;
    const z = document.getElementById("zoneSel").value;

    const snap = await getDocs(collection(database, "drain_records"));
    allRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (s) allRecords = allRecords.filter(r => r.measureDate >= s);
    if (e) allRecords = allRecords.filter(r => r.measureDate <= e);
    if (z) allRecords = allRecords.filter(r => r.zoneName === z);

    allRecords.sort((a, b) => {
      const dCmp = String(a.measureDate || "").localeCompare(String(b.measureDate || ""));
      if (dCmp !== 0) return dCmp;
      return zoneCompare(a, b);
    });

    const cntAll = allRecords.length;
    let cntOk = 0, cntWarn = 0, cntDanger = 0;
    
    allRecords.forEach(r => {
      const st = checkStatus(r);
      if (st.level === "danger") cntDanger++;
      else if (st.level === "warn") cntWarn++;
      else cntOk++;
    });

    const fAll = document.getElementById("fAll");
    const fOk = document.getElementById("fOk");
    const fWarn = document.getElementById("fWarn");
    const fDanger = document.getElementById("fDanger");

    if (fAll) fAll.textContent = cntAll;
    if (fOk) fOk.textContent = cntOk;
    if (fWarn) fWarn.textContent = cntWarn;
    if (fDanger) fDanger.textContent = cntDanger;

    let ecDevSum = 0, sEcDevSum = 0, ecDevCnt = 0, sEcDevCnt = 0;
    allRecords.forEach(r => {
      const st = checkStatus(r);
      if (st.ecDev !== "-") { ecDevSum += Math.abs(parseFloat(st.ecDev)); ecDevCnt++; }
      if (r.sampleEc && st.supEc !== "-") {
        sEcDevSum += Math.abs(parseFloat(r.sampleEc) - (parseFloat(st.supEc) + 0.2));
        sEcDevCnt++;
      }
    });

    const aCount = document.getElementById("aCount");
    const ecDev = document.getElementById("ecDev");
    const sEcDev = document.getElementById("sEcDev");
    const wCount = document.getElementById("wCount");

    if (aCount) aCount.textContent = cntAll + "건";
    if (ecDev) ecDev.textContent = ecDevCnt ? (ecDevSum / ecDevCnt).toFixed(2) : "-";
    if (sEcDev) sEcDev.textContent = sEcDevCnt ? (sEcDevSum / sEcDevCnt).toFixed(2) : "-";
    if (wCount) wCount.textContent = (cntWarn + cntDanger) + "건";

    renderList();
    renderDeviationChart();
    renderWarningChart();
  }

  function renderList() {
    let filtered = allRecords;
    if (currentFilter === "ok") filtered = allRecords.filter(r => checkStatus(r).level === "ok");
    else if (currentFilter === "warn") filtered = allRecords.filter(r => checkStatus(r).level === "warn");
    else if (currentFilter === "danger") filtered = allRecords.filter(r => checkStatus(r).level === "danger");

    const tb = document.getElementById("reportBody");
    if (!tb) return;

    if (!filtered.length) { 
      tb.innerHTML = `<tr><td colspan="14" class="empty-box">데이터가 없습니다.</td></tr>`; // ✅ 13 -> 14
      return; 
    }

    tb.innerHTML = filtered.map(r => {
      const st = checkStatus(r);
      let rowClass = "";
      if (st.level === "danger") rowClass = "class='danger-row'";
      else if (st.level === "warn") rowClass = "class='warn-row'";
      
      const zoneLine = `${r.zoneName || "-"} · ${r.line || "V01"}`;
      
      return `<tr ${rowClass}>
        <td>${r.measureDate || "-"}</td>
        <td>${r.measureTime || "-"}</td>
        <td>${zoneLine}</td>
        <td>${r.drainEc || "-"}</td>
        <td>${st.supEc}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.ecDev}</td>
        <td>${r.drainPh || "-"}</td>
        <td>${st.supPh}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.phDev}</td>
        <td>${r.sampleEc || "-"}</td>
        <td>${r.samplePh || "-"}</td>
        <td>${r.bedTemp || "-"}</td>
        <td>${st.ratio == null ? `<span style="color:#999;">-</span>` : `<span style="color:${st.ratioColor};font-weight:bold;">${st.ratio}%</span>${st.targetRate ? `<br><span style="font-size:9px;color:#888;">목표 ${st.targetRate}%</span>` : ""}`}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.statusText}</td>
      </tr>`;
    }).join("");
  }

  function bindEvents() {
    document.addEventListener("click", e => {
      if (e.target.id === "hamBtn" || e.target.closest("#hamBtn")) {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        if (sidebar) sidebar.classList.toggle("open");
        if (overlay) overlay.classList.toggle("show");
      }
      if (e.target.id === "sidebarLogoutBtn" || e.target.closest("#sidebarLogoutBtn")) {
        e.preventDefault();
        if (confirm("로그아웃 하시겠습니까?")) {
          localStorage.removeItem("user");
          localStorage.removeItem("userRole");
          location.href = "index.html";
        }
      }

      // 상태 필터 버튼 (전체/정상/주의/경고)
      const filterBtn = e.target.closest(".status-filter-box button");
      if (filterBtn && filterBtn.dataset.filter) {
        setFilter(filterBtn.dataset.filter);
      }
    });

    // ✅ 날짜 / 구역 변경 시 즉시 자동 적용 (조회 버튼 없음)
    ["sDate", "eDate", "zoneSel"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => applyFilter());
      }
    });
  }

  async function init() {
    const auth = localCheckAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();

    // 기본 날짜 설정 (최근 7일)
    const t = new Date();
    const eDate = document.getElementById("eDate");
    const sDate = document.getElementById("sDate");
    
    if (eDate) eDate.valueAsDate = t;
    if (sDate) {
      const startDate = new Date(t);
      startDate.setDate(t.getDate() - 6);
      sDate.valueAsDate = startDate;
    }

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    // 구역 목록
    const zSnap = await getDocs(collection(database, "zones"));
    zoneList = zSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(zoneCompare);
    const sel = document.getElementById("zoneSel");
    if (sel) {
      zoneList.forEach(z => sel.innerHTML += `<option value="${z.zoneName}">${z.zoneName}</option>`);
    }

    // ✅ 급액기준 + 급액셋팅 동시 로드
    const [sSnap, ssSnap] = await Promise.all([
      getDocs(collection(database, "supply_standards")),
      getDocs(collection(database, "supply_settings")).catch(() => null)
    ]);
    standards = sSnap.docs.map(d => d.data());
    supplySettings = ssSnap ? ssSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

    // 초기 데이터 조회
    applyFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();