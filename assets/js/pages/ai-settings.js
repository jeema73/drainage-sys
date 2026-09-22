(() => {
  "use strict";
  console.log("✅ ai-settings.js 로드됨 (v260918)");

  let db = null;
  let fsMod = null;
  const CURRENT_SETTING_ID = "current";
  const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/";
  let userRole = "";
  let aiList = [];
  let testStatus = {};
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

    const adminArea = document.getElementById("adminArea");
    const noPermitArea = document.getElementById("noPermitArea");

    if (userRole !== ROLE_ADMIN) {
      if (adminArea) adminArea.style.display = "none";
      if (noPermitArea) noPermitArea.style.display = "block";
      return null;
    }

    if (adminArea) adminArea.style.display = "block";
    if (noPermitArea) noPermitArea.style.display = "none";
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

  function toggleCustomModel() {
    const sel = document.getElementById("modelName");
    const custom = document.getElementById("modelNameCustom");
    if (!sel || !custom) return;
    custom.style.display = sel.value === "" ? "block" : "none";
  }

  function getSelectedModel() {
    let model = document.getElementById("modelName").value;
    if (model === "") model = document.getElementById("modelNameCustom").value.trim();
    return model || "gemini-3.6-flash";
  }

  async function saveAI() {
    const aiName = document.getElementById("aiName").value.trim();
    const apiKey = document.getElementById("apiKey").value.trim();
    const modelName = getSelectedModel();
    let endpoint = document.getElementById("apiEndpoint").value.trim();
    if (!endpoint) endpoint = DEFAULT_ENDPOINT;

    if (!aiName || !apiKey) return alert("AI 이름과 API 키는 필수입니다!");

    const isMain = document.getElementById("isMain").checked;
    const editId = document.getElementById("editId").value;

    if (isMain) {
      const existsMain = aiList.some(ai => ai.isMain && ai.id !== editId);
      if (existsMain) {
        alert("종합 AI는 하나만 지정할 수 있습니다.\n기존 종합AI의 지정을 먼저 해제해주세요.");
        return;
      }
    }

    const data = {
      aiName, modelName,
      apiEndpoint: endpoint,
      analysisRole: document.getElementById("analysisRole").value,
      apiKey,
      etcInfo: document.getElementById("etcInfo").value.trim(),
      isMain,
      updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
      if (editId) {
        await setDoc(doc(database, "ai_engines", editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "ai_engines"), data);
        alert("✅ 등록되었습니다!");
      }
      resetForm();
      delete testStatus[editId];
      await loadAIList();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  function editAI(id) {
    const ai = aiList.find(x => x.id === id);
    if (!ai) return;

    document.getElementById("editId").value = id;
    document.getElementById("aiName").value = ai.aiName || "";
    document.getElementById("apiEndpoint").value = ai.apiEndpoint || DEFAULT_ENDPOINT;
    document.getElementById("apiKey").value = ai.apiKey || "";
    document.getElementById("etcInfo").value = ai.etcInfo || "";
    document.getElementById("isMain").checked = ai.isMain || false;
    document.getElementById("analysisRole").value = ai.analysisRole || "종합분석";

    const sel = document.getElementById("modelName");
    let found = false;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === ai.modelName) {
        sel.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      sel.value = "";
      document.getElementById("modelNameCustom").value = ai.modelName || "";
      document.getElementById("modelNameCustom").style.display = "block";
    } else {
      document.getElementById("modelNameCustom").style.display = "none";
    }

    const ft = document.getElementById("formTitle");
    if (ft) ft.innerHTML = `✏️ AI 수정 <span class="note">※ 기본모델: gemini-3.6-flash</span>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    const ft = document.getElementById("formTitle");
    if (ft) ft.innerHTML = `➕ AI 등록 <span class="note">※ 기본모델: gemini-3.6-flash</span>`;
    document.getElementById("aiName").value = "";
    document.getElementById("modelName").value = "gemini-3.6-flash";
    document.getElementById("modelNameCustom").value = "";
    document.getElementById("modelNameCustom").style.display = "none";
    document.getElementById("apiEndpoint").value = DEFAULT_ENDPOINT;
    document.getElementById("apiKey").value = "";
    document.getElementById("analysisRole").value = "종합분석";
    document.getElementById("etcInfo").value = "";
    document.getElementById("isMain").checked = false;
  }

  async function loadAIList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, "ai_engines"));
      aiList = snap.docs.map(d => ({
        id: d.id, isMain: false, apiEndpoint: DEFAULT_ENDPOINT,
        ...d.data()
      }));
      aiList.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return String(a.aiName || "").localeCompare(String(b.aiName || ""));
      });
      renderList();
    } catch (e) {
      console.error("목록 불러오기 오류:", e);
      const tb = document.getElementById("aiListBody");
      if (tb) tb.innerHTML = `<tr><td colspan="7" style="color:red;">불러오기 오류: ${e.message}</td></tr>`;
    }
  }

  function renderList() {
    const tb = document.getElementById("aiListBody");
    if (!tb) return;

    if (!aiList.length) {
      tb.innerHTML = `<tr><td colspan="7" style="color:#888;">등록된 AI가 없습니다.</td></tr>`;
      return;
    }

    tb.innerHTML = aiList.map(ai => {
      const status = testStatus[ai.id] || { text: "미확인", class: "" };
      const ep = (ai.apiEndpoint || DEFAULT_ENDPOINT).replace("https://", "").replace("http://", "");
      const shortEp = ep.length > 7 ? "." + ep.slice(-6) : ep;
      return `
        <tr class="${ai.isMain ? 'main-ai' : ''}">
          <td>${ai.aiName || "-"}</td>
          <td>${(ai.modelName || "").substring(0, 4)}•${(ai.modelName || "").slice(-1)}</td>
          <td title="${ai.apiEndpoint || DEFAULT_ENDPOINT}">${shortEp}</td>
          <td>${ai.isMain ? "✅" : "-"}</td>
          <td id="stat-${ai.id}" class="${status.class}">
            ${status.text}
            ${!status.text.includes("확인중") ? `<button class="btn-sm test-btn" data-action="test" data-id="${ai.id}">연결</button>` : ""}
          </td>
          <td class="hidden-key">${(ai.apiKey || "").substring(0, 1)}•${(ai.apiKey || "").slice(-1)}</td>
          <td>
            <button class="btn-sm btn-primary" data-action="edit" data-id="${ai.id}">수정</button>
            <button class="btn-sm btn-del-ai" data-action="delete" data-id="${ai.id}">삭제</button>
          </td>
        </tr>
      `;
    }).join("");
  }

// ✅ 연결 테스트 함수 (Groq 및 범용 API 지원)
  async function testConnection(aiId) {
    const ai = aiList.find(x => x.id === aiId);
    if (!ai) return alert("AI 정보를 찾을 수 없습니다.");

    testStatus[aiId] = { text: "🔄 확인중...", class: "status-loading" };
    renderList();

    try {
      const apiKey = ai.apiKey || "";
      const model = ai.modelName || "gemini-3.6-flash";
      const endpoint = (ai.apiEndpoint || DEFAULT_ENDPOINT).trim();

      // 1. Google Gemini 전용 처리
      if (endpoint.includes("generativelanguage.googleapis.com")) {
        let url = endpoint;
        if (!url.endsWith("/")) url += "/";
        url += `${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "안녕" }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        });

        if (res.ok) {
          testStatus[aiId] = { text: "✅ 연결성공", class: "status-ok" };
        } else {
          const err = await res.json();
          throw new Error(err.error?.message || `오류 ${res.status}`);
        }
      } 
      // 2. Groq, OpenAI, Alibaba 등 OpenAI Compatible 규격 처리
      else {
        let targetUrl = endpoint.replace(/\/+$/, ""); // 맨 뒤 슬래시 제거
        if (!targetUrl.endsWith("/chat/completions")) {
          targetUrl += "/chat/completions";
        }

        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${apiKey}` 
          },
          body: JSON.stringify({ 
            model: model, 
            messages: [{ role: "user", content: "hi" }], 
            max_tokens: 5 
          })
        });

        if (res.ok) {
          testStatus[aiId] = { text: "✅ 연결성공", class: "status-ok" };
        } else {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err.error?.message || err.message || `오류 ${res.status}`);
        }
      }
    } catch (e) {
      testStatus[aiId] = { text: "❌ 실패", class: "status-fail" };
      if (e instanceof TypeError) {
        alert("연결 실패: CORS/네트워크 오류\n브라우저에서 직접호출이 거부되었습니다.\n(Groq 등 일부 서비스는 보안을 위해 웹직접 호출을 차단합니다)");
      } else {
        alert(`연결 실패: ${e.message}\n\n💡 호출주소, API키, 모델명을 확인하세요.`);
      }
      console.error("[연결테스트 오류]", e);
    }
    renderList();
  }

  async function deleteAI(id) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, "ai_engines", id));
      delete testStatus[id];
      alert("✅ 삭제되었습니다!");
      await loadAIList();
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

      // ✅ 목록 내부 버튼 (data-action 위임)
      const targetBtn = e.target.closest("button[data-action]");
      if (targetBtn) {
        const action = targetBtn.dataset.action;
        const id = targetBtn.dataset.id;
        if (action === "test") testConnection(id);
        else if (action === "edit") editAI(id);
        else if (action === "delete") deleteAI(id);
      }

      // ✅ 저장/초기화 버튼 자동 연결 (인라인 onclick 없을 때만)
      document.querySelectorAll(".ai-form-btn-row button").forEach(btn => {
        if (btn.dataset.aiBound) return;
        btn.dataset.aiBound = "1";
        if (/저장/.test(btn.textContent)) btn.addEventListener("click", saveAI);
        else if (/초기화/.test(btn.textContent)) btn.addEventListener("click", resetForm);
      });
    });

    const modelSel = document.getElementById("modelName");
    if (modelSel && !modelSel.hasAttribute("onchange")) {
      modelSel.addEventListener("change", toggleCustomModel);
    }
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;
    bindEvents();
    await loadFarmInfo();
    loadWeather();
    await loadAIList();
  }

  window.toggleCustomModel = toggleCustomModel;
  window.saveAI = saveAI;
  window.editAI = editAI;
  window.resetForm = resetForm;
  window.testConnection = testConnection;
  window.deleteAI = deleteAI;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();