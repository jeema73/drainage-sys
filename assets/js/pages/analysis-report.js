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
  let ratioTrendChart = null;

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
    return db;
  }

  // ✅ 상태 판정 — common.js 공통 로직 활용
  function checkStatus(r) {
    if (typeof window.calcDrainStatus === "function") {
      return window.calcDrainStatus(r, standards, supplySettings);
    }
    return { level: "none", ecDev: "-", phDev: "-", supEc: "-", supPh: "-", statusText: "기준없음", statusColor: "#888", ratio: null, ratioColor: "#999", targetRate: null };
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

  function renderDeviationChart() {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js가 로드되지 않았습니다.");
      return;
    }

    let filtered = allRecords;
    if (currentFilter === "ok") filtered = allRecords.filter((r) => checkStatus(r).level === "ok");
    else if (currentFilter === "warn") filtered = allRecords.filter((r) => checkStatus(r).level === "warn");
    else if (currentFilter === "danger") filtered = allRecords.filter((r) => checkStatus(r).level === "danger");

    if (!filtered.length) {
      if (deviationChart) deviationChart.destroy();
      deviationChart = null;
      return;
    }

    const byDate = {};
    filtered.forEach((r) => {
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
    const ecAvgs = dates.map((d) => (byDate[d].ecSum / byDate[d].cnt).toFixed(2));
    const phAvgs = dates.map((d) => (byDate[d].phSum / byDate[d].cnt).toFixed(2));

    const canvas = document.getElementById("deviationChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (deviationChart) deviationChart.destroy();

    deviationChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates.map((d) => d.slice(5)),
        datasets: [
          { label: "EC 편차", data: ecAvgs, borderColor: "#1976d2", backgroundColor: "rgba(25,118,210,0.08)", borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 4, pointBackgroundColor: "#1976d2" },
          { label: "pH 편차", data: phAvgs, borderColor: "#388e3c", backgroundColor: "rgba(56,142,60,0.08)", borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 4, pointBackgroundColor: "#388e3c" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } },
          tooltip: { backgroundColor: "#222", padding: 10, titleFont: { size: 12 }, bodyFont: { size: 12 } }
        },
        scales: {
          y: {
            title: { display: true, text: "평균 편차", font: { size: 11 } },
            grid: {
              color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? "rgba(46, 125, 50, 0.6)" : "#e8e8e8"),
              lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1)
            },
            ticks: { font: { size: 11 } }
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        },
        interaction: { mode: "index", intersect: false }
      }
    });
  }

  function renderWarningChart() {
    if (typeof Chart === "undefined") return;

    const byDate = {};
    allRecords.forEach((r) => {
      const d = r.measureDate;
      if (!byDate[d]) byDate[d] = { warn: 0, danger: 0 };
      const level = checkStatus(r).level;
      if (level === "warn") byDate[d].warn += 1;
      else if (level === "danger") byDate[d].danger += 1;
    });

    const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
    const warnData = dates.map((d) => byDate[d].warn);
    const dangerData = dates.map((d) => byDate[d].danger);

    const canvas = document.getElementById("warningChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (warningChart) warningChart.destroy();

    warningChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dates.map((d) => d.slice(5)),
        datasets: [
          { label: "주의", data: warnData, backgroundColor: "#ffcc00", borderRadius: 3 },
          { label: "경고", data: dangerData, backgroundColor: "#e53935", borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } },
          tooltip: { backgroundColor: "#222", padding: 10, titleFont: { size: 12 }, bodyFont: { size: 12 } }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: "#e8e8e8" } }
        }
      }
    });
  }

  function setFilter(type) {
    currentFilter = type;
    document.querySelectorAll(".status-filter-box button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === type);
    });
    renderList();
    renderDeviationChart();
  }

  async function applyFilter() {
    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    const zVal = document.getElementById("zoneSel").value;

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    try {
      const snap = await getDocs(collection(database, "drain_records"));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (sDate) list = list.filter((r) => r.measureDate >= sDate);
      if (eDate) list = list.filter((r) => r.measureDate <= eDate);
      if (zVal) list = list.filter((r) => r.zoneName === zVal);

      list.sort((a, b) => {
        const dtA = `${a.measureDate} ${a.measureTime || ""}`;
        const dtB = `${b.measureDate} ${b.measureTime || ""}`;
        if (dtA !== dtB) return dtB.localeCompare(dtA);
        return (a.zoneName || "").localeCompare(b.zoneName || "");
      });

      allRecords = list;
      updateSummary();
    } catch (e) {
      console.error("분석데이터 조회 오류", e);
    }
  }

  function updateSummary() {
    const cntAll = allRecords.length;
    let cntOk = 0, cntWarn = 0, cntDanger = 0;

    allRecords.forEach((r) => {
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
    allRecords.forEach((r) => {
      const st = checkStatus(r);
      if (st.ecDev !== "-") { ecDevSum += Math.abs(parseFloat(st.ecDev)); ecDevCnt++; }
      if (r.sampleEc && st.supEc !== "-") {
        sEcDevSum += Math.abs(parseFloat(r.sampleEc) - (parseFloat(st.supEc) + 0.2));
        sEcDevCnt++;
      }
    });

    let ratioSum = 0, ratioCnt = 0;
    allRecords.forEach((r) => {
      const st = checkStatus(r);
      if (st.ratio != null) {
        ratioSum += st.ratio;
        ratioCnt++;
      }
    });

    const aCount = document.getElementById("aCount");
    const ecDev = document.getElementById("ecDev");
    const sEcDev = document.getElementById("sEcDev");
    const wCount = document.getElementById("wCount");
    const avgRatioEl = document.getElementById("avgRatioText");

    if (aCount) aCount.textContent = cntAll + "건";
    if (ecDev) ecDev.textContent = ecDevCnt ? (ecDevSum / ecDevCnt).toFixed(2) : "-";
    if (sEcDev) sEcDev.textContent = sEcDevCnt ? (sEcDevSum / sEcDevCnt).toFixed(2) : "-";
    if (wCount) wCount.textContent = (cntWarn + cntDanger) + "건";
    if (avgRatioEl) avgRatioEl.textContent = ratioCnt ? (ratioSum / ratioCnt).toFixed(1) + "%" : "-";

    generatePrescription();
    renderZoneSummary();
    renderList();
    renderDeviationChart();
    renderWarningChart();
    renderRatioTrendChart();
  }

  // 🏥 1. 오늘의 종합 배액 진단 & 맞춤 처방전 생성
  function generatePrescription() {
    const cardEl = document.getElementById("prescriptionCard");
    const contentEl = document.getElementById("prescriptionContent");
    const badgeEl = document.getElementById("overallBadge");
    if (!contentEl) return;

    if (!allRecords.length) {
      contentEl.innerHTML = "선택된 기간에 분석할 배액 측정 데이터가 없습니다.";
      if (badgeEl) { badgeEl.textContent = "데이터 없음"; badgeEl.style.background = "#888"; }
      return;
    }

    let devSum = 0, devCnt = 0;
    let phSum = 0, phCnt = 0;
    let ratioSum = 0, ratioCnt = 0;
    let dangerCount = 0;

    allRecords.forEach((r) => {
      const st = checkStatus(r);
      if (st.level === "danger") dangerCount++;
      if (st.ecDev !== "-") { devSum += parseFloat(st.ecDev); devCnt++; }
      if (r.drainPh) { phSum += parseFloat(r.drainPh); phCnt++; }
      if (st.ratio != null) { ratioSum += st.ratio; ratioCnt++; }
    });

    const avgDev = devCnt ? devSum / devCnt : 0;
    const avgPh = phCnt ? phSum / phCnt : 0;
    const avgRatio = ratioCnt ? ratioSum / ratioCnt : null;

    const advices = [];

    // ① EC 흡수율 및 염류 집적 진단
    if (avgDev >= 0.4) {
      advices.push(`🚨 <strong>비료염 농축(과잉) 주의</strong>: 배액 EC가 기준보다 평균 <b>+${avgDev.toFixed(2)}</b> 높게 배출되고 있습니다. 작물이 비료보다 물을 더 많이 빨아들여 배지에 비료염이 쌓이고 있습니다.<br>
      ➔ <u>조치</u>: 1회 급액량을 10% 늘려 배액을 충분히 빼내거나, 양액기 공급 EC를 0.1~0.2 낮추어 배지 내 농도 장해를 예방하세요.`);
    } else if (avgDev <= -0.3) {
      advices.push(`🌿 <strong>양분 흡수 왕성/비료 부족</strong>: 배액 EC가 기준보다 평균 <b>${avgDev.toFixed(2)}</b> 낮습니다. 뿌리가 비료를 왕성하게 흡수하고 있거나 공급 비료가 부족한 상태입니다.<br>
      ➔ <u>조치</u>: 초세와 생육 상태를 확인한 후 공급 EC를 0.1 정도 상향 조정을 검토하세요.`);
    } else {
      advices.push(`✅ <strong>영양 밸런스 최적</strong>: 배액 EC 편차가 평균 <b>${avgDev >= 0 ? "+" : ""}${avgDev.toFixed(2)}</b>로 작물의 비료 흡수와 공급 밸런스가 매우 양호합니다.`);
    }

    // ② 수분 밸런스(배액율) 진단
    if (avgRatio !== null) {
      if (avgRatio < 12) {
        advices.push(`🚨 <strong>과소배액(배지 건조 위험)</strong>: 평균 배액율이 <b>${avgRatio.toFixed(1)}%</b>로 기준(15~25%)보다 너무 낮습니다. 뿌리 끝이 마르고 염류가 농축될 위험이 큽니다.<br>
        ➔ <u>조치</u>: 하루 공급 횟수(회)를 1~2회 추가하거나 1회 공급시간(분)을 늘려 충분한 배액이 나오도록 유도하세요.`);
      } else if (avgRatio > 32) {
        advices.push(`⚠️ <strong>과관수(뿌리 과습 위험)</strong>: 평균 배액율이 <b>${avgRatio.toFixed(1)}%</b>로 과다 배출 중입니다. 뿌리가 숨을 쉬지 못해 활력이 떨어질 수 있습니다.<br>
        ➔ <u>조치</u>: 1회 공급시간을 줄이거나 공급 간격을 넓혀 배지 내 공기층(산소)을 확보해 주세요.`);
      } else {
        advices.push(`✅ <strong>수분 밸런스 최적</strong>: 평균 배액율이 <b>${avgRatio.toFixed(1)}%</b>로 고설베드 적정 수분 상태를 안정적으로 유지하고 있습니다.`);
      }
    }

    // ③ pH 진단
    if (avgPh > 0) {
      if (avgPh < 5.3) {
        advices.push(`🚨 <strong>배지 산성화 경고</strong>: 평균 배액 pH가 <b>${avgPh.toFixed(2)}</b>로 너무 낮습니다. 뿌리 발근 저해와 칼슘 흡수 억제가 우려됩니다. 원수/양액 pH를 5.8~6.0으로 보정하세요.`);
      } else if (avgPh > 6.7) {
        advices.push(`⚠️ <strong>배지 알칼리화 주의</strong>: 평균 배액 pH가 <b>${avgPh.toFixed(2)}</b>로 높습니다. 철(Fe)·인산 등 미량원소 결핍(황화현상)이 올 수 있으니 질산 투입을 점검하세요.`);
      }
    }

    // 배지 상태 배지(Badge) 색상 결정
    if (dangerCount > 0 || avgDev >= 0.5 || (avgRatio !== null && (avgRatio < 10 || avgRatio > 35))) {
      badgeEl.textContent = "🚨 긴급 조치 필요";
      badgeEl.style.background = "#c62828";
      cardEl.style.background = "#fff8f8";
      cardEl.style.borderColor = "#ef9a9a";
      cardEl.style.borderLeftColor = "#c62828";
    } else if (avgDev >= 0.35 || avgDev <= -0.35 || (avgRatio !== null && (avgRatio < 13 || avgRatio > 28))) {
      badgeEl.textContent = "⚠️ 주의 관찰 필요";
      badgeEl.style.background = "#ef6c00";
      cardEl.style.background = "#fffdf5";
      cardEl.style.borderColor = "#ffe082";
      cardEl.style.borderLeftColor = "#ef6c00";
    } else {
      badgeEl.textContent = "✅ 생육환경 매우 양호";
      badgeEl.style.background = "#2e7d32";
      cardEl.style.background = "#f4fbf5";
      cardEl.style.borderColor = "#a5d6a7";
      cardEl.style.borderLeftColor = "#2e7d32";
    }

    contentEl.innerHTML = advices.map(a => `<div style="margin-bottom:6px;">${a}</div>`).join("");
  }

  // 📊 2. 구역(라인)별 비교 성적표 렌더링
  function renderZoneSummary() {
    const tbody = document.getElementById("zoneSummaryBody");
    if (!tbody) return;

    if (!allRecords.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-box">집계할 데이터가 없습니다.</td></tr>`;
      return;
    }

    // 구역별 그룹핑
    const byZone = {};
    allRecords.forEach((r) => {
      const zName = r.zoneName || "미지정";
      if (!byZone[zName]) {
        byZone[zName] = {
          zoneName: zName,
          line: r.line || "V01",
          records: [],
          ecSum: 0, ecCnt: 0,
          devSum: 0, devCnt: 0,
          phSum: 0, phCnt: 0,
          ratioSum: 0, ratioCnt: 0,
          latestStatus: null
        };
      }
      const st = checkStatus(r);
      byZone[zName].records.push(r);
      if (r.drainEc) { byZone[zName].ecSum += parseFloat(r.drainEc); byZone[zName].ecCnt++; }
      if (st.ecDev !== "-") { byZone[zName].devSum += parseFloat(st.ecDev); byZone[zName].devCnt++; }
      if (r.drainPh) { byZone[zName].phSum += parseFloat(r.drainPh); byZone[zName].phCnt++; }
      if (st.ratio != null) { byZone[zName].ratioSum += st.ratio; byZone[zName].ratioCnt++; }
      if (!byZone[zName].latestStatus) byZone[zName].latestStatus = st;
    });

    const sortedZones = Object.values(byZone).sort(zoneCompare);

    tbody.innerHTML = sortedZones.map((z) => {
      const avgEc = z.ecCnt ? (z.ecSum / z.ecCnt).toFixed(2) : "-";
      const avgDev = z.devCnt ? (z.devSum / z.devCnt).toFixed(2) : "-";
      const avgPh = z.phCnt ? (z.phSum / z.phCnt).toFixed(2) : "-";
      const avgRatio = z.ratioCnt ? (z.ratioSum / z.ratioCnt).toFixed(1) + "%" : "-";
      const st = z.latestStatus || { statusText: "-", statusColor: "#888" };

      // 구역별 진단 및 조치 제안 도출
      let guide = "정상 유지";
      let guideColor = "#2e7d32";
      const devNum = parseFloat(avgDev);
      const ratioNum = parseFloat(avgRatio);

      if (!isNaN(devNum) && devNum >= 0.5) {
        guide = "염류집적 우려 (급액량 증량 or EC 인하)";
        guideColor = "#c62828";
      } else if (!isNaN(ratioNum) && ratioNum < 12) {
        guide = "배액부족 (드리퍼 막힘/관수량 점검)";
        guideColor = "#c62828";
      } else if (!isNaN(ratioNum) && ratioNum > 30) {
        guide = "과관수 우려 (관수 간격 조정)";
        guideColor = "#ef6c00";
      } else if (!isNaN(devNum) && devNum <= -0.35) {
        guide = "비료소모 빠름 (EC 상향 검토)";
        guideColor = "#1976d2";
      }

      return `
        <tr>
          <td><strong>${z.zoneName}</strong></td>
          <td>${z.line}</td>
          <td>${avgEc}</td>
          <td style="font-weight:600; color:${!isNaN(devNum) && Math.abs(devNum) >= 0.4 ? '#c62828' : '#333'};">${!isNaN(devNum) && devNum > 0 ? "+" + avgDev : avgDev}</td>
          <td>${avgPh}</td>
          <td style="font-weight:bold;">${avgRatio}</td>
          <td style="color:${st.statusColor}; font-weight:bold;">${st.statusText}</td>
          <td style="color:${guideColor}; font-weight:600;">${guide}</td>
        </tr>
      `;
    }).join("");
  }

  // 💧 3. 일별 평균 배액율(%) 추이 차트
  function renderRatioTrendChart() {
    if (typeof Chart === "undefined") return;

    const byDate = {};
    allRecords.forEach((r) => {
      const d = r.measureDate;
      const st = checkStatus(r);
      if (st.ratio != null) {
        if (!byDate[d]) byDate[d] = { sum: 0, cnt: 0 };
        byDate[d].sum += st.ratio;
        byDate[d].cnt += 1;
      }
    });

    const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
    const ratioData = dates.map((d) => (byDate[d].sum / byDate[d].cnt).toFixed(1));

    const canvas = document.getElementById("ratioTrendChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (ratioTrendChart) ratioTrendChart.destroy();

    if (!dates.length) {
      return;
    }

    ratioTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates.map((d) => d.slice(5)),
        datasets: [
          {
            label: "평균 배액율(%)",
            data: ratioData,
            borderColor: "#00897b",
            backgroundColor: "rgba(0,137,123,0.1)",
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#00897b"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } },
          tooltip: {
            backgroundColor: "#222",
            padding: 10,
            callbacks: {
              label: (ctx) => ` 배액율: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: "배액율 (%)", font: { size: 10 } },
            grid: {
              color: (ctx) => (ctx.tick && ctx.tick.value === 20 ? "rgba(0, 137, 123, 0.6)" : "#e8e8e8"),
              lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 20 ? 2 : 1)
            },
            ticks: { font: { size: 10 } },
            suggestedMin: 10,
            suggestedMax: 35
          },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderList() {
    let filtered = allRecords;
    if (currentFilter === "ok") filtered = allRecords.filter((r) => checkStatus(r).level === "ok");
    else if (currentFilter === "warn") filtered = allRecords.filter((r) => checkStatus(r).level === "warn");
    else if (currentFilter === "danger") filtered = allRecords.filter((r) => checkStatus(r).level === "danger");

    const tb = document.getElementById("reportBody");
    if (!tb) return;

    if (!filtered.length) {
      tb.innerHTML = `<tr><td colspan="15" class="empty-box">데이터가 없습니다.</td></tr>`;
      return;
    }

    tb.innerHTML = filtered.map((r) => {
      const st = checkStatus(r);
      let rowClass = "";
      if (st.level === "danger") rowClass = "class='danger-row'";
      else if (st.level === "warn") rowClass = "class='warn-row'";

      const zoneLine = `${r.zoneName || "-"} · ${r.line || "V01"}`;
      const ratioCell =
        st.ratio == null
          ? `<span style="color:#999;">-</span>`
          : `<span style="color:${st.ratioColor};font-weight:bold;">${st.ratio}%</span>${st.targetRate ? `<br><span style="font-size:9px;color:#888;">목표 ${st.targetRate}%</span>` : ""}`;

      const fEc = window.formatEc || ((v) => (v != null && v !== "" && !isNaN(v) ? parseFloat(v).toFixed(2) : "-"));
      const fPh = window.formatPh || ((v) => (v != null && v !== "" && !isNaN(v) ? parseFloat(v).toFixed(2) : "-"));

      return `<tr ${rowClass}>
        <td>${r.measureDate || "-"}</td>
        <td>${r.measureTime || "-"}</td>
        <td>${zoneLine}</td>
        <td>${fEc(r.drainEc)}</td>
        <td>${fEc(st.supEc)}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.ecDev}</td>
        <td>${fPh(r.drainPh)}</td>
        <td>${fPh(st.supPh)}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.phDev}</td>
        <td>${fEc(r.sampleEc)}</td>
        <td>${fPh(r.samplePh)}</td>
        <td>${r.bedTemp != null ? r.bedTemp + "℃" : "-"}</td>
        <td>${r.drainAmount || "-"}${r.supplyEvents ? ` <span style="font-size:9px;color:#888;">(${r.supplyEvents}회)</span>` : ""}</td>
        <td>${ratioCell}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.statusText}</td>
      </tr>`;
    }).join("");
  }

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const filterBtn = e.target.closest(".status-filter-box button");
      if (filterBtn && filterBtn.dataset.filter) {
        setFilter(filterBtn.dataset.filter);
      }
    });

    ["sDate", "eDate", "zoneSel"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => applyFilter());
      }
    });
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth() : null;
    if (!auth) return;

    bindEvents();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);

    const eDateEl = document.getElementById("eDate");
    const sDateEl = document.getElementById("sDate");
    if (eDateEl) eDateEl.value = window.toLocalYmd ? window.toLocalYmd(today) : today.toISOString().slice(0, 10);
    if (sDateEl) sDateEl.value = window.toLocalYmd ? window.toLocalYmd(startDate) : startDate.toISOString().slice(0, 10);

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const zSnap = await getDocs(collection(database, "zones"));
    zoneList = zSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(zoneCompare);
    const sel = document.getElementById("zoneSel");
    if (sel) {
      zoneList.forEach((z) => {
        sel.innerHTML += `<option value="${z.zoneName}">${z.zoneName}</option>`;
      });
    }

    const [sSnap, ssSnap] = await Promise.all([
      getDocs(collection(database, "supply_standards")),
      getDocs(collection(database, "supply_settings")).catch(() => null)
    ]);
    standards = sSnap.docs.map((d) => d.data());
    supplySettings = ssSnap ? ssSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

    applyFilter();
  }

  window.setFilter = setFilter;
  window.applyFilter = applyFilter;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();