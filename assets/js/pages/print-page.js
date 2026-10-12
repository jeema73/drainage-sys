(() => {
  "use strict";

  let db = null;
  let fsMod = null;

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
    return db;
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
      standards = stdSnap.docs.map((d) => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.log("기준/급액셋팅 불러오기 오류:", e);
    }
  }

  // ✅ 배액율 계산 (common.js 활용)
  function getRatio(r) {
    if (!r) return null;
    if (typeof window.calcDrainStatus === "function") {
      const res = window.calcDrainStatus(r, standards, supplySettings);
      return res.ratio;
    }
    return null;
  }

  async function loadZones() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const zSnap = await getDocs(collection(database, "zones"));
    zoneList = zSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const zoneMap = new Map();
    zoneList.forEach((data) => {
      const zoneName = String(data.zoneName || data.name || "");
      if (!zoneName) return;
      const isSample = Boolean(data.hasSampleData === true || data.isSampleZone === true);
      const isSeedling = zoneName.includes("육묘") ? 1 : 0;
      const numMatch = zoneName.match(/(\d+)/);
      const sortNum = numMatch ? parseInt(numMatch[1], 10) : 999;
      const zoneInfo = {
        zoneName,
        zoneNo: sortNum,
        isSeedling,
        sortNum,
        lineNo: String(data.line || data.supplyLine || "V01"),
        useSample: isSample
      };
      if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, zoneInfo);
    });

    displayZones = Array.from(zoneMap.values())
      .filter(Boolean)
      .sort((a, b) => {
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
    if (["drainEc", "sampleEc", "drainPh", "samplePh"].includes(field)) {
      const num = parseFloat(v);
      return !isNaN(num) ? num.toFixed(2) : String(v);
    }
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
    const allRecords = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    recordList = allRecords.filter((r) => {
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
    recordList.forEach((r) => {
      if (!r || !r.measureDate) return;
      const dt = r.measureDate;
      if (!dateGroups[dt]) dateGroups[dt] = [];
      dateGroups[dt].push(r);
    });

    let html = `<thead><tr>
      <th rowspan="2" style="min-width:70px;">측정일자</th>
      <th rowspan="2" style="min-width:50px;">측정시간</th>
      <th rowspan="2" style="min-width:40px;">항목</th>`;
    displayZones.forEach((z) => {
      if (!z) return;
      const colSpan = z.useSample ? 2 : 1;
      html += `<th colspan="${colSpan}" class="zone-name">${z.zoneName}<br>(${z.lineNo})</th>`;
    });
    html += `</tr><tr>`;
    displayZones.forEach((z) => {
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
      const times = recs.map((r) => r.measureTime || "09:00").filter(Boolean).sort();
      const firstTime = times[0] || "09:00";
      const zoneData = {};
      recs.forEach((r) => {
        if (!r) return;
        const zName = String(r.zoneName || "");
        if (!zName) return;
        const matchedZone = zoneList.find((z) => z && String(z.zoneName) === zName);
        if (matchedZone) zoneData[matchedZone.zoneName] = r;
      });

      html += `<tr>`;
      html += `<td rowspan="4">${dt.replace(/-/g, ".")}</td>`;
      html += `<td rowspan="4">${firstTime}</td>`;
      html += `<td>EC</td>`;
      displayZones.forEach((z) => {
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
      displayZones.forEach((z) => {
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
      displayZones.forEach((z) => {
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

      html += `<tr><td>배액율</td>`;
      displayZones.forEach((z) => {
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
    if (!recordList || recordList.length === 0) {
      return alert("내보낼 데이터가 없습니다. 먼저 조회해 주세요.");
    }

    const headers = ["측정일자", "측정시간", "구역명", "양액라인", "배액EC", "배액pH", "배지온도", "샘플EC", "샘플pH", "배액량(mL)", "전일공급횟수", "배액율(%)", "승인여부"];
    const rows = [headers];

    const f2 = window.formatNum2 || ((v) => (v != null && v !== "" && !isNaN(v) ? parseFloat(v).toFixed(2) : ""));

    recordList.forEach((r) => {
      const ratio = getRatio(r);
      rows.push([
        r.measureDate || "",
        r.measureTime || "",
        r.zoneName || "",
        r.line || "",
        f2(r.drainEc),
        f2(r.drainPh),
        r.bedTemp != null && r.bedTemp !== "" ? parseFloat(r.bedTemp).toFixed(1) : "",
        f2(r.sampleEc),
        f2(r.samplePh),
        r.drainAmount ?? "",
        r.supplyEvents ?? "",
        ratio ?? "",
        r.approved ? "승인" : "미승인"
      ]);
    });

    const csvContent = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `스마트팜_배액기록_${document.getElementById("sDate").value}_${document.getElementById("eDate").value}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ✅ 엑셀(.xlsx) 다운로드 기능 (SheetJS 연동)
  function exportExcel() {
    if (!recordList.length) return alert("다운로드할 데이터가 없습니다. 먼저 조회하세요!");

    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    const fileName = `스마트팜_배액기록_${sDate}_${eDate}.xlsx`;

    if (typeof window.XLSX === "undefined") {
      alert("엑셀 변환 라이브러리를 불러오지 못했습니다. CSV 다운로드를 이용해주세요.");
      return;
    }

    try {
      const wb = window.XLSX.utils.book_new();

      // 시트 1: 화면의 표(배액 측정 기록표) 그대로 내보내기
      const tableEl = document.getElementById("printTable");
      if (tableEl) {
        const wsTable = window.XLSX.utils.table_to_sheet(tableEl);
        window.XLSX.utils.book_append_sheet(wb, wsTable, "배액측정표");
      }

      // 시트 2: 상세 데이터 목록 (데이터 분석/가공용)
      const detailRows = [
        ["측정일자", "측정시간", "구역명", "양액라인", "배액EC", "배액pH", "배지온도", "샘플EC", "샘플pH", "배액량(mL)", "전일공급횟수", "배액율(%)", "승인여부"]
      ];
      recordList.forEach((r) => {
        const ratio = getRatio(r);
        detailRows.push([
          r.measureDate || "",
          r.measureTime || "",
          r.zoneName || "",
          r.line || "",
          r.drainEc != null ? Number(r.drainEc) : "",
          r.drainPh != null ? Number(r.drainPh) : "",
          r.bedTemp != null ? Number(r.bedTemp) : "",
          r.sampleEc != null ? Number(r.sampleEc) : "",
          r.samplePh != null ? Number(r.samplePh) : "",
          r.drainAmount != null ? Number(r.drainAmount) : "",
          r.supplyEvents != null ? Number(r.supplyEvents) : "",
          ratio != null ? Number(ratio) : "",
          r.approved ? "승인" : "미승인"
        ]);
      });
      const wsDetail = window.XLSX.utils.aoa_to_sheet(detailRows);
      window.XLSX.utils.book_append_sheet(wb, wsDetail, "상세데이터");

      window.XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("엑셀 파일 생성 오류:", err);
      alert("엑셀 파일 생성 중 오류가 발생했습니다: " + err.message);
    }
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth() : null;
    if (!auth) return;

    const today = new Date();
    const day = today.getDay() || 7;
    const mon = new Date(today);
    mon.setDate(today.getDate() - day + 1);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    const sDateEl = document.getElementById("sDate");
    const eDateEl = document.getElementById("eDate");
    if (sDateEl) sDateEl.value = window.toLocalYmd ? window.toLocalYmd(mon) : mon.toISOString().slice(0, 10);
    if (eDateEl) eDateEl.value = window.toLocalYmd ? window.toLocalYmd(fri) : fri.toISOString().slice(0, 10);

    await loadZones();
    await loadStandards();
    await loadData();
  }

  window.loadData = loadData;
  window.exportCSV = exportCSV;
  window.exportExcel = exportExcel;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();