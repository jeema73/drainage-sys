(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/";
  let aiList = [];
  let testStatus = {};

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

  async function loadAIList() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, "ai_engines"));
      aiList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderList();
    } catch (e) {
      console.error("AI 목록 불러오기 실패:", e);
    }
  }

  function renderList() {
    const tb = document.getElementById("aiListBody");
    if (!tb) return;
    if (!aiList.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-box">등록된 AI가 없습니다.</td></tr>`;
      return;
    }

    tb.innerHTML = aiList.map((ai) => {
      const st = testStatus[ai.id] || { text: "미확인", class: "status-none" };
      const maskedKey = ai.apiKey
        ? ai.apiKey.length > 8
          ? ai.apiKey.slice(0, 4) + "••••" + ai.apiKey.slice(-4)
          : "••••••••"
        : "-";

      return `
        <tr>
          <td><strong>${ai.aiName || "-"}</strong></td>
          <td>${ai.modelName || "gemini-3.6-flash"}</td>
          <td style="font-size:10px; color:#666; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ai.apiEndpoint || DEFAULT_ENDPOINT}</td>
          <td>${ai.isMain ? "⭐ 종합" : "-"}</td>
          <td><span class="status-badge ${st.class}">${st.text}</span></td>
          <td style="font-family:monospace; font-size:10px;">${maskedKey}</td>
          <td class="action-btns">
            <button class="btn-sm btn-secondary" onclick="testConnection('${ai.id}')">연결테스트</button>
            <button class="btn-sm btn-primary" onclick="editAI('${ai.id}')">수정</button>
            <button class="btn-sm btn-danger" onclick="deleteAI('${ai.id}')">삭제</button>
          </td>
        </tr>
      `;
    }).join("");
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
      const existsMain = aiList.some((ai) => ai.isMain && ai.id !== editId);
      if (existsMain) {
        alert("종합 AI는 하나만 지정할 수 있습니다.\n기존 종합AI의 지정을 먼저 해제해주세요.");
        return;
      }
    }

    const data = {
      aiName,
      modelName,
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
    const ai = aiList.find((x) => x.id === id);
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
    document.getElementById("aiName").value = "";
    document.getElementById("modelName").value = "gemini-3.6-flash";
    document.getElementById("modelNameCustom").value = "";
    document.getElementById("modelNameCustom").style.display = "none";
    document.getElementById("apiEndpoint").value = DEFAULT_ENDPOINT;
    document.getElementById("analysisRole").value = "종합분석";
    document.getElementById("apiKey").value = "";
    document.getElementById("etcInfo").value = "";
    document.getElementById("isMain").checked = false;
    const ft = document.getElementById("formTitle");
    if (ft) ft.innerHTML = `➕ AI 등록 <span class="note">※ 기본모델: gemini-3.6-flash</span>`;
  }

  async function testConnection(aiId) {
    const ai = aiList.find((x) => x.id === aiId);
    if (!ai) return;

    testStatus[aiId] = { text: "⏳ 확인중", class: "status-testing" };
    renderList();

    const isGroq = (ai.modelName || "").includes("llama");
    const isOpenAI = (ai.modelName || "").includes("gpt");

    try {
      if (isGroq || isOpenAI) {
        const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ai.apiKey}`
          },
          body: JSON.stringify({
            model: ai.modelName,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5
          })
        });
        if (res.ok) {
          testStatus[aiId] = { text: "✅ 성공", class: "status-ok" };
          alert("✅ 연결 성공!");
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `오류 ${res.status}`);
        }
      } else {
        const ep = (ai.apiEndpoint || DEFAULT_ENDPOINT).replace(/\/$/, "");
        const url = `${ep}/${ai.modelName || "gemini-3.6-flash"}:generateContent?key=${ai.apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping" }] }]
          })
        });
        if (res.ok) {
          testStatus[aiId] = { text: "✅ 성공", class: "status-ok" };
          alert("✅ 연결 성공!");
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || err.message || `오류 ${res.status}`);
        }
      }
    } catch (e) {
      testStatus[aiId] = { text: "❌ 실패", class: "status-fail" };
      alert(`연결 실패: ${e.message}\n\n💡 호출주소, API키, 모델명을 확인하세요.`);
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
    const modelSel = document.getElementById("modelName");
    if (modelSel) {
      modelSel.addEventListener("change", toggleCustomModel);
    }
  }

  async function init() {
    const auth = window.checkAuth ? window.checkAuth(["admin"]) : null;
    if (!auth) return;

    bindEvents();
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