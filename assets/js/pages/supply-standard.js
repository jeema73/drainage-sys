(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const SS_COLLECTION = "supply_settings";
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

  function updateSupplyCalc() {
    const minutes = parseFloat(document.getElementById("ssMinutes").value);
    const flow = parseFloat(document.getElementById("ssFlow").value);
    const el = document.getElementById("ssPerEvent");
    if (!isNaN(minutes) && !isNaN(flow) && minutes > 0 && flow > 0) {
      const perEventL = (minutes / 60) * flow;
      const perEventMl = Math.round(perEventL * 1000);
      el.value = `${perEventMl} mL (${perEventL.toFixed(2)} L)`;
    } else {
      el.value = "";
    }
  }

  // 🌱 드리퍼 개수와 규격으로 간편 계산 (예: 5개 × 2L = 10L/h)
  function calcByDripper(count = 5, specLph = 2) {
    const totalFlow = count * specLph;
    const flowInput = document.getElementById("ssFlow");
    const minInput = document.getElementById("ssMinutes");
    if (flowInput) flowInput.value = totalFlow;
    if (minInput && !minInput.value) minInput.value = 3;
    updateSupplyCalc();
  }

  // 🧪 비커 실측치로 간편 계산 (예: 3분 동안 500mL 받음 ➔ 10L/h)
  function promptMeasureCalc() {
    const curMin = document.getElementById("ssMinutes").value || "3";
    const minStr = prompt("측정한 시간(분)을 입력하세요:", curMin);
    if (!minStr) return;
    const mins = parseFloat(minStr);
    if (isNaN(mins) || mins <= 0) return alert("시간을 올바르게 입력하세요.");

    const mlStr = prompt("해당 시간 동안 배지 1개(드리퍼 5개 전체)에서 받아낸 총 배액/급액량(mL)을 입력하세요:", "500");
    if (!mlStr) return;
    const ml = parseFloat(mlStr);
    if (isNaN(ml) || ml <= 0) return alert("용량을 올바르게 입력하세요.");

    // 시간당 유량(L/h) 역산 = (ml / 1000) / (mins / 60)
    const lph = (ml / 1000) / (mins / 60);
    const roundedFlow = Math.round(lph * 100) / 100;

    document.getElementById("ssMinutes").value = mins;
    document.getElementById("ssFlow").value = roundedFlow;
    updateSupplyCalc();
    alert(`✅ 계산 완료!\n- 공급시간: ${mins}분\n- 끝 배지 유량: ${roundedFlow} L/h\n- 1회 급액량: ${ml} mL`);
  }

  async function saveSupplySetting() {
    const settingDate = document.getElementById("ssDate").value;
    const lineNo = document.getElementById("ssLine").value;
    const supplyMethod = document.getElementById("ssMethod").value;
    const minutes = parseFloat(document.getElementById("ssMinutes").value);
    const flow = parseFloat(document.getElementById("ssFlow").value);
    const editId = document.getElementById("ssEditId").value;

    if (!settingDate) return alert("적용일자를 입력하세요!");
    if (isNaN(minutes) || minutes <= 0) return alert("공급시간(분/회)을 올바르게 입력하세요!");
    if (isNaN(flow) || flow <= 0) return alert("끝 배지 유량(L/h)을 올바르게 입력하세요!");

    const perEventL = Math.round((minutes / 60) * flow * 100) / 100;

    const data = {
      settingDate,
      lineNo,
      supplyMethod,
      minutesPerEvent: minutes,
      flowRatePerBag: flow,
      perEventL,
      updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { collection, doc, addDoc, setDoc } = await getFs();

    try {
      if (editId) {
        await setDoc(doc(database, SS_COLLECTION, editId), data, { merge: true });
        alert("✅ 급액 셋팅이 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, SS_COLLECTION), data);
        alert("✅ 급액 셋팅이 등록되었습니다!");
      }
      resetSupplyForm();
      await loadSupplySettings();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  async function loadSupplySettings() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs, query, orderBy } = await getFs();
    try {
      const q = query(collection(database, SS_COLLECTION), orderBy("settingDate", "desc"));
      const snap = await getDocs(q);
      supplySettings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      supplySettings.sort((a, b) => {
        const dDiff = String(b.settingDate || "").localeCompare(String(a.settingDate || ""));
        if (dDiff !== 0) return dDiff;
        return String(a.lineNo || "").localeCompare(String(b.lineNo || ""));
      });
      renderSupplyList();
    } catch (e) {
      console.error("급액 셋팅 불러오기 오류:", e);
      const tb = document.getElementById("ssListBody");
      if (tb) tb.innerHTML = `<tr><td colspan="7" class="empty-box">오류: ${e.message}</td></tr>`;
    }
  }

  function renderSupplyList() {
    const tb = document.getElementById("ssListBody");
    if (!tb) return;
    if (!supplySettings.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-box">등록된 급액 셋팅이 없습니다.</td></tr>`;
      return;
    }
    tb.innerHTML = supplySettings.map((s) => {
      const perEvent = s.perEventL != null
        ? s.perEventL
        : ((parseFloat(s.minutesPerEvent) / 60) * parseFloat(s.flowRatePerBag)).toFixed(2);
      return `
      <tr>
        <td>${s.settingDate || "-"}</td>
        <td>${s.lineNo || "-"}</td>
        <td>${s.supplyMethod || "-"}</td>
        <td>${s.minutesPerEvent || "-"}분</td>
        <td>${s.flowRatePerBag || "-"} L/h</td>
        <td><strong>${perEvent} L</strong></td>
        <td>
          <button class="btn-sm btn-primary" onclick="editSupplySetting('${s.id}')">수정</button>
          <button class="btn-sm btn-danger" onclick="deleteSupplySetting('${s.id}')">삭제</button>
        </td>
      </tr>`;
    }).join("");
  }

  function editSupplySetting(id) {
    const s = supplySettings.find((x) => x.id === id);
    if (!s) return;
    document.getElementById("ssEditId").value = id;
    document.getElementById("ssDate").value = s.settingDate || "";
    document.getElementById("ssLine").value = s.lineNo || "V01";
    document.getElementById("ssMethod").value = s.supplyMethod || "적산일사";
    document.getElementById("ssMinutes").value = s.minutesPerEvent || "";
    document.getElementById("ssFlow").value = s.flowRatePerBag || "";
    updateSupplyCalc();
    document.getElementById("ssFormTitle").textContent = "✏️ 급액 셋팅 수정";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteSupplySetting(id) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, SS_COLLECTION, id));
      alert("✅ 삭제되었습니다!");
      await loadSupplySettings();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function copyLastSetting() {
    const line = document.getElementById("ssLine").value;
    let src = supplySettings.find((s) => s.lineNo === line);
    if (!src) src = supplySettings[0];
    if (!src) return alert("복사할 기존 등록이 없습니다.");

    document.getElementById("ssEditId").value = "";
    document.getElementById("ssDate").value = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
    document.getElementById("ssLine").value = src.lineNo || line;
    document.getElementById("ssMethod").value = src.supplyMethod || "적산일사";
    document.getElementById("ssMinutes").value = src.minutesPerEvent || "";
    document.getElementById("ssFlow").value = src.flowRatePerBag || "";
    updateSupplyCalc();
    document.getElementById("ssFormTitle").textContent = "💧 급액 셋팅 등록 (라인별·일자별)";
  }

  function resetSupplyForm() {
    document.getElementById("ssEditId").value = "";
    document.getElementById("ssDate").value = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
    document.getElementById("ssLine").value = "V01";
    document.getElementById("ssMethod").value = "적산일사";
    document.getElementById("ssMinutes").value = "";
    document.getElementById("ssFlow").value = "";
    document.getElementById("ssPerEvent").value = "";
    document.getElementById("ssFormTitle").textContent = "💧 급액 셋팅 등록 (라인별·일자별)";
  }

  // =====================================================
  // ✅ 기준(EC/pH) 관리 기능
  // =====================================================
  async function loadList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs, query, orderBy } = await getFs();
    try {
      const q = query(collection(database, "supply_standards"), orderBy("standardDate", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const dDiff = String(b.standardDate || "").localeCompare(String(a.standardDate || ""));
        if (dDiff !== 0) return dDiff;
        return String(a.lineNo || a.line || "").localeCompare(String(b.lineNo || b.line || ""));
      });
      renderStandardList(list);
    } catch (e) {
      console.error("기준목록 불러오기 오류", e);
    }
  }

  function renderStandardList(list) {
    const tb = document.getElementById("listBody");
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="8" class="empty-box">등록된 기준이 없습니다.</td></tr>`;
      return;
    }
    tb.innerHTML = list.map((item) => `
      <tr>
        <td><strong>${item.periodName || "-"}</strong></td>
        <td>${item.standardDate || "-"}</td>
        <td>${item.lineNo || item.line || "V01"}</td>
        <td>${item.targetEc != null && !isNaN(item.targetEc) ? parseFloat(item.targetEc).toFixed(2) : "-"}</td>
        <td>${item.targetPh != null && !isNaN(item.targetPh) ? parseFloat(item.targetPh).toFixed(2) : "-"}</td>
        <td>${item.drainRate ? item.drainRate + "%" : "-"}</td>
        <td>${item.remark || "-"}</td>
        <td class="action-btns">
          <button class="btn-sm btn-primary" onclick="editItem('${item.id}')">수정</button>
          <button class="btn-sm btn-danger" onclick="delItem('${item.id}')">삭제</button>
        </td>
      </tr>
    `).join("");
  }

  async function saveStandard() {
    const periodName = document.getElementById("periodName").value.trim();
    const standardDate = document.getElementById("standardDate").value;
    const lineNo = document.getElementById("lineNo").value;
    const targetEc = document.getElementById("targetEc").value;
    const targetPh = document.getElementById("targetPh").value;
    const drainRate = document.getElementById("drainRate").value;
    const remark = document.getElementById("remark").value.trim();
    const editId = document.getElementById("editId").value;

    if (!periodName) return alert("생육단계를 입력하세요!");
    if (!standardDate) return alert("적용일자를 입력하세요!");
    if (!targetEc) return alert("목표 EC를 입력하세요!");
    if (!targetPh) return alert("목표 pH를 입력하세요!");

    const database = await ensureDb();
    if (!database) return;
    const { collection, doc, addDoc, setDoc } = await getFs();

    try {
      const data = {
        periodName,
        standardDate,
        lineNo,
        targetEc: parseFloat(targetEc),
        targetPh: parseFloat(targetPh),
        drainRate: drainRate ? parseFloat(drainRate) : null,
        supplyEc: parseFloat(targetEc),
        supplyPh: parseFloat(targetPh),
        remark,
        updatedAt: new Date().toISOString()
      };

      if (editId) {
        await setDoc(doc(database, "supply_standards", editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "supply_standards"), data);
        alert("✅ 등록되었습니다!");
      }
      resetForm();
      await loadList();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  async function editItem(id) {
    const database = await ensureDb();
    if (!database) return;
    const { doc, getDoc } = await getFs();
    try {
      const snap = await getDoc(doc(database, "supply_standards", id));
      if (!snap.exists()) return alert("문서를 찾을 수 없습니다.");
      const d = snap.data();
      document.getElementById("editId").value = id;
      document.getElementById("periodName").value = d.periodName || "";
      document.getElementById("standardDate").value = d.standardDate || "";
      document.getElementById("lineNo").value = d.lineNo || d.line || "V01";
      document.getElementById("targetEc").value = d.targetEc ?? d.supplyEc ?? "";
      document.getElementById("targetPh").value = d.targetPh ?? d.supplyPh ?? "";
      document.getElementById("drainRate").value = d.drainRate || "";
      document.getElementById("remark").value = d.remark || "";
      document.getElementById("formTitle").textContent = "✏️ 기준 수정";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      alert("❌ 조회 실패: " + e.message);
    }
  }

  async function delItem(id) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, "supply_standards", id));
      alert("✅ 삭제되었습니다!");
      await loadList();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    document.getElementById("periodName").value = "";
    const standardDateEl = document.getElementById("standardDate");
    if (standardDateEl) standardDateEl.value = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
    document.getElementById("lineNo").value = "V01";
    document.getElementById("targetEc").value = "";
    document.getElementById("targetPh").value = "";
    document.getElementById("drainRate").value = "";
    document.getElementById("remark").value = "";
    document.getElementById("formTitle").textContent = "➕ 기준 등록";
  }

  function bindEvents() {
    ["ssMinutes", "ssFlow"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateSupplyCalc);
    });
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth(["admin", "manager"]) : null;
    if (!auth) return;

    bindEvents();

    const ssDateEl = document.getElementById("ssDate");
    if (ssDateEl) ssDateEl.value = window.toLocalYmd ? window.toLocalYmd(new Date()) : new Date().toISOString().slice(0, 10);
    resetForm();

    await loadList();
    await loadSupplySettings();
  }

  window.saveStandard = saveStandard;
  window.editItem = editItem;
  window.delItem = delItem;
  window.resetForm = resetForm;
  window.saveSupplySetting = saveSupplySetting;
  window.editSupplySetting = editSupplySetting;
  window.deleteSupplySetting = deleteSupplySetting;
  window.copyLastSetting = copyLastSetting;
  window.resetSupplyForm = resetSupplyForm;
  window.calcByDripper = calcByDripper;
  window.promptMeasureCalc = promptMeasureCalc;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();