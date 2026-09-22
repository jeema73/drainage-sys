(() => {
  "use strict";
  console.log("✅ drain-record.js 로드됨 (v260920)");

  let db = null;
  let fsMod = null;
  const FARM_SETTINGS_ID = "current";

  let userRole = "";
  let zoneList = [];
  let standards = [];
  let supplySettings = [];
  let lastRecords = [];
  let lastEventsByLine = {}; // ✅ 라인별 최근 공급횟수 (프리필용)

  const ROLE_ADMIN = "admin";
  const ROLE_MANAGER = "manager";
  const ROLE_WORKER = "worker";

  function canEdit() { return [ROLE_ADMIN, ROLE_MANAGER, ROLE_WORKER].includes(userRole); }
  function canApprove() { return [ROLE_ADMIN, ROLE_MANAGER].includes(userRole); }

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
    return { user, userRole };
  }

  // ✅ 상태 판정 (EC/pH + 배액율)
  // 배액율 = 배액량(L) ÷ (당일 횟수 × 1회 시간 × 끝 배지 유량 ÷ 60) × 100
  function checkStatus(r) {
    const recLine = r.line || r.lineNo || "V01";
    const std = standards.filter(s => {
      const stdLine = s.lineNo || s.line || "V01";
      return s.standardDate <= r.measureDate && stdLine === recLine;
    }).sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0];

    if (!std) {
      return { level: "none", ecDev: "-", phDev: "-", supEc: "-", supPh: "-", statusText: "기준없음", statusColor: "#888", ratio: null, ratioColor: "#999", targetRate: null };
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

    // ✅ 배액율: 기록의 supplyEvents(실적) × 급액셋팅(기준)
    let ratio = null, ratioLevel = "none";
    const targetRate = parseFloat(std.drainRate) || null;
    const drainMl = parseFloat(r.drainAmount);
    const events = parseFloat(r.supplyEvents);
    const ss = supplySettings.filter(s => {
      const ssLine = s.lineNo || s.line || "V01";
      return ssLine === recLine && s.settingDate <= r.measureDate;
    }).sort((a, b) => b.settingDate.localeCompare(a.standardDate || a.settingDate))[0];

    if (ss && events > 0 && !isNaN(drainMl) && drainMl > 0) {
      const perEventL = (parseFloat(ss.minutesPerEvent) / 60) * parseFloat(ss.flowRatePerBag);
      const dailyL = perEventL * events;
      if (dailyL > 0) {
        ratio = (drainMl / 1000) / dailyL * 100;
        if (targetRate) {
          const ad = Math.abs(ratio - targetRate);
          ratioLevel = ad <= 10 ? "ok" : ad <= 20 ? "warn" : "danger";
        }
      }
    }
    const ratioColor = ratioLevel === "ok" ? "#2e7d32" : ratioLevel === "warn" ? "#ef6c00" : ratioLevel === "danger" ? "#c62828" : "#999";

    return {
      level, ecDev, phDev,
      supEc: rawEc !== undefined && rawEc !== null && rawEc !== "" ? rawEc : "-",
      supPh: rawPh !== undefined && rawPh !== null && rawPh !== "" ? rawPh : "-",
      statusText: level === "danger" ? "🚨 경고" : level === "warn" ? "⚠️ 주의" : "✅ 정상",
      statusColor: level === "danger" ? "#c62828" : level === "warn" ? "#ef6c00" : "#2e7d32",
      ratio: ratio === null ? null : Math.round(ratio * 10) / 10,
      ratioColor, targetRate
    };
  }

  function zoneCompare(a, b) {
    const ax = String(a.zoneName || "");
    const bx = String(b.zoneName || "");
    const aIsNum = /^[0-9]/.test(ax);
    const bIsNum = /^[0-9]/.test(bx);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (aIsNum && bIsNum) {
      const aNumMatch = ax.match(/(\d+)/);
      const bNumMatch = bx.match(/(\d+)/);
      if (aNumMatch && bNumMatch) {
        const aNum = parseInt(aNumMatch[1], 10);
        const bNum = parseInt(bNumMatch[1], 10);
        if (aNum !== bNum) return aNum - bNum;
      }
    }
    return ax.localeCompare(bx, "ko");
  }

  function zoneNameCompare(aName, bName) {
    const a = String(aName || "");
    const b = String(bName || "");
    const aNursery = a.includes("육") ? 1 : 0;
    const bNursery = b.includes("육") ? 1 : 0;
    if (aNursery !== bNursery) return aNursery - bNursery;
    const aNum = a.match(/(\d+)/) ? parseInt(a.match(/(\d+)/)[1], 10) : 999;
    const bNum = b.match(/(\d+)/) ? parseInt(b.match(/(\d+)/)[1], 10) : 999;
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b, "ko");
  }

  // ✅ 라인별 최근 공급횟수 프리필 맵 구축
  function buildPrefillMap(records) {
    const sorted = [...records].sort((a, b) => String(b.measureDate || "").localeCompare(String(a.measureDate || "")));
    lastEventsByLine = {};
    sorted.forEach(r => {
      const line = r.line || "V01";
      if (lastEventsByLine[line] === undefined && r.supplyEvents != null && r.supplyEvents !== "") {
        lastEventsByLine[line] = r.supplyEvents;
      }
    });
  }

  // ✅ 구역 선택 → 샘플 입력칸 자동 표시/숨김 + 횟수 프리필
  function onZoneChange() {
    const sel = document.getElementById("zoneSel");
    const opt = sel ? sel.selectedOptions[0] : null;
    const wrap = document.getElementById("sampleRowWrap");
    const use = !!(opt && opt.value && opt.dataset.sample === "true");
    const line = opt ? (opt.dataset.line || "V01") : "V01";

    if (wrap) wrap.style.display = use ? "block" : "none";
    if (!use) {
      ["sampleEc", "samplePh", "drainAmount", "supplyEvents"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
    } else {
      // ✅ 신규 등록 시에만 해당 라인 최근 횟수 프리필
      const editId = document.getElementById("editId").value;
      const evEl = document.getElementById("supplyEvents");
      if (!editId && evEl && lastEventsByLine[line] !== undefined) {
        evEl.value = lastEventsByLine[line];
      }
    }
  }

  async function loadRecords() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    const s = document.getElementById("sDate").value;
    const e = document.getElementById("eDate").value;
    const z = document.getElementById("zFilter").value;
    const ap = document.getElementById("approvedFilter").value;

    try {
      const snap = await getDocs(collection(database, "drain_records"));
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      buildPrefillMap(list); // ✅ 프리필 맵 갱신

      if (s) list = list.filter(r => r.measureDate >= s);
      if (e) list = list.filter(r => r.measureDate <= e);
      if (z) list = list.filter(r => r.zoneName === z);
      if (ap === "true") list = list.filter(r => r.approved === true);
      else if (ap === "false") list = list.filter(r => r.approved !== true);

      list.sort((a, b) => {
        const dCmp = String(b.measureDate || "").localeCompare(String(a.measureDate || ""));
        if (dCmp !== 0) return dCmp;
        const zCmp = zoneNameCompare(a.zoneName, b.zoneName);
        if (zCmp !== 0) return zCmp;
        return String(b.measureTime || "").localeCompare(String(a.measureTime || ""));
      });

      lastRecords = list;
      renderList();
    } catch (e) {
      console.error("기록 불러오기 오류:", e);
      const tb = document.getElementById("listBody");
      if (tb) tb.innerHTML = `<tr><td colspan="16" class="empty-box">오류: ${e.message}</td></tr>`;
    }
  }

  function renderList() {
    const tb = document.getElementById("listBody");
    if (!tb) return;

    if (!lastRecords.length) {
      tb.innerHTML = `<tr><td colspan="16" class="empty-box">해당 기간에 기록이 없습니다.</td></tr>`;
      return;
    }

    const editOk = canEdit();
    const apprOk = canApprove();

    tb.innerHTML = lastRecords.map(r => {
      const st = checkStatus(r);
      let rowClass = "";
      if (st.level === "danger") rowClass = "class='danger-row'";
      else if (st.level === "warn") rowClass = "class='warn-row'";

      const isApproved = r.approved === true;
      const zoneLine = `${r.zoneName || "-"} · ${r.line || "V01"}`;
      const ratioCell = st.ratio == null
        ? `<span style="color:#999;">-</span>`
        : `<span style="color:${st.ratioColor};font-weight:bold;" title="공급 ${r.supplyEvents || "-"}회 기준">${st.ratio}%</span>${st.targetRate ? `<br><span style="font-size:9px;color:#888;">목표 ${st.targetRate}%</span>` : ""}`;

      return `<tr ${rowClass}>
        <td>${r.measureDate || "-"}</td>
        <td>${r.measureTime || "-"}</td>
        <td>${zoneLine}</td>
        <td>${r.drainEc || "-"}</td>
        <td>${st.supEc}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.ecDev}</td>
        <td>${r.drainPh || "-"}</td>
        <td>${st.supPh}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.phDev}</td>
        <td>${r.sampleEc || "-"}</td>
        <td>${r.samplePh || "-"}</td>
        <td>${r.bedTemp != null && r.bedTemp !== "" ? r.bedTemp + "℃" : "-"}</t
        <td>${r.drainAmount || "-"}</td>
        <td>${ratioCell}</td>
        <td style="color:${st.statusColor}; font-weight:bold;">${st.statusText}</td>
        <td class="action-btns">
          <button class="btn-sm btn-primary" onclick="editRec('${r.id}')" ${editOk ? "" : "disabled"}>수정</button>
          <button class="btn-sm btn-secondary" onclick="toggleApprove('${r.id}', ${isApproved})" ${apprOk ? "" : "disabled"}>${isApproved ? "승인취소" : "승인"}</button>
          <button class="btn-sm btn-danger" onclick="deleteRec('${r.id}')" ${apprOk ? "" : "disabled"}>삭제</button>
        </td>
      </tr>`;
    }).join("");
  }

  async function saveRecord() {
    if (!canEdit()) return alert("등록/수정 권한이 없습니다.");

    const measureDate = document.getElementById("measureDate").value;
    const measureTime = document.getElementById("measureTime").value;
    const zoneSel = document.getElementById("zoneSel");
    const zoneName = zoneSel.value;
    const opt = zoneSel.selectedOptions[0];
    const drainEc = document.getElementById("drainEc").value;
    const drainPh = document.getElementById("drainPh").value;
    const bedTemp = document.getElementById("bedTemp").value;

    if (!measureDate || !measureTime) return alert("측정일자와 시간을 입력하세요!");
    if (!zoneName) return alert("구역을 선택하세요!");
    if (!drainEc || !drainPh) return alert("배액 EC와 pH를 입력하세요!");

    const sampleOn = document.getElementById("sampleRowWrap").style.display !== "none";
    const supplyEventsVal = document.getElementById("supplyEvents").value;
    if (sampleOn && !supplyEventsVal) return alert("당일 공급횟수를 입력하세요!\n(양액기 로그의 총 급수횟수)");

    const editId = document.getElementById("editId").value;

    const data = {
      measureDate,
      measureTime,
      zoneName,
      line: opt ? (opt.dataset.line || "V01") : "V01",
      drainEc: parseFloat(drainEc),
      drainPh: parseFloat(drainPh),
      bedTemp: bedTemp ? parseFloat(bedTemp) : null,
      sampleEc: sampleOn && document.getElementById("sampleEc").value ? parseFloat(document.getElementById("sampleEc").value) : null,
      samplePh: sampleOn && document.getElementById("samplePh").value ? parseFloat(document.getElementById("samplePh").value) : null,
      drainAmount: sampleOn && document.getElementById("drainAmount").value ? parseFloat(document.getElementById("drainAmount").value) : null,
      supplyEvents: sampleOn && supplyEventsVal ? parseInt(supplyEventsVal) : null,
      updatedAt: new Date().toISOString()
    };

    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc, addDoc, collection } = await getFs();

    try {
      if (editId) {
        await setDoc(doc(database, "drain_records", editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.approved = false;
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "drain_records"), data);
        alert("✅ 등록되었습니다!");
      }
      resetForm();
      await loadRecords();
    } catch (e) {
      alert("❌ 저장 실패: " + e.message);
    }
  }

  function editRec(id) {
    if (!canEdit()) return alert("수정 권한이 없습니다.");
    const r = lastRecords.find(x => x.id === id);
    if (!r) return;

    document.getElementById("editId").value = id;
    document.getElementById("measureDate").value = r.measureDate || "";
    document.getElementById("measureTime").value = r.measureTime || "";

    const zoneSel = document.getElementById("zoneSel");
    zoneSel.value = r.zoneName || "";
    onZoneChange();

    document.getElementById("drainEc").value = r.drainEc ?? "";
    document.getElementById("drainPh").value = r.drainPh ?? "";
    document.getElementById("sampleEc").value = r.sampleEc ?? "";
    document.getElementById("samplePh").value = r.samplePh ?? "";
    document.getElementById("bedTemp").value = r.bedTemp ?? "";
    document.getElementById("drainAmount").value = r.drainAmount ?? "";
    document.getElementById("supplyEvents").value = r.supplyEvents ?? "";

    const ft = document.getElementById("formTitle");
    if (ft) ft.textContent = "✏️ 배액 기록 수정";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleApprove(id, current) {
    if (!canApprove()) return alert("승인 권한이 없습니다.");
    const database = await ensureDb();
    if (!database) return;
    const { doc, setDoc } = await getFs();
    try {
      await setDoc(doc(database, "drain_records", id), {
        approved: !current,
        approvedAt: new Date().toISOString()
      }, { merge: true });
      alert(!current ? "✅ 승인되었습니다!" : "승인이 취소되었습니다.");
      await loadRecords();
    } catch (e) {
      alert("❌ 처리 실: " + e.message);
    }
  }

  async function deleteRec(id) {
    if (!canApprove()) return alert("삭제 권한이 없습니다.");
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const database = await ensureDb();
    if (!database) return;
    const { doc, deleteDoc } = await getFs();
    try {
      await deleteDoc(doc(database, "drain_records", id));
      alert("✅ 삭제되었습니다!");
      await loadRecords();
    } catch (e) {
      alert("❌ 삭제 실패: " + e.message);
    }
  }

  function resetForm() {
    document.getElementById("editId").value = "";
    document.getElementById("measureDate").valueAsDate = new Date();
    document.getElementById("measureTime").value = new Date().toTimeString().slice(0, 5);
    const zoneSel = document.getElementById("zoneSel");
    if (zoneSel) zoneSel.value = "";
    onZoneChange();
    ["drainEc", "drainPh", "bedTemp", "sampleEc", "samplePh", "drainAmount", "supplyEvents"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const ft = document.getElementById("formTitle");
    if (ft) ft.textContent = "➕ 배액 기록 등록";
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

    ["sDate", "eDate", "zFilter", "approvedFilter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", loadRecords);
    });

    const zoneSel = document.getElementById("zoneSel");
    if (zoneSel) zoneSel.addEventListener("change", onZoneChange);

    const saveBtn = document.getElementById("saveBtn");
    const resetBtn = document.getElementById("resetBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveRecord);
    if (resetBtn) resetBtn.addEventListener("click", resetForm);
  }

  async function init() {
    const auth = checkAuth();
    if (!auth) return;

    bindEvents();
    await loadFarmInfo();
    loadWeather();

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const eDateEl = document.getElementById("eDate");
    const sDateEl = document.getElementById("sDate");
    if (eDateEl) eDateEl.valueAsDate = today;
    if (sDateEl) sDateEl.valueAsDate = yesterday;

    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();

    try {
      const [zoneSnap, stdSnap, ssSnap] = await Promise.all([
        getDocs(collection(database, "zones")),
        getDocs(collection(database, "supply_standards")),
        getDocs(collection(database, "supply_settings")).catch(() => null)
      ]);
      zoneList = zoneSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(zoneCompare);
      standards = stdSnap.docs.map(d => d.data());
      supplySettings = ssSnap ? ssSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    } catch (e) {
      console.log("기준데이터 불러오기 오류:", e);
    }

    const sel = document.getElementById("zoneSel");
    const fil = document.getElementById("zFilter");
    if (sel && !sel.querySelector('option[value=""]')) {
      sel.insertAdjacentHTML("afterbegin", `<option value="">-- 구역 선택 --</option>`);
    }
    zoneList.forEach(z => {
      const line = z.liquidLine || z.line || "V01";
      const hasSample = z.hasSampleData ? "true" : "false";
      if (sel) sel.innerHTML += `<option data-line="${line}" data-sample="${hasSample}" value="${z.zoneName}">${z.zoneName} · ${line}</option>`;
      if (fil) fil.innerHTML += `<option value="${z.zoneName}">${z.zoneName}</option>`;
    });
    if (sel) sel.value = "";
    onZoneChange();

    document.getElementById("measureDate").valueAsDate = new Date();
    document.getElementById("measureTime").value = new Date().toTimeString().slice(0, 5);

    await loadRecords();
  }

  window.editRec = editRec;
  window.deleteRec = deleteRec;
  window.toggleApprove = toggleApprove;
  window.saveRecord = saveRecord;
  window.resetForm = resetForm;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();