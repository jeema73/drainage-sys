(() => {
  "use strict";
  console.log("✅ ai-report.js 로드됨 (v261002)");

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";
  const AI_COLLECTION = "ai_engines";
  const AI_LOG_COLLECTION = "ai_analysis_logs";
  const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/";
  const PAGE_SIZE = 10;

  let userRole = "";
  let standards = [];
  let supplySettings = [];
  let aiList = [];
  let zoneList = [];
  let allRecords = [];
  let allList = [];
  let currentPage = 1;
  let gFarmData = null;
  const followCtx = {};
  let isRunning = false;

  const ROLE_ADMIN = "admin";
  const ROLE_MANAGER = "manager";

  // ✅ 로컬 날짜 → "YYYY-MM-DD" 문자열 (UTC 함정 회피)
  function toLocalYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // =====================================================
  // 🍓 마크다운 렌더러 (테이블, 서식 등 HTML 변환)
  // =====================================================
  function renderMarkdown(mdText) {
    if (!mdText) return "";
    if (typeof marked !== "undefined" && typeof marked.parse === "function") {
      try {
        return marked.parse(mdText, { breaks: true, gfm: true });
      } catch (e) {
        console.warn("marked 파싱 오류:", e);
      }
    }
    return mdText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  // =====================================================
  // 🍓 딸기 장인(Master Craftsman) 역할별 프롬프트
  // =====================================================
  const ROLE_LABEL = { general: "종합진단", drain: "관수·배액", anomaly: "이상탐지", growth: "생육단계" };

  const ROLE_PROMPTS = {
    general: `당신은 대한민국 최고 권위의 30년 경력 고설베드 코코피트 딸기 수경재배 마스터 장인이자 친절한 스마트팜 멘토입니다.
초보 농부도 단번에 이해할 수 있도록 명쾌하고 쉬운 농가 비유와 함께, 오늘 당장 양액기 제어판에서 무엇을 눌러야 할지 구체적인 수치(Action Plan)로 지도합니다.

[출력 양식 규칙]
반드시 다음 4단계 구조로 작성하고, 구역별 진단과 조치 처방은 마크다운 테이블(표) 형식을 적극 활용하여 가독성을 극대화하세요.
1. 🚦 【오늘의 하우스 건강 신호등 & 3줄 요약】
   - 종합 상태 (🟢 양호 / 🟡 주의 / 🔴 경고)
   - 핵심 요약 3문장 (현재 작물 수분·비료 흡수 상태를 쉬운 비유로 설명)
2. 🛠️ 【장인의 오늘 당장 할 일 (양액기 제어 처방)】
   - 양액기 공급 EC 변경 수치 (예: [1.3] ➔ [1.2]로 0.1 인하 등 구체적 지시)
   - 1회 급액 시간 및 1일 공급횟수(회) 변경 권장안
   - 배액 플러싱(세척) 또는 공급량 조절 필요 여부
3. 📍 【구역(라인)별 비교 진단 및 조치표】 (마크다운 표 형식 필수)
   | 구역명 | 양액라인 | 배액EC 편차 | 배액율(%) | 진단 상태 | 장인의 긴급 조치사항 |
4. 💡 【장인의 날씨 맞춤 꿀팁 & 대비책】
   - 현재/예보 날씨(맑음·흐림·기온)에 따른 오늘 오후 및 내일 선제적 관리 포인트`,

    drain: `당신은 고설베드 코코피트 딸기 관수(급액·배액) 분야의 최고 기술 장인입니다.
배액율(목표 대비 15~25% 적정)과 수분 밸런스에 집중하여 농가에 가장 정확한 관수 스케줄을 처방합니다.

[출력 양식 규칙]
1. 💧 【수분 밸런스 총평 (과관수 vs 과소관수 판정)】
2. 🛠️ 【구역별 관수 스케줄 맞춤 처방표】 (마크다운 표 형식 필수)
   | 구역 | 현재 배액율 | 목표 대비 상태 | 1일 권장 급액횟수 | 1회 공급시간 | 조치 이유 |
3. 🚨 【드리퍼 막힘/공급 불균일 의심 라인 지목】
4. ☀️ 【날씨(맑은날/흐린날)별 급액 시작/종료 타이밍 팁】`,

    anomaly: `당신은 딸기 스마트팜 이상징후 응급 진단 전문 마스터입니다.
정상 범위 이탈(EC 급증, 배액 급감, pH 급변), 구역 간 편차, 센서/드리퍼 고장 징후를 매의 눈으로 찾아냅니다.

[출력 양식 규칙]
1. 🚨 【긴급 위험 구역 및 이상 징후 요약】 (이상 없으면 '이상 없음' 판정)
2. 📋 【이상 의심 데이터 정밀 분석표】 (마크다운 표 형식 필수)
   | 발생일시 | 구역/라인 | 측정 항목 및 수치 | 추정 원인 (염류집적/관수막힘/센서오류) | 긴급 조치 |
3. 🩺 【뿌리 부패 및 팁번 예방 응급 처방전】`,

    growth: `당신은 딸기 생육단계별 영양 및 화방 관리 전문 마스터입니다.
정식 후 일수, 생육 단계, 품종 특성에 맞추어 양액 처방의 적합성을 코칭합니다.

[출력 양식 규칙]
1. 🌱 【현재 생육 단계 및 초세 영양 총평】
2. ⚖️ 【생육 단계별 양액 기준 적정도 평가표】 (마크다운 표 형식 필수)
   | 생육단계 | 현재 목표EC | 배액EC 반응 | 목표 배액율 | 권장 보정치 |
3. 🍓 【다음 단계 전환 시 장인의 양액 관리 조언】`
  };

  function detectRole(ai) {
    const t = `${ai.aiName || ""} ${ai.aiTitle || ""} ${ai.analysisPrompt || ""} ${ai.analysisRole || ""}`;
    if (/종합/.test(t)) return "general";
    if (/배액|관수|급액/.test(t)) return "drain";
    if (/이상|탐지|경고|변동/.test(t)) return "anomaly";
    if (/생육|단계|활착|수확|비대/.test(t)) return "growth";
    return ai.isMain ? "general" : "general";
  }

  function buildDataSummary(roleKey, records, sDate, eDate, st) {
    const wDesc = document.getElementById("weatherDesc")?.textContent || "맑음";
    const wTemp = document.getElementById("weatherTemp")?.textContent || "-";
    let plantingDays = "";
    if (gFarmData && gFarmData.plantingDate) {
      const pD = new Date(gFarmData.plantingDate);
      if (!isNaN(pD.getTime())) {
        const diff = Math.floor((new Date() - pD) / (1000 * 60 * 60 * 24));
        plantingDays = diff >= 0 ? `(정식 후 ${diff}일차)` : "";
      }
    }

    const head = `
【🍓 강북구 스마트팜 딸기 하우스 현장 물리적 조건 및 분석 데이터】
▸ 재배환경: 고설베드(High-bench) + 코코피트 배지 (수분보유력·완충능 우수)
▸ 관수설비: 배지(슬라브) 1개당 시간당 2L 드리퍼 5개 꽂힘 = 슬라브당 10L/h 유량
▸ 1회 급액량: 3분 가동 시 약 500mL/슬라브 공급됨
▸ 1일 총급액량 계산: 500mL × 공급횟수(회)
▸ 적정 배액율 기준: 15% ~ 25% (맑은날 20~25%, 흐린날 10~15%)
▸ EC 판정 기준: 배액EC vs (기준EC + 0.2), 편차 +0.4 이상=염류집적(농축), -0.3 이하=흡수왕성/비료부족
▸ pH 판정 기준: 5.5~6.5 적정 (5.3 이하 산성화 칼슘흡수저해, 6.8 이상 알칼리화 철분결핍)
▸ 농장정보: ${gFarmData ? `작물:${gFarmData.cropType || "딸기"} / 품종:${gFarmData.variety || "금실"} / 정식일:${formatDateYmd(gFarmData.plantingDate)} ${plantingDays} / 시즌:${gFarmData.season || "-"}` : "딸기 코코피트 수경재배"}
▸ 현재날씨: ${wDesc} (기온: ${wTemp})
▸ 분석기간: ${sDate} ~ ${eDate} (총 ${records.length}건 기록)
▸ 종합판정 통계: EC·pH 정상 ${st.ok}건 / 주의 ${st.warn}건 / 경고 ${st.danger}건
▸ 배액율 통계: 적정 ${st.ratioOk}건 / 주의 ${st.ratioWarn}건 / 경고 ${st.ratioDanger}건 / 미계산 ${st.ratioNone}건`;

    if (roleKey === "drain") {
      const byLine = {};
      records.forEach(r => {
        const s2 = checkStatus(r);
        if (s2.ratio == null) return;
        const ln = r.line || "V01";
        if (!byLine[ln]) byLine[ln] = { sum: 0, cnt: 0, target: s2.targetRate };
        byLine[ln].sum += s2.ratio; byLine[ln].cnt++;
      });
      const lineRows = Object.keys(byLine).sort().map(ln =>
        `- ${ln}: 평균 ${(byLine[ln].sum / byLine[ln].cnt).toFixed(1)}% (목표 ${byLine[ln].target || "-"}%, ${byLine[ln].cnt}건)`).join("\n");
      const recRows = records.filter(r => checkStatus(r).ratio != null)
        .sort((a, b) => b.measureDate.localeCompare(a.measureDate)).slice(0, 30)
        .map(r => {
          const s2 = checkStatus(r);
          return `${r.measureDate} ${r.zoneName}(${r.line || "V01"}) 배액:${r.drainAmount}mL 공급:${s2.supplyCount || "-"}회 배액율:${s2.ratio}%/목표${s2.targetRate || "-"}%`;
        }).join("\n");
      return `${head}
▸ 라인별 배액율 평균:
${lineRows || "- 없음"}
▸ 배액 측정기록 (최신순 최대30):
${recRows || "- 없음"}
위 배액율 데이터와 하우스 관수 물리 스펙으로 관수 적정성을 진단하세요.`.trim();
    }

    if (roleKey === "anomaly") {
      const bad = records.filter(r => ["warn", "danger"].includes(checkStatus(r).level))
        .sort((a, b) => b.measureDate.localeCompare(a.measureDate)).slice(0, 30)
        .map(r => {
          const s2 = checkStatus(r);
          return `${r.measureDate} ${r.measureTime || ""} ${r.zoneName}(${r.line || "V01"}) EC:${r.drainEc || "-"}(편차 ${s2.ecDev}) pH:${r.drainPh || "-"}(편차 ${s2.phDev}) ${s2.statusText}`;
        }).join("\n");
      return `${head}
▸ 이상 의심 기록 (주의/경고만, 최대30):
${bad || "- 없음 (기간 내 이상 없음)"}
위 이상 의심 기록만 집중 분석하세요.`.trim();
    }

    if (roleKey === "growth") {
      const stdRows = standards.map(s =>
        `- ${s.periodName || "-"} / ${s.standardDate} / ${s.lineNo || s.line || "V01"} / 목표EC ${s.targetEc || s.supplyEc || "-"} / 목표pH ${s.targetPh || s.supplyPh || "-"} / 목표배액율 ${s.drainRate || "-"}%`).join("\n");
      const farm = gFarmData ? `▸ 정식일: ${formatDateYmd(gFarmData.plantingDate) || "-"} / 시즌: ${gFarmData.season || "-"} / 품종: ${gFarmData.variety || "-"}` : "";
      const recent = records.sort((a, b) => b.measureDate.localeCompare(a.measureDate)).slice(0, 15)
        .map(r => {
          const s2 = checkStatus(r);
          return `${r.measureDate} ${r.zoneName} EC:${r.drainEc || "-"}(편차 ${s2.ecDev}) pH:${r.drainPh || "-"}(편차 ${s2.phDev})`;
        }).join("\n");
      return `${head}
${farm}
▸ 생육단계 기준 목록:
${stdRows || "- 없음"}
▸ 최근 기록 요약 (최신순 15건):
${recent || "- 없음"}
생육단계별 기준 적정성만 조언하세요.`.trim();
    }

    return `${head}
▸ 판정기준: EC편차=실제EC-(기준EC+0.2) / pH편차=실제pH-기준pH, pH 6.8↑ 또는 5.2↓는 경고
▸ 배액율: 배액량÷24h급액량×100 (목표 대비 ±10%p 정상 / ±20%p 주의 / 초과 경고)
▸ 구역정보: ${zoneList.map(z => `- ${z.zoneName} / ${z.liquidLine || z.line || "V01"} / 샘플:${z.hasSampleData ? "예" : "아니오"}`).join("\n")}
▸ 측정기록 (최신순, 최대30건): ${records.sort((a, b) => b.measureDate.localeCompare(a.measureDate)).slice(0, 30).map(r => {
      const s2 = checkStatus(r);
      return `${r.measureDate} ${r.measureTime || ""} | ${r.zoneName} | EC:${r.drainEc || "-"}(${s2.ecDev}) | pH:${r.drainPh || "-"}(${s2.phDev}) | 배액:${r.drainAmount ? r.drainAmount + "mL" : "-"}${s2.ratio != null ? `(배액율 ${s2.ratio}%${s2.targetRate ? "/목표" + s2.targetRate + "%" : ""})` : ""} | ${s2.statusText}`;
    }).join("\n")}
위 데이터를 분석하고 개선점과 구체적인 양액기 처방 권장사항을 표를 포함하여 제시해주세요.`.trim();
  }

  // =====================================================
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
        gFarmData = farm;
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

  function checkStatus(r) {
    if (typeof window.calcDrainStatus === "function") {
      return window.calcDrainStatus(r, standards, supplySettings);
    }
    return { level: "none", ecDev: "-", phDev: "-", supEc: "-", supPh: "-", statusText: "기준없음", statusColor: "#888", ratio: null, ratioColor: "#999", targetRate: null, supplyCount: null };
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
    const preInfo = log.preInstructions ? `  |  💬 "${log.preInstructions}"` : "";
    document.getElementById("modalMeta").textContent = `📅 분석일시: ${dateStr}  |  📊 분석기간: ${log.period || "-"}${preInfo}`;
    document.getElementById("modalBody").textContent = "🔄 내용 불러오는 중...";
    document.getElementById("resultModal").style.display = "flex";
    document.body.style.overflow = "hidden";

    try {
      const database = await ensureDb();
      const { doc, getDoc } = await getFs();
      const snap = await getDoc(doc(database, AI_LOG_COLLECTION, logId));
      if (snap.exists()) {
        const data = snap.data();
        document.getElementById("modalBody").innerHTML = renderMarkdown(data.resultText || "내용이 없습니다.");
      } else {
        document.getElementById("modalBody").innerHTML = "⚠️ 내용을 찾을 수 없습니다.";
      }
    } catch (e) {
      document.getElementById("modalBody").innerHTML = "❌ 불러오기 실패: " + e.message;
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

  // ✅ 프리셋 날짜 설정 — 로컬 날짜 문자열로 직접 설정 (시간대 무관)
  function setPreset() {
    const now = new Date();
    const preset = document.getElementById("datePreset").value;
    let start, end;

    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === "weekday") {
      const day = now.getDay() || 7;
      start = new Date(todayLocal);
      start.setDate(todayLocal.getDate() - day + 1);
      end = new Date(start);
      end.setDate(start.getDate() + 4);
    } else if (preset === "week") {
      const day = now.getDay() || 7;
      start = new Date(todayLocal);
      start.setDate(todayLocal.getDate() - day + 1);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === "month3") {
      start = new Date(todayLocal);
      start.setMonth(start.getMonth() - 3);
      end = new Date(todayLocal);
    } else return;

    document.getElementById("sDate").value = toLocalYmd(start);
    document.getElementById("eDate").value = toLocalYmd(end);
    loadSummaryInfo();
  }

  async function loadSummaryInfo() {
    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    if (!sDate || !eDate) return;
    const filtered = allRecords.filter(r => r.measureDate && r.measureDate >= sDate && r.measureDate <= eDate);
    document.getElementById("totalCount").textContent = filtered.length + "건";
    const lineSet = new Set(filtered.map(r => r.line || r.lineNo || "V01"));
    const lineNames = [...lineSet].sort().join("·");
    document.getElementById("lineInfo").textContent = lineNames ? `${lineSet.size}개 라인 (${lineNames})` : "0개 라인";
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
        <span class="badge">${ROLE_LABEL[detectRole(ai)]}</span>
        <span class="badge">${ai.modelName || "gemini-3.6-flash"}</span>
      </label>
    `).join("");
  }

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
    if (isRunning) return alert("이미 분석이 실행 중입니다. 잠시만 기다려주세요.");
    if (!canRunAnalysis()) return alert("분석 실행 권한이 없습니다.");
    const checks = document.querySelectorAll("#aiCheckList input:checked");
    if (!checks.length) return alert("분석할 AI를 하나 이상 선택하세요!");
    if (checks.length > 3) return alert("최대 3개까지 선택 가능합니다.");

    const sDate = document.getElementById("sDate").value;
    const eDate = document.getElementById("eDate").value;
    if (!sDate || !eDate) return alert("시작일과 종료일을 지정하세요!");

    const preInstructions = (document.getElementById("preInstructions").value || "").trim();

    isRunning = true;
    const runBtn = document.getElementById("runAnalysisBtn");
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "🔄 분석 실행 중...";
    }

    try {
      const records = allRecords.filter(r => r.measureDate && r.measureDate >= sDate && r.measureDate <= eDate);

      let ok = 0, warn = 0, danger = 0;
      records.forEach(r => {
        const s2 = checkStatus(r);
        if (s2.level === "danger") danger++;
        else if (s2.level === "warn") warn++;
        else ok++;
      });

      let ratioOk = 0, ratioWarn = 0, ratioDanger = 0, ratioNone = 0;
      records.forEach(r => {
        const s2 = checkStatus(r);
        if (s2.ratio == null) { ratioNone++; return; }
        if (!s2.targetRate) return;
        const ad = Math.abs(s2.ratio - s2.targetRate);
        if (ad <= 10) ratioOk++;
        else if (ad <= 20) ratioWarn++;
        else ratioDanger++;
      });
      const st = { ok, warn, danger, ratioOk, ratioWarn, ratioDanger, ratioNone };

      const area = document.getElementById("aiResultArea");
      area.innerHTML = "";

      for (const cb of checks) {
        const aiName = cb.dataset.name;
        const model = cb.dataset.model;
        const apiKey = cb.dataset.key?.trim();
        const ai = aiList.find(a => a.id === cb.value) || {};
        const roleKey = detectRole(ai);
        const userGuide = (cb.dataset.prompt || "").trim();

        const prompt = `당신은 스마트팜 딸기 재배 및 배액(드레인) 관리 전문가입니다.
${ROLE_PROMPTS[roleKey]}${userGuide ? `\n추가 역할 가이드: ${userGuide}` : ""}${preInstructions ? `\n\n🎯 사용자 특별 지시사항: ${preInstructions}\n(위 지시사항을 우선적으로 반영하여 분석하세요)` : ""}`;
        const dataSummary = buildDataSummary(roleKey, records, sDate, eDate, st);

        const cardId = "card-" + cb.value;
        area.innerHTML += `
          <div class="result-card" id="${cardId}">
            <h4>🤖 ${aiName} <span style="color:#999;">[${ROLE_LABEL[roleKey]}] 분석중...</span></h4>
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
          document.querySelector(`#${cardId} .result-body`).innerHTML = renderMarkdown(text);

          const database = await ensureDb();
          const { collection, addDoc } = await getFs();
          const docRef = await addDoc(collection(database, AI_LOG_COLLECTION), {
            aiName, model, period: `${sDate} ~ ${eDate}`, role: ROLE_LABEL[roleKey],
            preInstructions: preInstructions || null,
            analyzedAt: new Date().toISOString(),
            resultText: text
          });

          followCtx[cardId] = {
            prompt: fullPrompt,
            history: [
              { role: "user", text: fullPrompt },
              { role: "model", text: text }
            ],
            fullText: text,
            logId: docRef.id,
            model, endpoint, apiKey
          };
          const cardEl = document.getElementById(cardId);
          if (cardEl && !cardEl.querySelector(".followup-box")) {
            cardEl.insertAdjacentHTML("beforeend", `
              <div class="followup-box" style="margin-top:10px; padding-top:8px; border-top:1px dashed #ddd;">
                <div style="display:flex; gap:6px;">
                  <input type="text" class="followup-input" style="flex:1; padding:6px 8px; font-size:11px; border:1px solid #ccc; border-radius:4px;" placeholder="❓ 추가 질문 (예: 3번라인 관수를 얼마나 늘릴까?)">
                  <button class="btn-sm btn-primary followup-btn" data-card="${cardId}">추가 질문</button>
                </div>
                <div class="followup-log" style="margin-top:8px;"></div>
              </div>`);
          }

        } catch (e) {
          const isCors = (e instanceof TypeError);
          const isBusy = /503|429|500/.test(e.message);
          const msg = isCors
            ? "CORS/네트워크 오류! API 서버가 브라우저 직접 호출을 거부했습니다."
            : isBusy
              ? "서버 혼잡(503/429)! 자동 재시도에도 실패했어요. 잠시 후 다시 누르세요."
              : e.message;
          document.querySelector(`#${cardId} .result-body`).textContent = "❌ 오류: " + msg;
          document.querySelector(`#${cardId} h4 span`).textContent = "실패";
          document.querySelector(`#${cardId} h4 span`).style.color = "#c62828";
          console.error(`[AI분석 오류] ${aiName}:`, e);
        }
      }

      await loadSavedResults();
    } finally {
      isRunning = false;
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = "✅ 선택한 AI로 분석 실행";
      }
    }
  }

  async function askFollowUp(cardId) {
    const ctx = followCtx[cardId];
    const card = document.getElementById(cardId);
    if (!ctx || !card) return;
    const input = card.querySelector(".followup-input");
    const q = (input.value || "").trim();
    if (!q) return alert("추가 질문을 입력하세요!");
    const log = card.querySelector(".followup-log");
    const btn = card.querySelector(".followup-btn");
    btn.disabled = true;
    log.insertAdjacentHTML("beforeend", `<div style="margin:6px 0; padding:6px 8px; background:#f5f9ff; border-radius:4px; font-size:11px;"><strong>🙋 Q. ${q}</strong><div class="fa-answer" style="margin-top:4px; white-space:pre-wrap;">🔄 답변 중...</div></div>`);
    const answerEl = log.lastElementChild.querySelector(".fa-answer");

    ctx.history.push({ role: "user", text: q });

    try {
      let text = "";
      if (ctx.endpoint.includes("generativelanguage.googleapis.com")) {
        let url = ctx.endpoint.endsWith("/") ? ctx.endpoint : ctx.endpoint + "/";
        url += `${ctx.model}:generateContent?key=${ctx.apiKey}`;
        const contents = ctx.history.map(h => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: h.text }] }));
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        text = json?.candidates?.[0]?.content?.parts?.[0]?.text || json?.error?.message || "응답을 받아오지 못했습니다.";
      } else {
        let url = ctx.endpoint.endsWith("/") ? ctx.endpoint : ctx.endpoint + "/";
        url += "chat/completions";
        const messages = ctx.history.map(h => ({ role: h.role === "model" ? "assistant" : "user", content: h.text }));
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.apiKey}` },
          body: JSON.stringify({ model: ctx.model, messages })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        text = json?.choices?.[0]?.message?.content || json?.error?.message || "응답을 받아오지 못했습니다.";
      }

      answerEl.innerHTML = renderMarkdown(text);
      ctx.history.push({ role: "model", text });
      ctx.fullText += `\n\n──────────\n[추가 질문] ${q}\n[답변] ${text}`;

      const database = await ensureDb();
      const { doc, updateDoc } = await getFs();
      await updateDoc(doc(database, AI_LOG_COLLECTION, ctx.logId), { resultText: ctx.fullText });

      input.value = "";
    } catch (e) {
      answerEl.textContent = "❌ 오류: " + e.message;
      ctx.history.pop();
    } finally {
      btn.disabled = false;
    }
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
        analyzedAt: d.data().analyzedAt,
        preInstructions: d.data().preInstructions || null
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
            const preBadge = log.preInstructions ? ` <span style="font-size:9px; color:#1976d2; background:#e3f2fd; padding:1px 5px; border-radius:8px;" title="${log.preInstructions.replace(/"/g, '&quot;')}">💬 지시有</span>` : "";
            return `
              <tr>
                <td class="past-date" onclick="openResultModal('${log.id}')">${dateStr}</td>
                <td class="past-name" onclick="openResultModal('${log.id}')">${log.aiName}${preBadge}</td>
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
      // ✅ 햄버거 버튼 및 로그아웃은 common.js가 전역 처리하므로 중복 토글 방지

      const fuBtn = e.target.closest(".followup-btn");
      if (fuBtn) {
        askFollowUp(fuBtn.dataset.card);
        return;
      }

      document.querySelectorAll("#aiSelectArea button").forEach(btn => {
        if (btn.dataset.aiBound) return;
        if (btn.hasAttribute("onclick")) return;
        btn.dataset.aiBound = "1";
        if (/분석 실행|분석실행|선택한 AI/.test(btn.textContent)) {
          btn.addEventListener("click", runAIAnalysis);
        }
      });

      const closeBtn = document.querySelector(".modal-close");
      if (closeBtn && !closeBtn.dataset.aiBound) {
        closeBtn.dataset.aiBound = "1";
        if (!closeBtn.hasAttribute("onclick")) {
          closeBtn.addEventListener("click", closeModal);
        }
      }
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.classList.contains("followup-input")) {
        const box = e.target.closest(".followup-box");
        const btn = box ? box.querySelector(".followup-btn") : null;
        if (btn) askFollowUp(btn.dataset.card);
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

    // ✅ 기본 기간: 7일 전 ~ 오늘 (로컬 날짜 문자열로 직접 설정 → 시간대 무관)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 로컬 자정
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const eDateEl = document.getElementById("eDate");
    const sDateEl = document.getElementById("sDate");
    if (eDateEl) eDateEl.value = toLocalYmd(today);      // ✅ 로컬 문자열
    if (sDateEl) sDateEl.value = toLocalYmd(weekAgo);    // ✅ 로컬 문자열

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    try {
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
  window.askFollowUp = askFollowUp;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();