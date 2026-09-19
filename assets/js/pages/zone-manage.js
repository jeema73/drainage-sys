(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";
  let allZones = [];
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

  async function loadZones() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const snap = await getDocs(collection(database, "zones"));
    allZones = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ✅ 정렬: 육묘는 맨 뒤, 숫자순 정렬
    allZones.sort((a, b) => {
      const nameA = a.zoneName || "";
      const nameB = b.zoneName || "";

      const isSeedlingA = nameA.includes("육묘") ? 1 : 0;
      const isSeedlingB = nameB.includes("육묘") ? 1 : 0;
      if (isSeedlingA !== isSeedlingB) return isSeedlingA - isSeedlingB;

      const numA = nameA.match(/(\d+)/) ? parseInt(nameA.match(/(\d+)/)[1], 10) : 999;
      const numB = nameB.match(/(\d+)/) ? parseInt(nameB.match(/(\d+)/)[1], 10) : 999;
      if (numA !== numB) return numA - numB;

      return nameA.localeCompare(nameB);
    });

    const tb = document.getElementById("listBody");
    if (!tb) return;

    if (!allZones.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-box">등록된 구역이 없습니다.</td></tr>`;
      return;
    }

    tb.innerHTML = allZones.map(z => `
      <tr>
        <td><strong>${z.zoneName}</strong></td>
        <td>${z.line || "V01"}</td>
        <td>${z.hasSampleData ? "✅ 사용" : "❌ 사용안함"}</td>
        <td>${z.remark || "-"}</td>
        <td>
          <button class="btn-secondary btn-sm" onclick="editZone('${z.id}')">수정</button>
          <button class="btn-danger btn-sm" onclick="deleteZone('${z.id}')">삭제</button>
        </td>
      </tr>
    `).join("");
  }

  async function saveZone() {
    const zoneName = document.getElementById("zoneName").value.trim();
    if (!zoneName) return alert("구역명을 입력하세요.");

    const data = {
      zoneName: zoneName,
      line: document.getElementById("line").value,
      hasSampleData: document.getElementById("hasSampleData").checked,
      remark: document.getElementById("remark").value.trim(),
      createdAt: new Date().toISOString()
    };
    const editId = document.getElementById("editId").value;

    // ✅ 중복 이름 체크
    const dup = allZones.find(z => z.zoneName === zoneName && z.id !== editId);
    if (dup) return alert("같은 구역명이 이미 존재합니다.");

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
      if (editId) {
        delete data.createdAt;
        await setDoc(doc(database, "zones", editId), data, { merge: true });
        alert("✅ 수정되었습니다.");
      } else {
        await addDoc(collection(database, "zones"), data);
        alert("✅ 등록되었습니다.");
      }
      resetForm();
      await loadZones();
    } catch (e) {
      alert("❌ 오류: " + e.message);
    }
  }

  function editZone(id) {
    const z = allZones.find(x => x.id === id);
    if (!z) return;
    document.getElementById("editId").value = id;
    document.getElementById("zoneName").value = z.zoneName;
    document.getElementById("line").value = z.line || "V01";
    document.getElementById("hasSampleData").checked = z.hasSampleData === true;
    document.getElementById("remark").value = z.remark || "";
    document.getElementById("formTitle").textContent = "✏️ 구역 수정";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteZone(id) {
    if (!confirm("정말 삭제하시겠습니까?\n(관련 배액기록에는 영향을 주지 않습니다)")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    await deleteDoc(doc(database, "zones", id));
    alert("✅ 삭제되었습니다.");
    await loadZones();
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    document.getElementById("zoneName").value = "";
    document.getElementById("line").value = "V01";
    document.getElementById("hasSampleData").checked = false;
    document.getElementById("remark").value = "";
    document.getElementById("formTitle").textContent = "➕ 구역 등록";
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
    await loadZones();
  }

  // HTML onclick에서 호출 가능하도록 전역 노출
  window.saveZone = saveZone;
  window.editZone = editZone;
  window.deleteZone = deleteZone;
  window.resetForm = resetForm;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();