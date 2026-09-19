(() => {
  "use strict";
  console.log("✅ ai-report.js 로드됨 (v260919)");

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";
  const AI_COLLECTION = "ai_engines";
  const AI_LOG_COLLECTION = "ai_analysis_logs";
  const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/";
  const PAGE_SIZE = 10;

  let userRole = "";
  let standards = [];
  let supplySettings = [];  // ✅ 배액율 계산용
  let aiList = [];
  let zoneList = [];
  let allRecords = [];
  let allList = [];
  let currentPage = 1;

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

  function canRunAnalysis() { return [ROLE_ADMIN, ROLE_MANAGER].includes(userRole); }
  function canDeleteReport() { return [ROLE_ADMIN, ROLE_MANAGER].includes(userRole); }

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

  // ✅ 상태 판정 (EC/pH + 배액율)
  function checkStatus(r) {
    const recLine = r.line || r.lineNo || "V01";
    const std = standards.filter(s => {
      const stdLine = s.lineNo || s.line || "V01";
      return s.standardDate <= r.measureDate && stdLine === recLine;
    }).sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0];

    if (!std) {
      return { level: "none", ecDev: "-", phDev: "-", supEc: "-", supPh: "-", statusText: "기준없음", statusColor: "#888", ratio: null, targetRate: null };
    }

    const rawEc = (std.targetEc !== undefined && std.targetEc !== null && std.targetEc !== "") ? std.targetEc : std.supplyEc;
    const rawPh = (std.targetPh !== undefined && std.targetPh !== null && std.targetPh !== "") ? std.targetPh : std.supplyPh;
    const supEc = parseFloat(rawEc) || 0;
    const supPh = parseFloat(rawPh) || 0;
    const drainEc = parseFloat(r.drainEc);
    const drainPh = parseFloat(r.drainPh);
    const compEc = supEc + 0.2;
    const ecDev = (drainEc - compEc).toFixed(2);
    const phDev = (drainPh - supPh).toFixed(2);
    const eD = parseFloat(ecDev);
    const pD = parseFloat(phDev);

    let ecLevel = "ok";
    if (eD >= 0.7 || eD <= -0.5) ecLevel = "danger";
    else if ((eD >= 0.4 && eD <= 0.6) || (eD <= -0.31 && eD >= -0.4)) ecLevel = "warn";

    let phLevel = "ok";
    if (pD >= 0.9 || pD <= -0.7 || drainPh >= 6.8 || drainPh <= 5.2) phLevel = "danger";
    else if ((pD >= 0.5 && pD <= 0.8) || (pD <= -0.41 && pD >= -0.6)) phLevel = "warn";

    let level = "ok";
    if (ecLevel === "danger" || phLevel === "danger") level = "danger";
    else if (ecLevel === "warn" || phLevel === "warn") level = "warn";

    // ✅ 배액율 = 배액량(mL→L) ÷ 24h 급액량(L·포대당) × 100
    let ratio = null;
    const targetRate = parseFloat(std.drainRate) || null;
    const drainMl = parseFloat(r.drainAmount);
    const ss = supplySettings.filter(s => {
      const ssLine = s.lineNo || s.line || "V01";
      return ssLine === recLine && s.settingDate <= r.measureDate;
    }).sort((a, b) => b.settingDate.localeCompare(a.settingDate))[0];
    if (ss && parseFloat(ss.dailySupplyL) > 0 && !isNaN(drainMl) && drainMl > 0) {
      ratio = Math.round(((drainMl / 1000) / parseFloat(ss.dailySupplyL) * 100) * 10) / 10;
    }

    return {
      level, ecDev, phDev,
      supEc: rawEc !== undefined && rawEc !== null && rawEc !== "" ? rawEc : "-",
      supPh: rawPh !== undefined && rawPh !== null && rawPh !== "" ? rawPh : "-",
      statusText: level === "danger" ? "🚨 경고" : level === "warn" ? "⚠️ 주의" : "✅ 정상",
      statusColor: level === "danger" ? "#c62828" : level === "warn" ? "#ef6c00" : "#2e7d32",
      ratio, targetRate
    };
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
    if (adminArea) adminArea.style.display = "block";

    if (canRunAnalysis()) {
      const aiSelectArea = document.getElementById("aiSelectArea");
      const noPermitArea = document.getElementById("noPermitArea");
      if (aiSelectArea) aiSelectArea.style.display = "block";
      if (noPermitArea) noPermitArea.style.display = "none";
    } else {
      const aiSelectArea = document.getElementById("aiSelectArea");
      const noPermitArea = document.getElementById("noPermitArea");
      if (aiSelectArea) aiSelectArea.style.display = "none";
      if (noPermitArea) noPermitArea.style.display = "block";
    }
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

  async function openResultModal(logId) {
    const idx = allList.findIndex(x => x.id === logId);
    if (idx === -1) return;
    const log = allList[idx];
    const dateStr = new Date(log.analyzedAt).toLocaleString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
    document.getElementById("modalTitle").textContent = log.aiName || "AI분석 결과";
    document.getElementById("modalMeta").textContent = `📅 분석일시: ${dateStr}  |  📊 분석기간: ${log.period || "-"}`;
    document.getElementById("modalBody").textContent = "🔄 내용 불러오는 중...";
    document.getElementById("resultModal").style.display = "flex";
    document.body.style.overflow = "hidden";

    try {
      const database = await ensureDb();
      const { doc, getDoc } = await getFs();
      const snap = await getDoc(doc(database, AI_LOG_COLLECTION, logId));
      if (snap.exists()) {
        const data = snap.data();
        document.getElementById("modalBody").textContent = data.resultText || "내용이 없습니다.";
      } else {
        document.getElementById("modalBody").textContent = "⚠️ 내용을 찾을 수 없습니다.";
      }
    } catch (e) {
      document.getElementById("modalBody").textContent = "❌ 불러오기 실패: " + e.message;
    }
  }

  function closeModal() {
    document.getElementById("resultModal").style.display = "none";
    document.body.style.overflow = "";
  }

  async function deleteLog(logId, e) {
    e.stopPropagation();
    if (!canDeleteReport()) {
      alert("삭제 권한이 없습니다.");
      return;
    }
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const database = await ensureDb();
      const { doc, deleteDoc } = await getFs();
      await deleteDoc(doc(database, AI_LOG_COLLECTION, logId));
      await loadSavedResults();
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  }

  function setPreset() {
    const now = new Date();
    const preset = document.getElementById("datePreset").value;
    let start = new Date(), end = new Date();
    if (preset === "weekday") {
      const day = now.getDay() || 7;
      start.setDate(now.getDate() - day + 1);
      end = new Date(start); end.setDate(start.getDate() + 4);
    } else if (preset === "week") {
      const day = now.getDay() || 7;
      start.setDate(now.getDate() - day + 1);
      end = new Date(start); end.setDate(start.getDate() + 6);
    } else if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === "month3") {
      start = new Date(now); start.setMonth(start.getMonth() - 3);
    } else return;
    document.getElementById("sDate").valueAsDate = start;
    document.getElementById("eDate").valueAsDate = end;
    loadSummaryInfo();
  }

  async function loadSummaryInfo() {
    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    if (!sDate || !eDate) return;
    const filtered = allRecords.filter(r => r.measureDate && r.measureDate >= sDate && r.measureDate <= eDate);
    document.getElementById("totalCount").textContent = filtered.length + "건";
    const lineSet = new Set(zoneList.map(z => z.liquidLine || z.line || "V01"));
    document.getElementById("lineInfo").textContent = lineSet.size + "개 라인";
    document.getElementById("stdInfo").textContent = standards[0]?.periodName || standards[0]?.name || standards[0]?.standardDate || "기준";
  }

  async function loadAIList() {
    const database = await ensureDb();
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, AI_COLLECTION));
      aiList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      aiList.sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0) || String(a.aiName || "").localeCompare(String(b.aiName || "")));
      renderAIList();
    } catch (e) {
      document.getElementById("aiCheckList").innerHTML = `<div style="color:red;">⚠️ AI목록 오류: ${e.message}</div>`;
    }
  }

  function renderAIList() {
    const box = document.getElementById("aiCheckList");
    if (!aiList.length) {
      box.innerHTML = `<div style="color:#888;">⚠️ 등록된 AI가 없습니다. AI설정에서 먼저 등록하세요.</div>`;
      return;
    }
    box.innerHTML = aiList.map(ai => `
      <label class="ai-check-item">
        <input type="checkbox" value="${ai.id}" 
           data-name="${ai.aiTitle || ai.aiName || 'AI'}"
           data-model="${ai.modelName || 'gemini-3.6-flash'}"
           data-endpoint="${ai.apiEndpoint || DEFAULT_ENDPOINT}"
           data-key="${ai.apiKey || ''}"
           data-prompt="${(ai.analysisPrompt || ai.analysisRole || '').replace(/"/g, '&quot;')}">
        ${ai.isMain ? "⭐" : ""} <strong>${ai.aiTitle || ai.aiName || "이름없음"}</strong>
        <span class="badge">${ai.modelName || "gemini-3.6-flash"}</span>
      </label>
    `).join("");
  }

  // ✅ 503/429(서버 혼잡) 자동 재시도 — 최대 2회, 점점 길게 대기
  async function fetchWithRetry(url, options, retries = 2, delayMs = 2500) {
    let res;
    for (let i = 0; i <= retries; i++) {
      res = await fetch(url, options);
      if (res.ok) return res;
      const throttle = (res.status === 503 || res.status === 429 || res.status === 500);
      if (throttle && i < retries) {
        console.warn(`⏳ 서버 혼잡(${res.status}) - ${delayMs * (i + 1) / 1000}초 후 ${i + 1}번째 재시도...`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      return res;
    }
    return res;
  }

  async function runAIAnalysis() {
    if (!canRunAnalysis()) return alert("분석 실행 권한이 없습니다.");
    const checks = document.querySelectorAll("#aiCheckList input:checked");
    if (!checks.length) return alert("분석할 AI를 하나 이상 선택하세요!");
    if (checks.length > 3) return alert("최대 3개까지 선택 가능합니다.");

    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    if (!sDate || !eDate) return alert("시작일과 종료일을 지정하세요!");

    const records = allRecords.filter(r => r.measureDate && r.measureDate >= sDate && r.measureDate <= eDate);

    let ok = 0, warn = 0, danger = 0;
    records.forEach(r => {
      const st = checkStatus(r);
      if (st.level === "danger") danger++;
      else if (st.level === "warn") warn++;
      else ok++;
    });

    // ✅ 배액율 통계 계산
    let ratioOk = 0, ratioWarn = 0, ratioDanger = 0, ratioNone = 0;
    records.forEach(r => {
      const st = checkStatus(r);
      if (st.ratio == null) { ratioNone++; return; }
      if (!st.targetRate) return;
      const ad = Math.abs(st.ratio - st.targetRate);
      if (ad <= 10) ratioOk++;
      else if (ad <= 20) ratioWarn++;
      else ratioDanger++;
    });

    const dataSummary = `
【강북구 스마트팜 딸기 배액관리】
▸ 분석기간: ${sDate} ~ ${eDate}
▸ 전체 ${records.length}건 / EC·pH 기준: 정상 ${ok}건 / 주의 ${warn}건 / 경고 ${danger}건
▸ 배액율 현황 (목표 대비): 정상(±10%p) ${ratioOk}건 / 주의(±20%p) ${ratioWarn}건 / 경고(초과) ${ratioDanger}건 / 미계산 ${ratioNone}건
▸ 판정기준: EC편차=실제EC-(기준EC+0.2) / pH편차=실제pH-기준pH, pH 6.8↑ 또는 5.2↓는 경고
▸ 배액율: 배액량÷24h급액량×100 (목표 배액율 대비 ±10%p 정상 / ±20%p 주의 / 초과 경고)
▸ 구역정보: ${zoneList.map(z => `- ${z.zoneName} / ${z.liquidLine || z.line || "V01"} / 샘플:${z.hasSampleData ? "예" : "아니오"}`).join("\n")}
▸ 측정기록 (최신순, 최대30건): ${records.sort((a, b) => b.measureDate.localeCompare(a.measureDate)).slice(0, 30).map(r => {
      const st = checkStatus(r);
      return `${r.measureDate} ${r.measureTime || ""} | ${r.zoneName} | EC:${r.drainEc || "-"}(${st.ecDev}) | pH:${r.drainPh || "-"}(${st.phDev}) | 배액:${r.drainAmount ? r.drainAmount + "mL" : "-"}${st.ratio != null ? `(배액율 ${st.ratio}%${st.targetRate ? "/목표" + st.targetRate + "%" : ""})` : ""} | ${st.statusText}`;
    }).join("\n")}
위 데이터를 분석하고 개선점과 권장사항을 제시해주세요. 특히 EC·pH 이상 징후와 배액율 문제를 구분하여 진단하고, 급액농도·관수횟수·환경요인 측면에서 구체적인 조치를 제안해주세요.`.trim();

    const area = document.getElementById("aiResultArea");
    area.innerHTML = "";

    for (const cb of checks) {
      const aiName = cb.dataset.name;
      const model = cb.dataset.model;
      const apiKey = cb.dataset.key?.trim();
      const role = cb.dataset.prompt || "종합분석";
      const prompt = `당신은 스마트팜 딸기 재배 및 배액(드레인) 관리 전문가입니다.
분석 역할: ${role}
아래 측정 데이터를 바탕으로 문제점 진단, 원인 분석, 구체적인 개선점과 권장사항을 제시해주세요.`;
      const cardId = "card-" + cb.value;

      area.innerHTML += `
        <div class="result-card" id="${cardId}">
          <h4>🤖 ${aiName} <span style="color:#999;">분석중...</span></h4>
          <div class="result-body">🔄 요청중...</div>
        </div>`;

      if (!apiKey) {
        document.getElementById(cardId).querySelector(".result-body").textContent = "❌ API키가 없습니다. AI설정에서 API키를 등록해주세요.";
        continue;
      }

      try {
        const endpoint = (cb.dataset.endpoint || DEFAULT_ENDPOINT).trim();
        const fullPrompt = `${prompt}\n\n${dataSummary}`;
        let text = "";

        // 1️⃣ Gemini 전용 주소만 Gemini 방식
        if (endpoint.includes("generativelanguage.googleapis.com")) {
          let url = endpoint.endsWith("/") ? endpoint : endpoint + "/";
          url += `${model}:generateContent?key=${apiKey}`;
          const res = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}${errText ? " - " + errText : ""}`);
          }
          const json = await res.json();
          text = json?.candidates?.[0]?.content?.parts?.[0]?.text
               || json?.error?.message
               || "응답을 받아오지 못했습니다.";
        }
        // 2️⃣ 그 외 모든 AI(OpenAI, Qwen, 기타) = OpenAI 호환 방식
        else {
          let url = endpoint.endsWith("/") ? endpoint : endpoint + "/";
          url += "chat/completions";
          const res = await fetchWithRetry(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: fullPrompt }]
            })
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}${errText ? " - " + errText : ""}`);
          }
          const json = await res.json();
          text = json?.choices?.[0]?.message?.content
               || json?.error?.message
               || "응답을 받아오지 못했습니다.";
        }

        document.querySelector(`#${cardId} h4 span`).textContent = "✅ 완료";
        document.querySelector(`#${cardId} h4 span`).style.color = "#2e7d32";
        document.querySelector(`#${cardId} .result-body`).textContent = text;

        const database = await ensureDb();
        const { collection, addDoc } = await getFs();
        await addDoc(collection(database, AI_LOG_COLLECTION), {
          aiName, model, period: `${sDate} ~ ${eDate}`,
          analyzedAt: new Date().toISOString(),
          resultText: text
        });

      } catch (e) {
        const isCors = (e instanceof TypeError);
        const isBusy = /503|429|500/.test(e.message);
        const msg = isCors
          ? "CORS/네트워크 오류! API 서버가 브라우저 직접 호출을 거부했습니다."
          : isBusy
            ? "서버 혼잡(503/429)! 자동 재시도에도 실패했어요. 잠시 후 다시 누르거나, AI설정에서 모델을 gemini-2.5-flash로 바꿔보세요."
            : e.message;
        document.querySelector(`#${cardId} .result-body`).textContent = "❌ 오류: " + msg;
        document.querySelector(`#${cardId} h4 span`).textContent = "실패";
        document.querySelector(`#${cardId} h4 span`).style.color = "#c62828";
        console.error(`[AI분석 오류] ${aiName}:`, e);
      }
    }

    await loadSavedResults();
  }

  async function loadSavedResults() {
    const database = await ensureDb();
    const { collection, getDocs, query, orderBy } = await getFs();
    try {
      const snap = await getDocs(query(
        collection(database, AI_LOG_COLLECTION),
        orderBy("analyzedAt", "desc")
      ));
      allList = snap.docs.map(d => ({
        id: d.id,
        aiName: d.data().aiName || "AI",
        period: d.data().period || "-",
        analyzedAt: d.data().analyzedAt
      }));
      currentPage = 1;
      renderPage();
    } catch (e) {
      document.getElementById("pastResultArea").innerHTML =
        `<div style="color:red; padding:12px;">⚠️ 불러오기 오류: ${e.message}</div>`;
    }
  }

  function renderPage() {
    const area = document.getElementById("pastResultArea");
    const totalPages = Math.ceil(allList.length / PAGE_SIZE) || 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = allList.slice(start, end);

    if (!allList.length) {
      area.innerHTML = `<div style="color:#888; padding:12px; text-align:center; font-size:11px;">저장된 분석결과가 없습니다.</div>`;
      return;
    }

    const delDisabled = !canDeleteReport() ? "disabled" : "";
    const delTitle = !canDeleteReport() ? "삭제 권한이 없습니다" : "";

    area.innerHTML = `
      <table class="past-table">
        <thead>
          <tr>
            <th style="width:18%;">분석일시</th>
            <th style="width:24%;">AI이름</th>
            <th>분석기간</th>
            <th style="width:6%;"></th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map(log => {
            const dateStr = new Date(log.analyzedAt).toLocaleString("ko-KR", {
              year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit"
            });
            return `
              <tr>
                <td class="past-date" onclick="openResultModal('${log.id}')">${dateStr}</td>
                <td class="past-name" onclick="openResultModal('${log.id}')">${log.aiName}</td>
                <td onclick="openResultModal('${log.id}')">${log.period}</td>
                <td style="text-align:center;">
                  <button class="del-btn" onclick="deleteLog('${log.id}', event)" ${delDisabled} title="${delTitle}">삭제</button>
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="paging-area">
        ${Array.from({ length: totalPages }, (_, i) => {
          const p = i + 1;
          return `<button class="paging-btn ${p === currentPage ? 'on' : ''}" onclick="goPage(${p})">${p}</button>`;
        }).join("")}
      </div>
    `;
  }

  function goPage(page) {
    currentPage = page;
    renderPage();
    document.getElementById("pastResultArea").scrollIntoView({ behavior: "smooth" });
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

      // ✅ 분석 실행 버튼 자동 연결
      document.querySelectorAll("#aiSelectArea button").forEach(btn => {
        if (btn.dataset.aiBound) return;
        btn.dataset.aiBound = "1";
        if (/분석 실행|분석실행|선택한 AI/.test(btn.textContent)) {
          btn.addEventListener("click", runAIAnalysis);
        }
      });

      // ✅ 모달 닫기 버튼 자동 연결
      const closeBtn = document.querySelector(".modal-close");
      if (closeBtn && !closeBtn.dataset.aiBound) {
        closeBtn.dataset.aiBound = "1";
        if (!closeBtn.hasAttribute("onclick")) {
          closeBtn.addEventListener("click", closeModal);
        }
      }
    });

    const preset = document.getElementById("datePreset");
    if (preset && !preset.hasAttribute("onchange")) {
      preset.addEventListener("change", setPreset);
    }

    const sDate = document.getElementById("sDate");
    const eDate = document.getElementById("eDate");
    if (sDate) sDate.addEventListener("change", loadSummaryInfo);
    if (eDate) eDate.addEventListener("change", loadSummaryInfo);
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;
    bindEvents();
    await loadFarmInfo();
    loadWeather();

    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);

    const eDateEl = document.getElementById("eDate");
    const sDateEl = document.getElementById("sDate");
    if (eDateEl) eDateEl.valueAsDate = today;
    if (sDateEl) sDateEl.valueAsDate = weekAgo;

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    try {
      // ✅ supply_settings도 함께 로드
      const [stdSnap, zoneSnap, recSnap, ssSnap] = await Promise.all([
        getDocs(collection(database, "supply_standards")),
        getDocs(collection(database, "zones")),
        getDocs(collection(database, "drain_records")),
        getDocs(collection(database, "supply_settings")).catch(() => null)
      ]);
      standards = stdSnap.docs.map(d => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      zoneList = zoneSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      allRecords = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.log("기준데이터 불러오기 오류:", e);
    }

    await loadAIList();
    await loadSummaryInfo();
    await loadSavedResults();
  }

  window.openResultModal = openResultModal;
  window.closeModal = closeModal;
  window.deleteLog = deleteLog;
  window.setPreset = setPreset;
  window.runAIAnalysis = runAIAnalysis;
  window.goPage = goPage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();