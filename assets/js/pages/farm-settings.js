(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const SETTINGS_COLL = "farm_settings_history";
  const CURRENT_SETTING_ID = "current";

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

  function updatePreview() {
    const plantDate = document.getElementById("plantingDate").value;
    const endDate = document.getElementById("seasonEndDate").value;
    if (!plantDate || !endDate) {
      document.getElementById("previewDays").value = "정식일 입력 필요";
      document.getElementById("previewStage").value = "-";
      document.getElementById("previewRate").value = "-";
      return;
    }
    const prog = window.calcFarmProgress
      ? window.calcFarmProgress(plantDate, endDate)
      : { daysText: "-", stage: { name: "-" }, rate: 0, days: 0 };

    document.getElementById("previewDays").value = prog.daysText;
    document.getElementById("previewStage").value = prog.stage.name;
    document.getElementById("previewRate").value = `${prog.rate}%`;
  }

  async function saveFarmSettings() {
    const farmName = document.getElementById("farmName").value.trim();
    const plantingDate = document.getElementById("plantingDate").value;
    const seasonEndDate = document.getElementById("seasonEndDate").value;
    const season = document.getElementById("season").value.trim();

    if (!farmName || !plantingDate || !seasonEndDate || !season) {
      return alert("농장명, 시즌명, 정식일, 시즌 종료예정일은 필수입니다.");
    }

    const data = {
      farmName,
      farmDong: document.getElementById("farmDong") ? document.getElementById("farmDong").value : "수유동",
      farmAddr: document.getElementById("farmAddr").value.trim(),
      season,
      managerName: document.getElementById("managerName").value.trim(),
      contact: document.getElementById("contact").value.trim(),
      cropName: document.getElementById("cropName").value.trim() || "딸기",
      variety: document.getElementById("variety").value.trim(),
      plantingDate,
      seasonEndDate,
      updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc } = await getFs();

    try {
      await setDoc(doc(database, "settings", CURRENT_SETTING_ID), data);
      await setDoc(doc(database, SETTINGS_COLL, season), data);
      if (typeof window.invalidateFarmCache === "function") window.invalidateFarmCache();
      if (typeof window.invalidateWeatherCache === "function") window.invalidateWeatherCache();
      if (typeof window.loadFarmName === "function") window.loadFarmName(true);
      if (typeof window.loadWeather === "function") window.loadWeather(true);
      alert("✅ 농장설정이 저장되었습니다.");
      updatePreview();
      loadSavedList();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  async function loadFarmSettings() {
    const database = await ensureDb();
    if (!database) return;
    const { doc, getDoc } = await getFs();
    try {
      const snap = await getDoc(doc(database, "settings", CURRENT_SETTING_ID));
      if (snap.exists()) {
        fillForm(snap.data());
      } else {
        alert("⚠️ 저장된 설정이 없습니다.");
      }
    } catch (e) {
      alert("❌ 불러오기 실패: " + e.message);
    }
  }

  function fillForm(d) {
    document.getElementById("farmName").value = d.farmName || "";
    if (document.getElementById("farmDong")) {
      document.getElementById("farmDong").value = d.farmDong || "수유동";
    }
    document.getElementById("farmAddr").value = d.farmAddr || "";
    document.getElementById("season").value = d.season || "";
    document.getElementById("managerName").value = d.managerName || "";
    document.getElementById("contact").value = d.contact || "";
    document.getElementById("cropName").value = d.cropName || "딸기";
    document.getElementById("variety").value = d.variety || "";
    document.getElementById("plantingDate").value = d.plantingDate || "";
    document.getElementById("seasonEndDate").value = d.seasonEndDate || "";
    updatePreview();
  }

  function clearForm() {
    document.getElementById("farmName").value = "";
    if (document.getElementById("farmDong")) {
      document.getElementById("farmDong").value = "수유동";
    }
    document.getElementById("farmAddr").value = "";
    document.getElementById("season").value = "";
    document.getElementById("managerName").value = "";
    document.getElementById("contact").value = "";
    document.getElementById("cropName").value = "딸기";
    document.getElementById("variety").value = "";
    document.getElementById("plantingDate").value = "";
    document.getElementById("seasonEndDate").value = "";
    document.getElementById("previewDays").value = "-";
    document.getElementById("previewStage").value = "-";
    document.getElementById("previewRate").value = "-";
  }

  async function loadSavedList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, SETTINGS_COLL));
      const tbody = document.getElementById("savedListBody");
      if (!tbody) return;

      if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">저장된 시즌 설정이 없습니다.</td></tr>`;
        return;
      }

      let html = "";
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const seasonId = docSnap.id;
        const updated = d.updatedAt ? d.updatedAt.slice(0, 10) : "-";
        html += `
          <tr>
            <td><strong>${d.season || seasonId}</strong></td>
            <td>${d.cropName || "-"}</td>
            <td>${d.variety || "-"}</td>
            <td>${d.plantingDate?.slice(5) || "-"}</td>
            <td>${d.seasonEndDate?.slice(5) || "-"}</td>
            <td>${updated}</td>
            <td>
              <button class="btn-sm" style="background:#e0e0e0; color:#333;" onclick="useSeason('${seasonId}')">적용</button>
              <button class="btn-sm" style="background:#2196f3; color:#fff;" onclick="loadSeason('${seasonId}')">수정</button>
              <button class="btn-sm" style="background:#ffebee; color:#c62828;" onclick="deleteSeason('${seasonId}')">삭제</button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    } catch (e) {
      console.error("리스트 불러오기 오류:", e);
      const tbody = document.getElementById("savedListBody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-row">오류 발생</td></tr>`;
    }
  }

  async function loadSeason(seasonId) {
    const database = await ensureDb();
    if (!database) return;
    const { doc, getDoc } = await getFs();
    try {
      const snap = await getDoc(doc(database, SETTINGS_COLL, seasonId));
      if (snap.exists()) {
        fillForm(snap.data());
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      alert("❌ 불러오기 실패: " + e.message);
    }
  }

  async function useSeason(seasonId) {
    if (!confirm(`"${seasonId}" 시즌을 현재 설정으로 적용하시겠습니까?`)) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, getDoc, setDoc } = await getFs();
    try {
      const snap = await getDoc(doc(database, SETTINGS_COLL, seasonId));
      if (snap.exists()) {
        const data = snap.data();
        await setDoc(doc(database, "settings", CURRENT_SETTING_ID), data);
        if (typeof window.invalidateFarmCache === "function") window.invalidateFarmCache();
        if (typeof window.loadFarmName === "function") window.loadFarmName(true);
        alert(`✅ ${seasonId} 시즌이 현재 설정으로 적용되었습니다.`);
        fillForm(data);
      }
    } catch (e) {
      alert("❌ 적용 실패: " + e.message);
    }
  }

  async function deleteSeason(seasonId) {
    if (!confirm(`"${seasonId}" 시즌을 삭제하시겠습니까?`)) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, SETTINGS_COLL, seasonId));
      alert("✅ 삭제되었습니다.");
      loadSavedList();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function bindEvents() {
    const pd = document.getElementById("plantingDate");
    const ed = document.getElementById("seasonEndDate");
    if (pd) pd.addEventListener("change", updatePreview);
    if (ed) ed.addEventListener("change", updatePreview);
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth(["admin", "manager"]) : null;
    if (!auth) return;

    bindEvents();
    await loadFarmSettings();
    await loadSavedList();
  }

  window.saveFarmSettings = saveFarmSettings;
  window.loadFarmSettings = loadFarmSettings;
  window.clearForm = clearForm;
  window.loadSeason = loadSeason;
  window.useSeason = useSeason;
  window.deleteSeason = deleteSeason;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();