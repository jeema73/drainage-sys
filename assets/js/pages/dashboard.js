(() => {
  "use strict";

  let db = null;
  let standards = [];
  let supplySettings = []; // ✅ 배액율 계산용
  let selectedLine = "V01";
  let gFarmData = null;
  const FARM_SETTINGS_ID = "current";

  // Firebase Firestore 모듈 동적 로드
  async function getFs() {
    return await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  }

  // DB 연결 (common.js와 연동)
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

  function applyMenuPermissions(userRole) {
    document.querySelectorAll(".sidebar-menu a").forEach(link => {
      const allowedRoles = (link.dataset.role || "all").split(",");
      if (allowedRoles.includes("all") || allowedRoles.includes(userRole)) {
        link.classList.add("visible");
      } else {
        link.classList.remove("visible");
      }
    });
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

    const events = parseFloat(r.supplyEvents);
    if (ss && events > 0 && !isNaN(drainMl) && drainMl > 0) {
      const perEventL = (parseFloat(ss.minutesPerEvent) / 60) * parseFloat(ss.flowRatePerBag);
      const dailyL = perEventL * events;
      if (dailyL > 0) {
        ratio = (drainMl / 1000) / dailyL * 100;
        if (targetRate) {
          const ad = Math.abs(ratio - targetRate);
          ratioLevel = ad <= 10 ? "ok" : ad <= 20 ? "warn" : "danger";
        }
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

  function checkAuth() {
    const userStr = localStorage.getItem("user") || localStorage.getItem("user ");
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = (localStorage.getItem("userRole") || localStorage.getItem("userRole ") || "").trim();

    if (!user || !user.userId || !userRole) {
      location.href = "index.html";
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

  function doLogout() {
    if (confirm("로그아웃 하시겠습니까?")) {
      localStorage.removeItem("user");
      localStorage.removeItem("userRole");
      location.href = "index.html";
    }
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
        doLogout();
      }
    });

    ["V01", "V02", "V03"].forEach(line => {
      const btn = document.getElementById(`btn${line}`);
      if (btn) {
        btn.addEventListener("click", () => {
          selectedLine = line;
          loadRecentTrend();
        });
      }
    });
  }

  function getGrowthStage(days) {
    if (days < 0) return { name: "정식준비", color: "#666", bg: "#f5f5f5" };
    if (days <= 30) return { name: "활착기", color: "#2e7d32", bg: "#e8f5e9" };
    if (days <= 60) return { name: "생육기", color: "#ed6c02", bg: "#fff3e0" };
    if (days <= 120) return { name: "초기수확기", color: "#d32f2f", bg: "#ffebee" };
    if (days <= 180) return { name: "수확중기", color: "#7b1fa2", bg: "#f3e5f5" };
    return { name: "수확후기", color: "#1976d2", bg: "#e3f2fd" };
  }

  function calcProgress(plantingDateStr, endDateStr) {
    if (!plantingDateStr || !endDateStr) {
      return { daysText: "정식일 설정 필요", stage: { name: "-", color: "#888", bg: "#f5f5f5" }, rate: 0 };
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pd = new Date(plantingDateStr); pd.setHours(0, 0, 0, 0);
    const ed = new Date(endDateStr); ed.setHours(0, 0, 0, 0);
    const days = Math.round((today - pd) / (1000 * 60 * 60 * 24));
    const daysText = days >= 0 ? `D+${days}` : `D${days}`;
    const totalDays = Math.round((ed - pd) / (1000 * 60 * 60 * 24));
    const rate = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((days / totalDays) * 100))) : 0;
    return { daysText, stage: getGrowthStage(days), rate, days };
  }

  function formatDateYmd(s) {
    if (!s) return "-";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function loadFarmInfo() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();

    try {
      const snap = await fs.getDoc(fs.doc(database, "settings", FARM_SETTINGS_ID));
      if (snap.exists()) {
        gFarmData = snap.data();
        const farm = gFarmData;
        const prog = calcProgress(farm.plantingDate, farm.seasonEndDate);

        const topFarmName = document.getElementById("topFarmName");
        if (topFarmName) topFarmName.textContent = farm.farmName || "강북구 스마트팜 재배단지";

        const topFarmMeta = document.getElementById("topFarmMeta");
        if (topFarmMeta) {
          topFarmMeta.innerHTML = `
            <span>🌿 재배작물: ${farm.cropType || "딸기"}</span>
            <span>🍓 품종: ${farm.variety || "금실"}</span>
            <span>🌱 정식일: ${formatDateYmd(farm.plantingDate)}</span>
          `;
        }

        const farmInfoArea = document.getElementById("farmInfoArea");
        if (farmInfoArea) {
          farmInfoArea.innerHTML = `
            <div style="margin-bottom:8px; text-align:center;">
              <strong style="font-size:14px;">${farm.farmName || "강북구 스마트팜"}</strong>
              <span style="color:#666; font-size:10px; margin-left:6px;">${farm.season || ""}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:stretch; flex-wrap:nowrap;">
              <div style="flex:2; padding:8px 4px; background:#e3f2fd; border-radius:6px; text-align:center;">
                <div style="font-size:20px; font-weight:bold; color:#1565c0;">${prog.daysText}</div>
                <div style="font-size:10px; color:#555;">정식후 경과일</div>
              </div>
              <div style="flex:3; padding:8px 4px; background:${prog.stage.bg}; border-radius:6px; text-align:center;">
                <div style="font-size:17px; font-weight:bold; color:${prog.stage.color};">${prog.stage.name}</div>
                <div style="font-size:10px; color:#555;">현재 생육단계</div>
              </div>
              <div style="flex:5; padding:8px 4px; background:#f3e5f5; border-radius:6px; text-align:center;">
                <div style="font-size:13px; font-weight:bold; color:#7b1fa2; margin-bottom:4px;">시즌 진행율 ${prog.rate}%</div>
                <div style="height:15px; background:#e0e0e0; border-radius:5px; overflow:hidden; width:100%;">
                  <div style="height:100%; width:${prog.rate}%; background:#7b1fa2; border-radius:5px;"></div>
                </div>
              </div>
            </div>
          `;
        }
      } else {
        const topFarmName = document.getElementById("topFarmName");
        if (topFarmName) topFarmName.textContent = "강북구 스마트팜 재배단지";
        
        const topFarmMeta = document.getElementById("topFarmMeta");
        if (topFarmMeta) topFarmMeta.innerHTML = `<span style="color:#ffd700;">⚠️ 농장설정 미등록</span>`;
        
        const farmInfoArea = document.getElementById("farmInfoArea");
        if (farmInfoArea) farmInfoArea.innerHTML = `<div style="padding:10px; color:#e65100; background:#fff8e1; border-radius:6px; text-align:center;">⚠️ 농장설정 미등록</div>`;
      }
    } catch (e) {
      console.error("농장정보 불러오기 오류", e);
    }
  }

  function getVal(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj[k];
      if (v != null && v !== "") {
        const n = parseFloat(v);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  function zoneCompare(a, b) {
    const ax = a.zoneName || "";
    const bx = b.zoneName || "";
    const aNum = /^\d/.test(ax), bNum = /^\d/.test(bx);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    if (aNum && bNum) {
      const an = ax.match(/\d+/), bn = bx.match(/\d+/);
      if (an && bn) {
        const na = parseInt(an[0]), nb = parseInt(bn[0]);
        if (na !== nb) return na - nb;
      }
    }
    return ax.localeCompare(bx, "ko");
  }

  // ✅ 급액기준 + 급액셋팅 동시 로드
  async function loadSupplyStandard() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const [stdSnap, ssSnap] = await Promise.all([
        fs.getDocs(fs.collection(database, "supply_standards")),
        fs.getDocs(fs.collection(database, "supply_settings")).catch(() => null)
      ]);
      standards = stdSnap.docs.map(d => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.error("급액기준/셋팅 불러오기 오류", e);
    }
  }

  async function loadDrainStats() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const snap = await fs.getDocs(fs.collection(database, "drain_records"));
      let cnt = 0, ecS = 0, phS = 0, tS = 0, ecC = 0, phC = 0, tC = 0;
      snap.forEach(d => {
        const r = d.data();
        if (r.measureDate === today) {
          cnt++;
          const ec = getVal(r, ["ec", "ecValue", "drainEc", "배액EC"]);
          const ph = getVal(r, ["ph", "phValue", "drainPh", "배액pH"]);
          const t = getVal(r, ["bedTemp", "temp", "온도"]);
          if (ec !== null) { ecS += ec; ecC++; }
          if (ph !== null) { phS += ph; phC++; }
          if (t !== null) { tS += t; tC++; }
        }
      });
      
      const todayCountEl = document.getElementById("todayCount");
      if (todayCountEl) todayCountEl.textContent = cnt + "건";
      
      const avgEcEl = document.getElementById("avgEc");
      if (avgEcEl) avgEcEl.textContent = ecC ? (ecS / ecC).toFixed(2) : "-";
      
      const avgPhEl = document.getElementById("avgPh");
      if (avgPhEl) avgPhEl.textContent = phC ? (phS / phC).toFixed(2) : "-";
      
      const avgTempEl = document.getElementById("avgTemp");
      if (avgTempEl) avgTempEl.textContent = tC ? (tS / tC).toFixed(1) + "℃" : "-";
    } catch (e) {
      console.error("오늘의 배액현황 불러오기 오류", e);
    }
  }

  // ✅ 최근 7일 배액율 통계
  async function loadRatioStats() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const today = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 6); // 최근 7일
      const startDate = weekAgo.toISOString().slice(0, 10);

      const snap = await fs.getDocs(fs.collection(database, "drain_records"));
      let ratioOk = 0, ratioWarn = 0, ratioDanger = 0, ratioNone = 0;
      let ratioSum = 0, ratioCnt = 0;

      snap.forEach(d => {
        const r = d.data();
        if (r.measureDate >= startDate) {
          const st = checkStatus(r);
          if (st.ratio == null) {
            ratioNone++;
          } else {
            ratioSum += st.ratio;
            ratioCnt++;
            if (!st.targetRate) return; // 목표 배액율 기준 없으면 통계 제외
            const ad = Math.abs(st.ratio - st.targetRate);
            if (ad <= 10) ratioOk++;
            else if (ad <= 20) ratioWarn++;
            else ratioDanger++;
          }
        }
      });

      const avgRatio = ratioCnt ? (ratioSum / ratioCnt).toFixed(2) : "-";
      const elAvgRatio = document.getElementById("avgRatio");
      if (elAvgRatio) elAvgRatio.textContent = avgRatio !== "-" ? avgRatio + "%" : "-";
      const elRatioOk = document.getElementById("ratioOk");
      if (elRatioOk) elRatioOk.textContent = ratioOk + "건";
      const elRatioWarn = document.getElementById("ratioWarn");
      if (elRatioWarn) elRatioWarn.textContent = ratioWarn + "건";
      const elRatioDanger = document.getElementById("ratioDanger");
      if (elRatioDanger) elRatioDanger.textContent = ratioDanger + "건";
    } catch (e) {
      console.error("배액율 통계 불러오기 오류", e);
    }
  }

  async function loadRecentTrend() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const snap = await fs.getDocs(fs.collection(database, "drain_records"));
      const byDate = {};
      snap.forEach(d => {
        const r = d.data();
        const dt = r.measureDate;
        const line = r.line || "V01";
        if (!dt) return;
        if (!byDate[dt]) byDate[dt] = { V01: [], V02: [], V03: [] };
        const ec = getVal(r, ["ec", "ecValue", "drainEc"]);
        if (ec !== null) byDate[dt][line].push(ec);
      });
      
      const daysData = {};
      Object.keys(byDate).sort().forEach(dt => {
        daysData[dt] = {
          V01: byDate[dt].V01.length ? byDate[dt].V01.reduce((a, b) => a + b, 0) / byDate[dt].V01.length : null,
          V02: byDate[dt].V02.length ? byDate[dt].V02.reduce((a, b) => a + b, 0) / byDate[dt].V02.length : null,
          V03: byDate[dt].V03.length ? byDate[dt].V03.reduce((a, b) => a + b, 0) / byDate[dt].V03.length : null,
        };
      });
      
      const days = Object.keys(daysData).sort().slice(-5);
      const stdEc = standards.filter(s => (s.line || "V01") === selectedLine).sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0]?.supplyEc || 0.8;
      
      ["V01", "V02", "V03"].forEach(l => {
        const btn = document.getElementById(`btn${l}`);
        if (!btn) return;
        if (l === selectedLine) {
          btn.style.borderColor = "#1976d2"; btn.style.background = "#e3f2fd"; btn.style.color = "#0d47a1"; btn.style.fontWeight = "bold";
        } else {
          btn.style.borderColor = "#ccc"; btn.style.background = "#fff"; btn.style.color = "#333"; btn.style.fontWeight = "normal";
        }
      });
      
      const trendArea = document.getElementById("trendArea");
      if (!trendArea) return;

      if (!days.length) {
        trendArea.innerHTML = `<div style="color:#888; padding:30px; text-align:center;">측정 데이터가 없습니다.</div>`;
        return;
      }
      
      const vals = days.map(d => daysData[d][selectedLine]).filter(v => v !== null);
      const maxVal = Math.max(...vals, parseFloat(stdEc) + 0.7, 2.0);
      const CHART_H = 70, LABEL_H = 30;
      const valToY = v => CHART_H - ((parseFloat(v) / maxVal) * CHART_H);
      const stdY = valToY(stdEc);
      
      trendArea.innerHTML = `
        <div style="position:relative; width:100%; height:${CHART_H + LABEL_H + 10}px; padding-left:35px;">
          <div style="position:absolute; left:0; top:0; width:30px; height:${CHART_H}px; font-size:9px; color:#999; text-align:right; padding-right:4px;">
            <span style="position:absolute; top:${valToY(maxVal) - 5}px; right:4px;">${maxVal.toFixed(1)}</span>
            <span style="position:absolute; top:${valToY((maxVal + parseFloat(stdEc)) / 2) - 5}px; right:4px;">${((maxVal + parseFloat(stdEc)) / 2).toFixed(1)}</span>
            <span style="position:absolute; top:${stdY - 5}px; right:4px; color:#1976d2; font-weight:bold;">${parseFloat(stdEc).toFixed(1)}</span>
            <span style="position:absolute; top:${valToY(0) - 5}px; right:4px;">0</span>
          </div>
          <div style="position:absolute; left:35px; top:0; right:0; height:${CHART_H}px; border-left:1px solid #ccc; border-bottom:1px solid #ccc;">
            <div style="position:absolute; left:0; right:0; top:${stdY}px; border-top:1px dashed #999;"></div>
            <div style="display:flex; justify-content:space-around; align-items:flex-end; height:100%;">
              ${days.map(dt => {
                const v = daysData[dt][selectedLine];
                const barH = v !== null ? Math.max(0, Math.round((parseFloat(v) / maxVal) * CHART_H)) : 0;
                let barColor = "#42a5f5";
                if (v !== null) {
                  const dev = parseFloat(v) - (parseFloat(stdEc) + 0.2);
                  if (dev >= 0.7 || dev <= -0.5) barColor = "#ef5350";
                  else if ((dev >= 0.4 && dev <= 0.6) || (dev <= -0.31 && dev >= -0.4)) barColor = "#ffa726";
                }
                return `<div style="width:16px; display:flex; flex-direction:column; justify-content:flex-end; height:100%;"><div style="width:100%; background:${barColor}; border-radius:3px 3px 0 0; height:${barH}px;"></div></div>`;
              }).join("")}
            </div>
          </div>
          <div style="position:absolute; left:35px; right:0; top:${CHART_H}px; display:flex; justify-content:space-around; padding-top:4px;">
            ${days.map(dt => {
              const v = daysData[dt][selectedLine];
              return `<div style="text-align:center; font-size:10px;"><div style="color:#555;">${dt.slice(5)}</div><div style="font-weight:bold; margin-top:1px;">${v ? parseFloat(v).toFixed(2) : '-'}</div></div>`;
            }).join("")}
          </div>
        </div>
      `;
    } catch (e) {
      console.error("추이 불러오기 오류", e);
    }
  }

  async function loadZoneStatus() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const [zonesSnap, recsSnap] = await Promise.all([
        fs.getDocs(fs.collection(database, "zones")),
        fs.getDocs(fs.collection(database, "drain_records"))
      ]);
      const zones = zonesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(zoneCompare);
      const recs = recsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const latestByZone = {};
      recs.forEach(r => {
        const z = r.zoneName;
        if (!z) return;
        const key = `${r.measureDate} ${r.measureTime || ""}`;
        if (!latestByZone[z] || key > `${latestByZone[z].measureDate} ${latestByZone[z].measureTime || ""}`) {
          latestByZone[z] = r;
        }
      });
      
      let html = "";
      zones.forEach(z => {
        const rec = latestByZone[z.zoneName];
        if (!rec) {
          html += `<tr><td>${z.zoneName}</td><td>-</td><td>-</td><td>-</td><td>측정없음</td></tr>`;
          return;
        }
        const st = checkStatus(rec);
        const ec = getVal(rec, ["ec", "ecValue", "drainEc"]);
        const ph = getVal(rec, ["ph", "phValue", "drainPh"]);
        html += `
          <tr>
            <td>${z.zoneName}</td>
            <td>${rec.measureDate} ${rec.measureTime || ""}</td>
            <td>${ec !== null ? ec.toFixed(2) : "-"}</td>
            <td>${ph !== null ? ph.toFixed(2) : "-"}</td>
            <td style="color:${st.statusColor}; font-weight:bold;">${st.statusText}</td>
          </tr>
        `;
      });
      
      const zoneStatus = document.getElementById("zoneStatus");
      if (zoneStatus) {
        zoneStatus.innerHTML = html || `<tr><td colspan="5" class="empty-box">등록된 구역이 없습니다.</td></tr>`;
      }
    } catch (e) {
      console.error("구역상태 불러오기 오류", e);
    }
  }

  async function loadWeather() {
    try {
      const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.63&longitude=127.03&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=1");
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m * 10) / 10;
      const minTemp = Math.round(data.daily.temperature_2m_min[0]);
      const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
      const code = data.current.weather_code;

      let icon = "☀️";
      let desc = "맑음";
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

  // ✅ 대시보드 초기화 실행
  async function initDashboard() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();

    await loadSupplyStandard();
    await loadFarmInfo();
    loadWeather();
    
    await Promise.all([
      loadDrainStats(),
      loadRatioStats(), // ✅ 배액율 통계 호출 추가
      loadRecentTrend(),
      loadZoneStatus()
    ]);
  }

  // 화면 준비되면 실행
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
  } else {
    initDashboard();
  }

})();