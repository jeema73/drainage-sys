(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const CURRENT_SETTING_ID = "current";
  let allAccounts = [];
  let userRole = "";

  const ROLE_ADMIN = "admin";

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

  // ✅ 최고관리자만 접근 가능
  function checkAuth() {
    const userStr = localStorage.getItem("user") || localStorage.getItem("user ");
    const user = userStr ? JSON.parse(userStr) : null;
    userRole = (localStorage.getItem("userRole") || localStorage.getItem("userRole ") || "").trim();

    if (!user || !user.userId || !userRole) {
      location.href = "index.html";
      return null;
    }

    const userName = user.userName || user.userId || "사용자";
    const userNameEl = document.getElementById("sidebarUserName");
    if (userNameEl) userNameEl.textContent = `${userName} ${getRoleName(userRole)}`;

    applyMenuPermissions(userRole);

    if (userRole !== ROLE_ADMIN) {
      const deniedArea = document.getElementById("deniedArea");
      const adminArea = document.getElementById("adminArea");
      if (deniedArea) deniedArea.style.display = "block";
      if (adminArea) adminArea.style.display = "none";
      return null;
    }

    const adminArea = document.getElementById("adminArea");
    const deniedArea = document.getElementById("deniedArea");
    if (adminArea) adminArea.style.display = "block";
    if (deniedArea) deniedArea.style.display = "none";

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

  async function loadAccounts() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const snap = await getDocs(collection(database, "accounts"));
    allAccounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allAccounts.sort((a, b) => (a.userId || "").localeCompare(b.userId || ""));

    const tb = document.getElementById("listBody");
    if (!tb) return;

    if (!allAccounts.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-box">등록된 계정이 없습니다.</td></tr>`;
      return;
    }

    const roleLabel = {
      admin: `<span class="role-admin">최고관리자</span>`,
      manager: `<span class="role-manager">매니저</span>`,
      worker: `<span class="role-worker">공공근로자</span>`,
      guest: `<span class="role-guest">게스트</span>`
    };

    tb.innerHTML = allAccounts.map(z => `
      <tr>
        <td><strong>${z.userId}</strong></td>
        <td>${z.userName || "-"}</td>
        <td>${roleLabel[z.userRole] || z.userRole}</td>
        <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis;">${z.userNote || "-"}</td>
        <td>
          <button class="btn-sm btn-primary" onclick="editAccount('${z.id}')">수정</button>
          <button class="btn-sm btn-danger" onclick="deleteAccount('${z.id}')">삭제</button>
        </td>
      </tr>
    `).join("");
  }

  async function saveAccount() {
    const userId = document.getElementById("userId").value.trim();
    const userPw = document.getElementById("userPw").value;
    const userName = document.getElementById("userName").value.trim();
    const userRoleVal = document.getElementById("userRole").value;
    const userNote = document.getElementById("userNote").value.trim();
    const editId = document.getElementById("editId").value;

    if (!userId || !userName) return alert("아이디와 사용자이름은 필수입니다.");
    if (!editId && !userPw) return alert("비밀번호를 입력해주세요.");
    if (userPw && userPw.length < 4) return alert("비밀번호는 4자 이상 입력해주세요.");

    const dup = allAccounts.find(a => a.userId === userId && a.id !== editId);
    if (dup) return alert("이미 사용 중인 아이디입니다.");

    const data = {
      userId, userName, userRole: userRoleVal, userNote,
      updatedAt: new Date().toISOString()
    };
    if (userPw) data.userPw = userPw;

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
      if (editId) {
        await setDoc(doc(database, "accounts", editId), data, { merge: true });
        alert("✅ 수정되었습니다.");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "accounts"), data);
        alert("✅ 등록되었습니다.");
      }
      resetForm();
      loadAccounts();
    } catch (e) {
      alert("❌ 오류: " + e.message);
    }
  }

  function editAccount(id) {
    const a = allAccounts.find(x => x.id === id);
    if (!a) return;
    document.getElementById("editId").value = id;
    document.getElementById("userId").value = a.userId || "";
    document.getElementById("userPw").value = "";
    document.getElementById("userPw").placeholder = "변경 시에만 입력 (비우면 유지)";
    document.getElementById("userName").value = a.userName || "";
    document.getElementById("userRole").value = a.userRole || "worker";
    document.getElementById("userNote").value = a.userNote || "";
    document.getElementById("formTitle").textContent = "✏️ 계정 수정";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteAccount(id) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, "accounts", id));
      alert("✅ 삭제되었습니다.");
      loadAccounts();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    document.getElementById("userId").value = "";
    document.getElementById("userPw").value = "";
    document.getElementById("userPw").placeholder = "4자 이상 입력";
    document.getElementById("userName").value = "";
    document.getElementById("userRole").value = "worker";
    document.getElementById("userNote").value = "";
    document.getElementById("formTitle").textContent = "➕ 계정 등록";
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
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();
    loadWeather();
    await loadAccounts();
  }

  // HTML onclick에서 호출 가능하도록 전역 노출
  window.saveAccount = saveAccount;
  window.editAccount = editAccount;
  window.deleteAccount = deleteAccount;
  window.resetForm = resetForm;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ✅ 최고관리자 옵션 제어: admin만 부여 가능 + 자기 자신 삭제 방지
(() => {
  function applyAdminRestriction() {
    const myRole = (localStorage.getItem("userRole") || "").trim();
    const sel = document.getElementById("userRole");
    if (!sel) return;
    let opt = sel.querySelector('option[value="admin"]');
    if (!opt) {
      opt = document.createElement("option");
      opt.value = "admin";
      opt.textContent = "최고관리자";
      sel.prepend(opt);
    }
    if (myRole !== "admin") {
      opt.disabled = true;
      opt.textContent = "최고관리자 (최고관리자만 부여 가능)";
    } else {
      opt.disabled = false;
      opt.textContent = "최고관리자";
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAdminRestriction);
  } else {
    applyAdminRestriction();
  }
})();