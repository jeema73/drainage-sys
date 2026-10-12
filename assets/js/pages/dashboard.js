(() => {
  "use strict";

  let db = null;
  let standards = [];
  let supplySettings = []; // ✅ 배액율 계산용
  let selectedLine = "V01";
  let gFarmData = null;
  const FARM_SETTINGS_ID = "current";

  // Firestore 모듈 동적 로드
  async function getFs() {
    return await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  }

  // DB 연결 (common.js 연동)
  async function ensureDb() {
    if (db) return db;
    if (typeof window.initFirebaseIfNeeded === "function") {
      db = await window.initFirebaseIfNeeded();
    }
    return db;
  }

  // ✅ 상태 판정 — common.js의 통합 로직 사용
  function checkStatus(r) {
    if (typeof window.calcDrainStatus === "function") {
      return window.calcDrainStatus(r, standards, supplySettings);
    }
    return { level: "none", statusText: "-", statusColor: "#888", ratio: null, ratioColor: "#999" };
  }

  function bindEvents() {
    // V01, V02, V03 라인 필터 버튼 바인딩
    ["V01", "V02", "V03"].forEach((line) => {
      const btn = document.getElementById(`btn${line}`);
      if (btn) {
        btn.addEventListener("click", () => {
          selectedLine = line;
          loadRecentTrend();
        });
      }
    });
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
        const prog = window.calcFarmProgress
          ? window.calcFarmProgress(farm.plantingDate, farm.seasonEndDate)
          : { daysText: "-", stage: { name: "-", color: "#888", bg: "#f5f5f5" }, rate: 0 };

        // ✅ 헤더(topFarmName, topFarmMeta)는 common.js의 loadFarmName()이 처리
        // 이 함수는 대시보드 내 farmInfoArea 카드만 담당
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
      standards = stdSnap.docs.map((d) => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.error("급액기준/셋팅 불러오기 오류", e);
    }
  }

  // ✅ 오늘의 배액현황 — 로컬 날짜로 오늘 비교
  async function loadDrainStats() {
    const database = await ensureDb();
    if (!database) return;
    const fs = await getFs();
    try {
      const today = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
      const snap = await fs.getDocs(fs.collection(database, "drain_records"));
      let cnt = 0, ecS = 0, phS = 0, tS = 0, ecC = 0, phC = 0, tC = 0;
      snap.forEach((d) => {
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
      const now = new Date();
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      weekAgo.setDate(weekAgo.getDate() - 6);
      const startDate = window.toLocalYmd ? window.toLocalYmd(weekAgo) : weekAgo.toISOString().slice(0, 10);

      const snap = await fs.getDocs(fs.collection(database, "drain_records"));
      let ratioOk = 0, ratioWarn = 0, ratioDanger = 0;
      let ratioSum = 0, ratioCnt = 0;

      snap.forEach((d) => {
        const r = d.data();
        if (r.measureDate >= startDate) {
          const st = checkStatus(r);
          if (st.ratio != null) {
            ratioSum += st.ratio;
            ratioCnt++;
            if (!st.targetRate) return;
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
      snap.forEach((d) => {
        const r = d.data();
        const dt = r.measureDate;
        const line = r.line || "V01";
        if (!dt) return;
        if (!byDate[dt]) byDate[dt] = { V01: [], V02: [], V03: [] };
        const ec = getVal(r, ["ec", "ecValue", "drainEc"]);
        if (ec !== null) byDate[dt][line].push(ec);
      });

      const daysData = {};
      Object.keys(byDate).sort().forEach((dt) => {
        daysData[dt] = {
          V01: byDate[dt].V01.length ? byDate[dt].V01.reduce((a, b) => a + b, 0) / byDate[dt].V01.length : null,
          V02: byDate[dt].V02.length ? byDate[dt].V02.reduce((a, b) => a + b, 0) / byDate[dt].V02.length : null,
          V03: byDate[dt].V03.length ? byDate[dt].V03.reduce((a, b) => a + b, 0) / byDate[dt].V03.length : null
        };
      });

      const days = Object.keys(daysData).sort().slice(-5);
      const stdEc =
        standards
          .filter((s) => (s.line || "V01") === selectedLine)
          .sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0]?.supplyEc || 0.8;

      ["V01", "V02", "V03"].forEach((l) => {
        const btn = document.getElementById(`btn${l}`);
        if (!btn) return;
        if (l === selectedLine) {
          btn.style.borderColor = "#1976d2";
          btn.style.background = "#e3f2fd";
          btn.style.color = "#0d47a1";
          btn.style.fontWeight = "bold";
        } else {
          btn.style.borderColor = "#ccc";
          btn.style.background = "#fff";
          btn.style.color = "#333";
          btn.style.fontWeight = "normal";
        }
      });

      const trendArea = document.getElementById("trendArea");
      if (!trendArea) return;

      if (!days.length) {
        trendArea.innerHTML = `<div style="color:#888; padding:30px; text-align:center;">측정 데이터가 없습니다.</div>`;
        return;
      }

      const vals = days.map((d) => daysData[d][selectedLine]).filter((v) => v !== null);
      const maxVal = Math.max(...vals, parseFloat(stdEc) + 0.7, 2.0);
      const CHART_H = 70, LABEL_H = 30;
      const valToY = (v) => CHART_H - (parseFloat(v) / maxVal) * CHART_H;
      const stdY = valToY(stdEc);

      trendArea.innerHTML = `
        <div style="position:relative; width:100%; height:${CHART_H + LABEL_H + 10}px; padding-left:35px;">
          <div style="position:absolute; left:0; top:0; width:30px; height:${CHART_H}px; font-size:9px; color:#999; text-align:right; padding-right:4px;">
            <span style="position:absolute; top:${valToY(maxVal) - 5}px; right:4px;">${maxVal.toFixed(2)}</span>
            <span style="position:absolute; top:${valToY((maxVal + parseFloat(stdEc)) / 2) - 5}px; right:4px;">${((maxVal + parseFloat(stdEc)) / 2).toFixed(2)}</span>
            <span style="position:absolute; top:${stdY - 5}px; right:4px; color:#1976d2; font-weight:bold;">${parseFloat(stdEc).toFixed(2)}</span>
            <span style="position:absolute; top:${valToY(0) - 5}px; right:4px;">0.00</span>
          </div>
          <div style="position:absolute; left:35px; top:0; right:0; height:${CHART_H}px; border-left:1px solid #ccc; border-bottom:1px solid #ccc;">
            <div style="position:absolute; left:0; right:0; top:${stdY}px; border-top:1px dashed #999;"></div>
            <div style="display:flex; justify-content:space-around; align-items:flex-end; height:100%;">
              ${days
                .map((dt) => {
                  const v = daysData[dt][selectedLine];
                  const barH = v !== null ? Math.max(0, Math.round((parseFloat(v) / maxVal) * CHART_H)) : 0;
                  let barColor = "#42a5f5";
                  if (v !== null) {
                    const dev = parseFloat(v) - (parseFloat(stdEc) + 0.2);
                    if (dev >= 0.7 || dev <= -0.5) barColor = "#ef5350";
                    else if ((dev >= 0.4 && dev <= 0.6) || (dev <= -0.31 && dev >= -0.4)) barColor = "#ffa726";
                  }
                  return `<div style="width:16px; display:flex; flex-direction:column; justify-content:flex-end; height:100%;"><div style="width:100%; background:${barColor}; border-radius:3px 3px 0 0; height:${barH}px;"></div></div>`;
                })
                .join("")}
            </div>
          </div>
          <div style="position:absolute; left:35px; right:0; top:${CHART_H}px; display:flex; justify-content:space-around; padding-top:4px;">
            ${days
              .map((dt) => {
                const v = daysData[dt][selectedLine];
                return `<div style="text-align:center; font-size:10px;"><div style="color:#555;">${dt.slice(5)}</div><div style="font-weight:bold; margin-top:1px;">${v ? parseFloat(v).toFixed(2) : "-"}</div></div>`;
              })
              .join("")}
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
      const zones = zonesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(zoneCompare);
      const recs = recsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const latestByZone = {};
      recs.forEach((r) => {
        const z = r.zoneName;
        if (!z) return;
        const key = `${r.measureDate} ${r.measureTime || ""}`;
        if (!latestByZone[z] || key > `${latestByZone[z].measureDate} ${latestByZone[z].measureTime || ""}`) {
          latestByZone[z] = r;
        }
      });

      let html = "";
      zones.forEach((z) => {
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

  // ✅ 대시보드 초기화 실행
  async function initDashboard() {
    const auth = window.checkAuth ? window.checkAuth() : null;
    if (!auth) return;

    bindEvents();

    await loadSupplyStandard();
    await loadFarmInfo();

    await Promise.all([
      loadDrainStats(),
      loadRatioStats(),
      loadRecentTrend(),
      loadZoneStatus()
    ]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
  } else {
    initDashboard();
  }
})();