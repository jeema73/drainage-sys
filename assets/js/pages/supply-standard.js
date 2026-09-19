(() => {
  "use strict";
  console.log("✅ supply-standard.js 로드됨 (v260920)");

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";
  const SS_COLLECTION = "supply_settings";
  let userRole = "";
  let supplySettings = [];

  const ROLE_ADMIN = "admin";
  const ROLE_MANAGER = "manager";

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
    userRole = (localStorage.getItem("userRole") || localStorage.getItem("userRole ") || "").trim();
    const allowRoles = [ROLE_ADMIN, ROLE_MANAGER];

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

  // =====================================================
  // ✅ 급액 셋팅 = 순수 "기준"만 (공급시간 · 끝 배지 유량)
  //    횟수(실적)는 배액기록에서 입력합니다.
  // =====================================================
  function updateSupplyCalc() {
    const minutes = parseFloat(document.getElementById("ssMinutes").value) || 0;
    const flow = parseFloat(document.getElementById("ssFlow").value) || 0;
    const perEvent = (minutes / 60) * flow;
    document.getElementById("ssPerEvent").value = perEvent > 0 ? `${perEvent.toFixed(2)} L` : "";
  }

  async function saveSupplySetting() {
    const settingDate = document.getElementById("ssDate").value;
    const lineNo = document.getElementById("ssLine").value;
    const supplyMethod = document.getElementById("ssMethod").value;
    const minutesPerEvent = parseFloat(document.getElementById("ssMinutes").value);
    const flowRatePerBag = parseFloat(document.getElementById("ssFlow").value);

    if (!settingDate) return alert("적용일자를 입력하세요!");
    if (isNaN(minutesPerEvent) || minutesPerEvent <= 0) return alert("공급시간(분)을 입력하세요!");
    if (isNaN(flowRatePerBag) || flowRatePerBag <= 0) return alert("끝 배지 유량(L/h)을 입력하세요!");

    const data = {
      settingDate, lineNo, supplyMethod,
      minutesPerEvent, flowRatePerBag,
      perEventL: Math.round(((minutesPerEvent / 60) * flowRatePerBag) * 100) / 100,
      updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();
    const editId = document.getElementById("ssEditId").value;

    try {
      if (editId) {
        await setDoc(doc(database, SS_COLLECTION, editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, SS_COLLECTION), data);
        alert("✅ 등록되었습니다!");
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
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, SS_COLLECTION));
      supplySettings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      supplySettings.sort((a, b) => {
        const dCmp = String(b.settingDate || "").localeCompare(String(a.settingDate || ""));
        if (dCmp !== 0) return dCmp;
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
    tb.innerHTML = supplySettings.map(s => {
      const perEvent = s.perEventL != null ? s.perEventL
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
    const s = supplySettings.find(x => x.id === id);
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
      alert("❌ 삭제 실: " + e.message);
    }
  }

  function copyLastSetting() {
    const line = document.getElementById("ssLine").value;
    let src = supplySettings.find(s => s.lineNo === line);
    if (!src) src = supplySettings[0];
    if (!src) return alert("복사할 기존 등록이 없습니다.");

    document.getElementById("ssEditId").value = "";
    document.getElementById("ssDate").valueAsDate = new Date();
    document.getElementById("ssLine").value = src.lineNo || line;
    document.getElementById("ssMethod").value = src.supplyMethod || "적산일사";
    document.getElementById("ssMinutes").value = src.minutesPerEvent || "";
    document.getElementById("ssFlow").value = src.flowRatePerBag || "";
    updateSupplyCalc();
    document.getElementById("ssFormTitle").textContent = "💧 급액 셋팅 등록 (라인별·일자별)";
  }

  function resetSupplyForm() {
    document.getElementById("ssEditId").value = "";
    document.getElementById("ssDate").valueAsDate = new Date();
    document.getElementById("ssLine").value = "V01";
    document.getElementById("ssMethod").value = "적산일사";
    document.getElementById("ssMinutes").value = "";
    document.getElementById("ssFlow").value = "";
    document.getElementById("ssPerEvent").value = "";
    document.getElementById("ssFormTitle").textContent = "💧 급액 셋팅 등록 (라인별·일자별)";
  }

  // =====================================================
  // ✅ 기존 급액기준(EC/pH) 기능
  // =====================================================
  async function loadList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs, query, orderBy } = await getFs();
    try {
      const q = query(collection(database, "supply_standards"), orderBy("standardDate", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(list);
    } catch (e) {
      console.error("목록 불러오기 오류:", e);
      document.getElementById("listBody").innerHTML = `<tr><td colspan="8" class="empty-box">오류: ${e.message}</td></tr>`;
    }
  }

  function renderList(list) {
    const tb = document.getElementById("listBody");
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="8" class="empty-box">등록된 기준이 없습니다. 위에서 먼저 등록하세요.</td></tr>`;
      return;
    }
    tb.innerHTML = list.map(r => `
      <tr>
        <td>${r.periodName || "-"}</td>
        <td>${r.standardDate || "-"}</td>
        <td>${r.lineNo || r.line || "V01"}</td>
        <td>${r.targetEc || r.supplyEc || "-"}</td>
        <td>${r.targetPh || r.supplyPh || "-"}</td>
        <td>${r.drainRate || "-"}%</td>
        <td>${r.remark || "-"}</td>
        <td>
          <span class="edit-link" onclick="editItem('${r.id}')">수정</span>
          ${(userRole === 'admin' || userRole === 'manager') ? `<span class="del-link" onclick="delItem('${r.id}')">삭제</span>` : ""}
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

    if (!periodName) return alert("생육단계명을 입력하세요!\n(예: 활착기, 비대기, 수확기)");
    if (!standardDate) return alert("적용일자를 입력하세요!");
    if (!targetEc || !targetPh) return alert("목표 EC와 pH 값을 입력하세요!");

    const data = {
      periodName, standardDate, lineNo,
      line: lineNo,
      targetEc: parseFloat(targetEc), targetPh: parseFloat(targetPh),
      supplyEc: parseFloat(targetEc), supplyPh: parseFloat(targetPh),
      drainRate: drainRate ? parseInt(drainRate) : null,
      remark, updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
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
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, "supply_standards"));
      const found = snap.docs.find(d => d.id === id);
      if (!found) return alert("데이터를 찾을 수 없습니다.");
      const r = found.data();
      document.getElementById("editId").value = id;
      document.getElementById("periodName").value = r.periodName || "";
      document.getElementById("standardDate").value = r.standardDate || "";
      document.getElementById("lineNo").value = r.lineNo || r.line || "V01";
      document.getElementById("targetEc").value = r.targetEc || r.supplyEc || "";
      document.getElementById("targetPh").value = r.targetPh || r.supplyPh || "";
      document.getElementById("drainRate").value = r.drainRate || "";
      document.getElementById("remark").value = r.remark || "";
      document.getElementById("formTitle").textContent = "✏️ 기준 수정";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      alert("수정 오류: " + e.message);
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
    if (standardDateEl) standardDateEl.valueAsDate = new Date();
    document.getElementById("lineNo").value = "V01";
    document.getElementById("targetEc").value = "";
    document.getElementById("targetPh").value = "";
    document.getElementById("drainRate").value = "";
    document.getElementById("remark").value = "";
    document.getElementById("formTitle").textContent = "➕ 기준 등록";
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

    ["ssMinutes", "ssFlow"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateSupplyCalc);
    });
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();

    const ssDateEl = document.getElementById("ssDate");
    if (ssDateEl) ssDateEl.valueAsDate = new Date();

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();