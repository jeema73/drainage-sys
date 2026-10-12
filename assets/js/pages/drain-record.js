(() => {
  "use strict";

  let db = null;
  let fsMod = null;

  let userRole = "";
  let zoneList = [];
  let standards = [];
  let supplySettings = [];
  let lastRecords = [];
  let lastEventsByLine = {}; // ✅ 라인별 최근 공급횟수 (프리필용)

  const ROLE_ADMIN = "admin";
  const ROLE_MANAGER = "manager";
  const ROLE_WORKER = "worker";

  function canEdit() { return [ROLE_ADMIN, ROLE_MANAGER, ROLE_WORKER].includes(userRole); }
  function canApprove() { return [ROLE_ADMIN, ROLE_MANAGER].includes(userRole); }

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

  function zoneNameCompare(aName, bName) {
    const a = String(aName || "");
    const b = String(bName || "");
    const aNursery = a.includes("육") ? 1 : 0;
    const bNursery = b.includes("육") ? 1 : 0;
    if (aNursery !== bNursery) return aNursery - bNursery;
    return zoneCompare({ zoneName: a }, { zoneName: b });
  }

  // ✅ 실시간 배액율 & 급액량 계산 미리보기
  function updateRealtimeRatioPreview() {
    const wrap = document.getElementById("sampleRowWrap");
    const previewEl = document.getElementById("realtimeRatioInfo");
    if (!wrap || wrap.style.display === "none" || !previewEl) return;

    const sel = document.getElementById("zoneSel");
    const opt = sel ? sel.selectedOptions[0] : null;
    const line = opt ? opt.dataset.line || "V01" : "V01";
    const mDate = document.getElementById("measureDate").value || (window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10));
    
    const drainMl = parseFloat(document.getElementById("drainAmount").value);
    const events = parseInt(document.getElementById("supplyEvents").value, 10);

    if (isNaN(drainMl) || isNaN(events) || events <= 0 || drainMl <= 0) {
      previewEl.style.display = "none";
      return;
    }

    // 급액 설정 조회 (해당 라인의 최신 설정)
    const ss = supplySettings
      .filter((s) => {
        const ssLine = s.lineNo || s.line || "V01";
        return ssLine === line && s.settingDate <= mDate;
      })
      .sort((a, b) => b.settingDate.localeCompare(a.settingDate))[0];

    // 목표 배액율 조회
    const std = standards
      .filter((s) => {
        const stdLine = s.lineNo || s.line || "V01";
        return stdLine === line && s.standardDate <= mDate;
      })
      .sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0];

    if (!ss) {
      previewEl.style.display = "block";
      previewEl.style.background = "#fff3e0";
      previewEl.style.color = "#e65100";
      previewEl.style.borderColor = "#ffe082";
      previewEl.innerHTML = `⚠️ [${line}] 라인의 급액 설정(공급시간/유량)이 등록되지 않아 배액율을 계산할 수 없습니다.`;
      return;
    }

    const perEventL = (parseFloat(ss.minutesPerEvent) / 60) * parseFloat(ss.flowRatePerBag);
    const perEventMl = Math.round(perEventL * 1000);
    const totalDailyL = perEventL * events;
    const totalDailyMl = Math.round(totalDailyL * 1000);

    const ratio = Math.round(((drainMl / 1000) / totalDailyL) * 1000) / 10;
    const targetRate = std ? parseFloat(std.drainRate) : null;

    let evalText = "정상";
    let badgeColor = "#2e7d32";
    if (targetRate) {
      const diff = Math.abs(ratio - targetRate);
      if (diff > 20) {
        evalText = "🚨 경고 (초과)";
        badgeColor = "#c62828";
      } else if (diff > 10) {
        evalText = "⚠️ 주의";
        badgeColor = "#ef6c00";
      } else {
        evalText = "✅ 정상 (±10%p)";
        badgeColor = "#2e7d32";
      }
    }

    previewEl.style.display = "block";
    previewEl.style.background = "#f1f8f3";
    previewEl.style.borderColor = "#c8e6c9";
    previewEl.style.color = "#1b5e20";
    previewEl.innerHTML = `
      <strong>💧 배액율 실시간 계산 결과:</strong><br>
      · 1회 급액량: <b>${perEventMl} mL</b> (${ss.minutesPerEvent}분 × ${ss.flowRatePerBag}L/h)<br>
      · 어제 총 공급량: <b>${totalDailyMl.toLocaleString()} mL</b> (${perEventMl}mL × ${events}회)<br>
      · 실측 배액량: <b>${drainMl.toLocaleString()} mL</b> ➔ 현재 배액율: <b style="font-size:12px; color:${badgeColor};">${ratio}%</b>
      ${targetRate ? `(목표 ${targetRate}% 대비 <span style="font-weight:bold; color:${badgeColor};">${evalText}</span>)` : ""}
    `;
  }

  // ✅ 구역 변경 시 샘플 측정 표시 & 전일 공급횟수 프리필
  function onZoneChange() {
    const sel = document.getElementById("zoneSel");
    const opt = sel ? sel.selectedOptions[0] : null;
    const wrap = document.getElementById("sampleRowWrap");
    if (!opt || !opt.value) {
      if (wrap) wrap.style.display = "none";
      return;
    }
    const hasSample = opt.dataset.sample === "true";
    if (wrap) wrap.style.display = hasSample ? "block" : "none";

    if (hasSample) {
      const line = opt.dataset.line || "V01";
      const editId = document.getElementById("editId").value;
      const evInput = document.getElementById("supplyEvents");
      if (!editId && evInput && !evInput.value && lastEventsByLine[line]) {
        evInput.value = lastEventsByLine[line];
      }
      updateRealtimeRatioPreview();
    }
  }

  // ✅ 라인별 최근 공급횟수 사전 집계
  function scanRecentEvents(records) {
    lastEventsByLine = {};
    const sorted = [...records].sort((a, b) => {
      const dtA = `${a.measureDate} ${a.measureTime || ""}`;
      const dtB = `${b.measureDate} ${b.measureTime || ""}`;
      return dtB.localeCompare(dtA);
    });
    sorted.forEach((r) => {
      const line = r.line || "V01";
      if (!lastEventsByLine[line] && r.supplyEvents && parseInt(r.supplyEvents, 10) > 0) {
        lastEventsByLine[line] = r.supplyEvents;
      }
    });
  }

  async function loadRecords() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    const zFilter = document.getElementById("zFilter").value;
    const appFilter = document.getElementById("approvedFilter").value;

    try {
      const snap = await getDocs(collection(database, "drain_records"));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      scanRecentEvents(list);

      if (sDate) list = list.filter((r) => r.measureDate >= sDate);
      if (eDate) list = list.filter((r) => r.measureDate <= eDate);
      if (zFilter) list = list.filter((r) => r.zoneName === zFilter);
      if (appFilter !== "") {
        const isApp = appFilter === "true";
        list = list.filter((r) => (r.approved === true) === isApp);
      }

      list.sort((a, b) => {
        const dtA = `${a.measureDate} ${a.measureTime || ""}`;
        const dtB = `${b.measureDate} ${b.measureTime || ""}`;
        if (dtA !== dtB) return dtB.localeCompare(dtA);
        return zoneNameCompare(a.zoneName, b.zoneName);
      });

      lastRecords = list;
      renderTable(list);
    } catch (e) {
      console.error("기록 불러오기 오류", e);
    }
  }

  function renderTable(list) {
    const tb = document.getElementById("listBody");
    if (!tb) return;

    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="16" class="empty-box">조회된 기록이 없습니다.</td></tr>`;
      return;
    }

    const editOk = canEdit();
    const apprOk = canApprove();

    tb.innerHTML = list.map((r) => {
      const st = checkStatus(r);
      let rowClass = "";
      if (st.level === "danger") rowClass = "class='danger-row'";
      else if (st.level === "warn") rowClass = "class='warn-row'";

      const isApproved = r.approved === true;
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
        <td class="action-btns">
          <button class="btn-sm btn-primary" onclick="editRec('${r.id}')" ${editOk ? "" : "disabled"}>수정</button>
          <button class="btn-sm btn-secondary" onclick="toggleApprove('${r.id}', ${isApproved})" ${apprOk ? "" : "disabled"}>${isApproved ? "승인취소" : "승인"}</button>
          <button class="btn-sm btn-danger" onclick="deleteRec('${r.id}')" ${apprOk ? "" : "disabled"}>삭제</button>
        </td>
      </tr>`;
    }).join("");
  }

  async function saveRecord() {
    if (!canEdit()) return alert("등록/수정 권한이 없습니다.");

    const measureDate = document.getElementById("measureDate").value;
    const measureTime = document.getElementById("measureTime").value;
    const zoneSel = document.getElementById("zoneSel");
    const zoneName = zoneSel.value;
    const opt = zoneSel.selectedOptions[0];
    const drainEc = document.getElementById("drainEc").value;
    const drainPh = document.getElementById("drainPh").value;
    const bedTemp = document.getElementById("bedTemp").value;

    if (!measureDate || !measureTime) return alert("측정일자와 시간을 입력하세요!");
    if (!zoneName) return alert("구역을 선택하세요!");
    if (!drainEc || !drainPh) return alert("배액 EC와 pH를 입력하세요!");

    const sampleOn = document.getElementById("sampleRowWrap").style.display !== "none";
    const supplyEventsVal = document.getElementById("supplyEvents").value;
    if (sampleOn && !supplyEventsVal) return alert("전일 공급횟수를 입력하세요!\n(어제 양액기 로그의 총 급수횟수)");

    const editId = document.getElementById("editId").value;

    const data = {
      measureDate,
      measureTime,
      zoneName,
      line: opt ? opt.dataset.line || "V01" : "V01",
      drainEc: parseFloat(drainEc),
      drainPh: parseFloat(drainPh),
      bedTemp: bedTemp ? parseFloat(bedTemp) : null,
      sampleEc: sampleOn && document.getElementById("sampleEc").value ? parseFloat(document.getElementById("sampleEc").value) : null,
      samplePh: sampleOn && document.getElementById("samplePh").value ? parseFloat(document.getElementById("samplePh").value) : null,
      drainAmount: sampleOn && document.getElementById("drainAmount").value ? parseFloat(document.getElementById("drainAmount").value) : null,
      supplyEvents: sampleOn && supplyEventsVal ? parseInt(supplyEventsVal, 10) : null,
      updatedAt: new Date().toISOString()
    };

    // ⚠️ [극단적 오입력 검증] 현장 측정 범위(오타) 점검
    const warnings = [];
    if (data.drainEc < 0.3 || data.drainEc > 4.5) {
      warnings.push(`• 배액 EC: ${data.drainEc} (통상 0.8 ~ 3.5)`);
    }
    if (data.drainPh < 4.0 || data.drainPh > 8.5) {
      warnings.push(`• 배액 pH: ${data.drainPh} (통상 5.0 ~ 7.5)`);
    }
    if (data.sampleEc !== null && (data.sampleEc < 0.3 || data.sampleEc > 4.5)) {
      warnings.push(`• 샘플 EC: ${data.sampleEc} (통상 0.8 ~ 3.5)`);
    }
    if (data.samplePh !== null && (data.samplePh < 4.0 || data.samplePh > 8.5)) {
      warnings.push(`• 샘플 pH: ${data.samplePh} (통상 5.0 ~ 7.5)`);
    }
    if (data.bedTemp !== null && (data.bedTemp < 3 || data.bedTemp > 45)) {
      warnings.push(`• 배지온도: ${data.bedTemp}℃ (통상 10 ~ 35℃)`);
    }
    if (data.drainAmount !== null && (data.drainAmount < 0 || data.drainAmount > 8000)) {
      warnings.push(`• 배액량: ${data.drainAmount}mL`);
    }
    if (data.supplyEvents !== null && (data.supplyEvents < 1 || data.supplyEvents > 40)) {
      warnings.push(`• 전일 공급횟수: ${data.supplyEvents}회`);
    }

    if (warnings.length > 0) {
      const confirmMsg =
        "⚠️ [입력값 주의 알림]\n일반적인 측정 범위를 벗어난 수치가 있습니다.\n오타가 아닌지 확인해주세요:\n\n" +
        warnings.join("\n") +
        "\n\n이 값 그대로 저장하시겠습니까?";
      if (!confirm(confirmMsg)) {
        return;
      }
    }

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
      if (editId) {
        await setDoc(doc(database, "drain_records", editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.approved = false;
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "drain_records"), data);
        alert("✅ 등록되었습니다!");
      }
      resetForm();
      await loadRecords();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  function editRec(id) {
    if (!canEdit()) return alert("수정 권한이 없습니다.");
    const r = lastRecords.find((x) => x.id === id);
    if (!r) return;

    document.getElementById("editId").value = id;
    document.getElementById("measureDate").value = r.measureDate || "";
    document.getElementById("measureTime").value = r.measureTime || "";

    const zoneSel = document.getElementById("zoneSel");
    if (zoneSel) {
      zoneSel.value = r.zoneName || "";
      onZoneChange();
    }

    document.getElementById("drainEc").value = r.drainEc != null ? r.drainEc : "";
    document.getElementById("drainPh").value = r.drainPh != null ? r.drainPh : "";
    document.getElementById("bedTemp").value = r.bedTemp != null ? r.bedTemp : "";

    const sampleRow = document.getElementById("sampleRowWrap");
    if (sampleRow && sampleRow.style.display !== "none") {
      document.getElementById("sampleEc").value = r.sampleEc != null ? r.sampleEc : "";
      document.getElementById("samplePh").value = r.samplePh != null ? r.samplePh : "";
      document.getElementById("drainAmount").value = r.drainAmount != null ? r.drainAmount : "";
      document.getElementById("supplyEvents").value = r.supplyEvents != null ? r.supplyEvents : "";
    }

    const ft = document.getElementById("formTitle");
    if (ft) ft.textContent = "✏️ 배액 기록 수정";

    const formCard = document.getElementById("recordFormCard");
    if (formCard) formCard.scrollIntoView({ behavior: "smooth" });
  }

  async function toggleApprove(id, currentApproved) {
    if (!canApprove()) return alert("승인/승인취소 권한이 없습니다.");
    const database = await ensureDb();
    if (!database) return;
    const { doc, updateDoc } = await getFs();

    try {
      await updateDoc(doc(database, "drain_records", id), {
        approved: !currentApproved,
        approvedAt: new Date().toISOString()
      });
      await loadRecords();
    } catch (e) {
      alert("❌ 처리 실패: " + e.message);
    }
  }

  async function deleteRec(id) {
    if (!canApprove()) return alert("삭제 권한이 없습니다 (최고관리자·매니저만 가능).");
    if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;

    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();

    try {
      await deleteDoc(doc(database, "drain_records", id));
      alert("✅ 삭제되었습니다.");
      await loadRecords();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    document.getElementById("measureDate").value = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
    document.getElementById("measureTime").value = new Date().toTimeString().slice(0, 5);
    const zoneSel = document.getElementById("zoneSel");
    if (zoneSel) zoneSel.value = "";
    onZoneChange();
    ["drainEc", "drainPh", "bedTemp", "sampleEc", "samplePh", "drainAmount", "supplyEvents"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const ft = document.getElementById("formTitle");
    if (ft) ft.textContent = "➕ 배액 기록 등록";
  }

  function bindEvents() {
    ["sDate", "eDate", "zFilter", "approvedFilter"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", loadRecords);
    });

    const zoneSel = document.getElementById("zoneSel");
    if (zoneSel) zoneSel.addEventListener("change", onZoneChange);

    // 💧 배액량 및 공급횟수 입력 시 실시간 계산 미리보기 바인딩
    ["drainAmount", "supplyEvents"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateRealtimeRatioPreview);
    });
    const mDateEl = document.getElementById("measureDate");
    if (mDateEl) mDateEl.addEventListener("change", updateRealtimeRatioPreview);

    const saveBtn = document.getElementById("saveBtn");
    const resetBtn = document.getElementById("resetBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveRecord);
    if (resetBtn) resetBtn.addEventListener("click", () => {
      resetForm();
      const p = document.getElementById("realtimeRatioInfo");
      if (p) p.style.display = "none";
    });
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth() : null;
    if (!auth) return;
    userRole = window.normalizeRole ? window.normalizeRole(auth.userRole) : auth.userRole;

    bindEvents();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const eDateEl = document.getElementById("eDate");
    const sDateEl = document.getElementById("sDate");
    if (eDateEl) eDateEl.value = window.toLocalYmd ? window.toLocalYmd(today) : today.toISOString().slice(0, 10);
    if (sDateEl) sDateEl.value = window.toLocalYmd ? window.toLocalYmd(yesterday) : yesterday.toISOString().slice(0, 10);

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    try {
      const [zoneSnap, stdSnap, ssSnap] = await Promise.all([
        getDocs(collection(database, "zones")),
        getDocs(collection(database, "supply_standards")),
        getDocs(collection(database, "supply_settings")).catch(() => null)
      ]);
      zoneList = zoneSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(zoneCompare);
      standards = stdSnap.docs.map((d) => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.log("기준데이터 불러오기 오류:", e);
    }

    const sel = document.getElementById("zoneSel");
    const fil = document.getElementById("zFilter");
    if (sel && !sel.querySelector('option[value=""]')) {
      sel.insertAdjacentHTML("afterbegin", `<option value="">-- 구역 선택 --</option>`);
    }
    zoneList.forEach((z) => {
      const line = z.liquidLine || z.line || "V01";
      const hasSample = z.hasSampleData ? "true" : "false";
      if (sel) sel.innerHTML += `<option data-line="${line}" data-sample="${hasSample}" value="${z.zoneName}">${z.zoneName} · ${line}</option>`;
      if (fil) fil.innerHTML += `<option value="${z.zoneName}">${z.zoneName}</option>`;
    });
    if (sel) sel.value = "";
    onZoneChange();

    resetForm();
    await loadRecords();
  }

  window.editRec = editRec;
  window.deleteRec = deleteRec;
  window.toggleApprove = toggleApprove;
  window.saveRecord = saveRecord;
  window.resetForm = resetForm;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();