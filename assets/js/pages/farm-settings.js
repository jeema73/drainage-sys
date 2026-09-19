(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const SETTINGS_COLL = "farm_settings_history";
  const CURRENT_SETTING_ID = "current";
  let userRole = "";

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
      const snap = await getDoc(doc(database, "settings", CURRENT_SETTING_ID));
      const topFarmNameEl = document.getElementById("topFarmName");
      const topMetaEl = document.getElementById("topFarmMeta");
      if (snap.exists()) {
        const farm = snap.data();
        if (topFarmNameEl) topFarmNameEl.textContent = farm.farmName || "강북구 스마트팜 재배단지";
        if (topMetaEl) {
          topMetaEl.innerHTML = `
            <span>🌿 재배작물: ${farm.cropName || "딸기"}</span>
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

    const userName = user.userName || user.userId || "사용자";
    const userNameEl = document.getElementById("sidebarUserName");
    if (userNameEl) userNameEl.textContent = `${userName} ${getRoleName(userRole)}`;

    applyMenuPermissions(userRole);

    if (!allowRoles.includes(userRole)) {
      const noPermitArea = document.getElementById("noPermitArea");
      const adminArea = document.getElementById("adminArea");
      if (noPermitArea) noPermitArea.style.display = "block";
      if (adminArea) adminArea.style.display = "none";
      return null;
    }

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

  // ✅ 생육단계 계산
  function getGrowthStage(days) {
    if (days < 0) return { name: "정식준비", color: "#666" };
    if (days <= 30) return { name: "활착기", color: "#2e7d32" };
    if (days <= 60) return { name: "생육기", color: "#ed6c02" };
    if (days <= 120) return { name: "초기수확기", color: "#d32f2f" };
    if (days <= 180) return { name: "수확중기", color: "#7b1fa2" };
    return { name: "수확후기", color: "#1976d2" };
  }

  // ✅ 미리보기 갱신
  function updatePreview() {
    const plantDate = document.getElementById("plantingDate").value;
    const endDate = document.getElementById("seasonEndDate").value;
    if (!plantDate || !endDate) {
      document.getElementById("previewDays").value = "정식일 입력 필요";
      document.getElementById("previewStage").value = "-";
      document.getElementById("previewRate").value = "-";
      return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pd = new Date(plantDate); pd.setHours(0, 0, 0, 0);
    const ed = new Date(endDate); ed.setHours(0, 0, 0, 0);
    const diffMs = today - pd;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const totalMs = ed - pd;
    const totalDays = Math.round(totalMs / (1000 * 60 * 60 * 24));
    const rate = totalDays > 0 ? Math.min(100, Math.round((days / totalDays) * 100)) : 0;
    const daysText = days >= 0 ? `D+${days}` : `D${days}`;
    const stage = getGrowthStage(days);
    document.getElementById("previewDays").value = daysText;
    document.getElementById("previewStage").value = stage.name;
    document.getElementById("previewRate").value = `${rate}% (${totalDays}일 기준)`;
  }

  // ✅ 저장: 현재 설정 + 히스토리 리스트에 함께 저장
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
      alert("✅ 농장설정이 저장되었습니다.");
      updatePreview();
      loadSavedList();
      loadFarmInfo();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  // ✅ 현재 설정 불러오기
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

  // ✅ 폼 채우기
  function fillForm(d) {
    document.getElementById("farmName").value = d.farmName || "";
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

  // ✅ 입력 초기화
  function clearForm() {
    document.getElementById("farmName").value = "";
    document.getElementById("farmAddr").value = "";
    document.getElementById("season").value = "";
    document.getElementById("managerName").value = "";
    document.getElementById("contact").value = "";
    document.getElementById("cropName").value = "딸기";
    document.getElementById("variety").value = "";
    document.getElementById("plantingDate").value = "";
    document.getElementById("seasonEndDate").value = "";
    document.getElementById("previewDays").value = "";
    document.getElementById("previewStage").value = "";
    document.getElementById("previewRate").value = "";
  }

  // ✅ 저장된 시즌 리스트 불러오기
  async function loadSavedList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs, query, orderBy } = await getFs();

    try {
      const q = query(collection(database, SETTINGS_COLL), orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);
      const tbody = document.getElementById("savedListBody");
      if (!tbody) return;

      if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">저장된 시즌 설정이 없습니다.</td></tr>`;
        return;
      }
      let html = "";
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const seasonId = docSnap.id;
        const updated = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("ko-KR") : "-";
        html += `
          <tr>
            <td>${d.season || "-"}</td>
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

  // ✅ 리스트에서 수정 불러오기
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

  // ✅ 이 시즌을 현재 설정으로 적용
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
        alert(`✅ ${seasonId} 시즌이 현재 설정으로 적용되었습니다.`);
        fillForm(data);
        loadFarmInfo();
      }
    } catch (e) {
      alert("❌ 적용 실패: " + e.message);
    }
  }

  // ✅ 시즌 삭제
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

    const pd = document.getElementById("plantingDate");
    const ed = document.getElementById("seasonEndDate");
    if (pd) pd.addEventListener("change", updatePreview);
    if (ed) ed.addEventListener("change", updatePreview);
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();
    loadWeather();
    await loadFarmSettings();
    await loadSavedList();
  }

  // HTML onclick에서 호출 가능하도록 전역 노출
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