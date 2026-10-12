(() => {
  "use strict";

  // ==========================================================
  // ✅ Firebase 설정
  // ==========================================================
  const FIREBASE_VERSION = "11.6.0";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCfcMVOOn3l1XbUnp6yezqHPdHjAysA79k",
    authDomain: "smartfarm-drainage-system.firebaseapp.com",
    projectId: "smartfarm-drainage-system",
    storageBucket: "smartfarm-drainage-system.firebasestorage.app",
    messagingSenderId: "699907108321",
    appId: "1:699907108321:web:b71e0ed0d3df141c7836a0",
    measurementId: "G-W7L21Y8JZN"
  };

  const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
  const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;

  // ==========================================================
  // ✅ 캐시 및 기본 설정
  // ==========================================================
  const WEATHER_CACHE_KEY = "sb_weather_cache_v1";
  const FARM_CACHE_KEY = "sb_farm_cache_v1";

  const WEATHER_TTL = 10 * 60 * 1000; // 10분
  const FARM_TTL = 5 * 60 * 1000;      // 5분

  // 강북구 동별 정밀 좌표 프리셋
  const DONG_COORDINATES = {
    "수유동": { lat: 37.6425, lon: 127.0295, label: "서울시 강북구 수유동" },
    "번동":   { lat: 37.6318, lon: 127.0384, label: "서울시 강북구 번동" },
    "미아동": { lat: 37.6258, lon: 127.0255, label: "서울시 강북구 미아동" },
    "우이동": { lat: 37.6586, lon: 127.0118, label: "서울시 강북구 우이동" },
    "삼양동": { lat: 37.6245, lon: 127.0185, label: "서울시 강북구 삼양동" },
    "송중동": { lat: 37.6212, lon: 127.0315, label: "서울시 강북구 송중동" },
    "송천동": { lat: 37.6155, lon: 127.0285, label: "서울시 강북구 송천동" },
    "인수동": { lat: 37.6445, lon: 127.0125, label: "서울시 강북구 인수동" }
  };

  const WEATHER_DEFAULT = {
    lat: 37.6425,
    lon: 127.0295,
    label: "서울시 강북구 수유동"
  };

  // ==========================================================
  // ✅ 공통 메뉴 설정 (이곳 한 곳에서 전체 페이지 메뉴 관리)
  // ==========================================================
  const MENU_CONFIG = [
    { href: "dashboard.html", icon: "📊", text: "대시보드", role: "all" },
    { href: "drain-record.html", icon: "📝", text: "배액기록", role: "all" },
    { href: "analysis-report.html", icon: "📈", text: "분석리포트", role: "all" },
    { href: "ai-report.html", icon: "🤖", text: "AI분석리포트", role: "all" },
    { href: "print-page.html", icon: "🖨️", text: "인쇄/CSV", role: "all" },
    { divider: true },
    { href: "supply-standard.html", icon: "⚙️", text: "급액기준등록", role: "admin,manager" },
    { href: "zone-manage.html", icon: "📍", text: "구역등록", role: "admin,manager" },
    { href: "farm-settings.html", icon: "🏠", text: "농장설정", role: "admin,manager" },
    { href: "ai-settings.html", icon: "🔧", text: "AI분석설정", role: "admin" },
    { href: "account-manage.html", icon: "👤", text: "계정관리", role: "admin" },
    { divider: true },
    { 
      href: "control-system.html", 
      icon: "🎛️", 
      text: "복합환경제어기", 
      role: "all", 
      isHighlight: true,
      badge: "LIVE"
    }
  ];

  // ==========================================================
  // ✅ 내부 상태
  // ==========================================================
  let db = null;
  let firestoreModule = null;
  let farmInfoLoaded = false;
  let weatherPromise = null;
  let farmPromise = null;

  // ==========================================================
  // ✅ DOM & 파싱 유틸
  // ==========================================================
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const setText = (selector, value) => {
    const el = qs(selector);
    if (el && value != null) el.textContent = value;
  };

  const safeJsonParse = (value, fallback = null) => {
    try {
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const getCache = (key) => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = safeJsonParse(raw, null);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.expiresAt || Date.now() > parsed.expiresAt) return null;
      return parsed.data ?? null;
    } catch {
      return null;
    }
  };

  const setCache = (key, data, ttl) => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          data,
          expiresAt: Date.now() + ttl
        })
      );
    } catch {
      // sessionStorage 제한 무시
    }
  };

  const removeCache = (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };

  // ==========================================================
  // ✅ 날짜 관련 유틸
  // ==========================================================
  const startOfDay = (value) => {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getDayDiff = (baseDate, targetDate = new Date()) => {
    const a = startOfDay(baseDate);
    const b = startOfDay(targetDate);
    return Math.round((b - a) / 86400000);
  };

  function toLocalYmd(d) {
    if (!d) return "";
    const dateObj = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dateObj.getTime())) return String(d);
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
  }

  function formatDateYmd(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ✅ EC / pH 전용 무조건 소수점 2자리 포맷팅 유틸 (1.0 ➔ "1.00", 6 ➔ "6.00")
  function formatNum2(val, fallback = "-") {
    if (val === null || val === undefined || val === "") return fallback;
    const num = parseFloat(val);
    if (isNaN(num)) return fallback;
    return num.toFixed(2);
  }
  const formatEc = formatNum2;
  const formatPh = formatNum2;

  // ==========================================================
  // ✅ 역할 / 권한 / 인증
  // ==========================================================
  const ROLE_ALIAS = {
    admin: "admin",
    최고관리자: "admin",
    최고님: "admin",
    manager: "manager",
    매니저: "manager",
    worker: "worker",
    공공근로자: "worker",
    guest: "guest",
    게스트: "guest"
  };

  const ROLE_NAMES = {
    admin: "최고관리자",
    manager: "매니저",
    worker: "공공근로자",
    guest: "게스트"
  };

  function normalizeRole(role) {
    const raw = String(role || "").trim();
    if (!raw) return "";
    return ROLE_ALIAS[raw] || ROLE_ALIAS[raw.toLowerCase()] || raw;
  }

  function getRoleName(role) {
    const norm = normalizeRole(role);
    return ROLE_NAMES[norm] || role || "사용자";
  }

  function applyMenuPermissions(role) {
    const currentRole = normalizeRole(role);
    qsa(".sidebar-menu a").forEach((link) => {
      const allowedRoles = (link.dataset.role || "all").split(",");
      const isVisible =
        allowedRoles.includes("all") ||
        allowedRoles.some((r) => normalizeRole(r) === currentRole);

      if (isVisible) {
        link.classList.add("visible");
      } else {
        link.classList.remove("visible");
      }
    });
  }

  function updateUserInfo(user, userRole) {
    const rawRole = userRole || localStorage.getItem("userRole") || "";
    const userData = user || safeJsonParse(localStorage.getItem("user"), null);
    const userNameEl = qs("#sidebarUserName");

    if (userNameEl) {
      if (userData) {
        const displayName = userData.userName || userData.userId || "사용자";
        userNameEl.textContent = `${displayName} ${getRoleName(rawRole)}`;
      } else {
        userNameEl.textContent = "사용자 정보";
      }
    }

    if (rawRole) {
      applyMenuPermissions(rawRole);
    }
  }

  function checkAuth(allowRoles = ["admin", "manager", "worker", "guest"]) {
    const user = safeJsonParse(localStorage.getItem("user"), null);
    const rawRole = String(localStorage.getItem("userRole") || "").trim();
    const normalizedRole = normalizeRole(rawRole);

    if (!user || !user.userId || !rawRole) {
      location.replace("index.html");
      return null;
    }

    const allowed = (allowRoles || []).some((role) => {
      const normalizedAllowRole = normalizeRole(role);
      return (
        rawRole === role ||
        rawRole === normalizedAllowRole ||
        normalizedRole === role ||
        normalizedRole === normalizedAllowRole
      );
    });

    const noPermitArea = qs("#noPermitArea");
    const deniedArea = qs("#deniedArea");
    const adminArea = qs("#adminArea");

    if (!allowed) {
      if (noPermitArea) noPermitArea.style.display = "block";
      if (deniedArea) deniedArea.style.display = "block";
      if (adminArea) adminArea.style.display = "none";
      return null;
    }

    if (noPermitArea) noPermitArea.style.display = "none";
    if (deniedArea) deniedArea.style.display = "none";
    if (adminArea) adminArea.style.display = "block";

    updateUserInfo(user, rawRole);

    return {
      user,
      userRole: rawRole,
      normalizedRole
    };
  }

  // ==========================================================
  // ✅ 공통 레이아웃 컴포넌트 자동 주입 (사이드바 & 탑바)
  // ==========================================================
  function generateSidebarHtml() {
    const menuHtml = MENU_CONFIG.map((item) => {
      if (item.divider) {
        return `<div class="menu-divider"></div>`;
      }
      if (item.isHighlight) {
        return `<a href="${item.href}" data-role="${item.role}" class="sidebar-special-btn">
          <span class="special-icon">${item.icon}</span>
          <span class="special-text">${item.text}</span>
          ${item.badge ? `<span class="special-badge">${item.badge}</span>` : ""}
        </a>`;
      }
      return `<a href="${item.href}" data-role="${item.role}">${item.icon} ${item.text}</a>`;
    }).join("\n        ");

    return `
      <div class="sidebar-logo-top">
        <img src="https://www.gangbuk.go.kr/static/images/portal/ns_bi_logo1.png" alt="강북구 로고">
      </div>
      <div class="user-info-box" id="userInfoBox">
        <div class="sys-name1">Drainage System</div>
        <div class="sys-name">배액 관리 시스템</div>
        <div class="user-row">
          <span class="user-name" id="sidebarUserName">사용자 정보</span>
          <a href="#" class="logout-btn" id="sidebarLogoutBtn">LOGOUT</a>
        </div>
      </div>
      <div class="menu-divider"></div>
      <div class="sidebar-menu" id="sidebarMenu">
        ${menuHtml}
      </div>
      <div class="menu-divider"></div>
      <div class="sidebar-logo-bottom">
        <img src="https://www.gangbuk.go.kr/static/images/portal/ns_bi_logo1_eng.png" alt="하단로고">
      </div>
      <div class="weather-box" id="weatherBox">
        <table class="weather-table">
          <tr>
            <td style="width: 35%;">
              <div class="weather-icon" id="weatherIcon">🌤️</div>
            </td>
            <td style="width: 65%; text-align: left; padding-left: 8px;">
              <div class="weather-temp" id="weatherTemp">--°</div>
              <div class="weather-desc" id="weatherDesc">날씨 불러오는 중...</div>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <div class="weather-range" id="weatherRange">최저 --° / 최고 --°</div>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <div class="weather-location">서울시 강북구</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="margin-top:auto;"></div>
    `;
  }

  function generateHeaderHtml() {
    return `
      <button class="header-hamburger" id="hamBtn">☰</button>
      <div class="header-title-group">
        <div class="header-title" id="topFarmName">농장정보 로딩중...</div>
        <div class="top-meta" id="topFarmMeta">정보 불러오는 중...</div>
      </div>
    `;
  }

  function injectLayout() {
    const appLayout = qs(".app-layout");
    if (!appLayout) return; // 로그인 페이지 등에는 레이아웃 주입 안 함

    // 1. 사이드바 주입 (비어있거나 없으면 자동 생성)
    let sidebar = qs("#sidebar", appLayout);
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.className = "sidebar";
      sidebar.id = "sidebar";
      sidebar.innerHTML = generateSidebarHtml();
      appLayout.insertBefore(sidebar, appLayout.firstChild);
    } else if (sidebar.children.length === 0) {
      sidebar.innerHTML = generateSidebarHtml();
    }

    // 2. 탑바 헤더 주입 (.right-column 내부)
    const rightCol = qs(".right-column", appLayout);
    if (rightCol) {
      let header = qs(".top-header", rightCol);
      if (!header) {
        header = document.createElement("header");
        header.className = "top-header";
        header.innerHTML = generateHeaderHtml();
        rightCol.insertBefore(header, rightCol.firstChild);
      } else if (header.children.length === 0) {
        header.innerHTML = generateHeaderHtml();
      }
    }

    // 3. 오버레이 주입
    let overlay = qs("#overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.id = "overlay";
      document.body.appendChild(overlay);
    }
  }

  function setActiveMenu(pageName) {
    const currentPage = String(
      pageName || location.pathname.split("/").pop() || "dashboard.html"
    ).split(/[?#]/)[0];

    qsa(".sidebar-menu a").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const linkPage = href.split(/[?#]/)[0].split("/").pop();
      const isActive = linkPage === currentPage || anchor.href.includes(currentPage);
      anchor.classList.toggle("active", isActive);
    });
  }

  // ==========================================================
  // ✅ 사이드바 토글 & 로그아웃 바인딩
  // ==========================================================
  window.toggleSidebar = function toggleSidebar(force) {
    const sidebar = qs("#sidebar");
    const overlay = qs("#overlay");
    if (!sidebar) return;

    const willOpen =
      typeof force === "boolean" ? force : !sidebar.classList.contains("open");

    sidebar.classList.toggle("open", willOpen);
    if (overlay) overlay.classList.toggle("show", willOpen);
    document.body.classList.toggle("sidebar-open", willOpen);
    sidebar.setAttribute("aria-hidden", String(!willOpen));
  };

  function bindSidebarEvents() {
    document.addEventListener("click", (e) => {
      if (e.target.id === "hamBtn" || e.target.closest("#hamBtn")) {
        window.toggleSidebar();
      }
      if (e.target.id === "sidebarLogoutBtn" || e.target.closest("#sidebarLogoutBtn")) {
        e.preventDefault();
        window.logout();
      }
      if (e.target.id === "overlay") {
        window.toggleSidebar(false);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        window.toggleSidebar(false);
      }
    });
  }

  window.logout = function logout(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (confirm("로그아웃 하시겠습니까?")) {
      localStorage.removeItem("user");
      localStorage.removeItem("userRole");
      removeCache(FARM_CACHE_KEY);
      removeCache(WEATHER_CACHE_KEY);
      location.href = "index.html";
    }
  };

  // ==========================================================
  // ✅ Firebase / Firestore 단일화
  // ==========================================================
  async function importFirestoreModule() {
    if (!firestoreModule) {
      firestoreModule = await import(FIRESTORE_URL);
    }
    return firestoreModule;
  }

  async function initFirebaseIfNeeded() {
    if (db) return db;
    try {
      const appModule = await import(FIREBASE_APP_URL);
      const fireModule = await importFirestoreModule();
      const existingApps =
        typeof appModule.getApps === "function" ? appModule.getApps() : [];

      const app = existingApps.length
        ? existingApps[0]
        : appModule.initializeApp(FIREBASE_CONFIG);

      db = fireModule.getFirestore(app);
      return db;
    } catch (error) {
      console.error("❌ Firebase 초기화 실패:", error);
      return null;
    }
  }

  async function getDocData(...pathSegments) {
    const database = await initFirebaseIfNeeded();
    if (!database) return null;
    try {
      const fireModule = await importFirestoreModule();
      const snap = await fireModule.getDoc(fireModule.doc(database, ...pathSegments));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      console.error("❌ Firestore 문서 조회 실패:", error);
      return null;
    }
  }

  // ==========================================================
  // ✅ 농장정보 로드 & 렌더링
  // ==========================================================
  function renderFarmInfo(farm) {
    if (!farm || typeof farm !== "object") return;

    const topFarmName = qs("#topFarmName");
    if (topFarmName) {
      topFarmName.textContent = farm.farmName || "강북구 스마트팜 재배단지";
    }

    const topFarmMeta = qs("#topFarmMeta");
    if (topFarmMeta) {
      topFarmMeta.innerHTML = `
        <span>🌿 재배작물: ${farm.cropType || "딸기"}</span>
        <span>🍓 품종: ${farm.variety || "금실"}</span>
        <span>🌱 정식일: ${formatDateYmd(farm.plantingDate)}</span>
      `;
    }
  }

  async function loadFarmName(force = false) {
    if (farmInfoLoaded && !force) return;
    if (!force && farmPromise) return farmPromise;

    const cachedFarm = getCache(FARM_CACHE_KEY);
    if (!force && cachedFarm) {
      renderFarmInfo(cachedFarm);
      farmInfoLoaded = true;
      return;
    }

    farmPromise = (async () => {
      try {
        const farm = await getDocData("settings", "current");
        if (farm) {
          setCache(FARM_CACHE_KEY, farm, FARM_TTL);
          renderFarmInfo(farm);
          farmInfoLoaded = true;
          return;
        }
        if (cachedFarm) {
          renderFarmInfo(cachedFarm);
          farmInfoLoaded = true;
        }
      } catch (error) {
        console.error("❌ 농장정보 불러오기 오류:", error);
        if (cachedFarm) {
          renderFarmInfo(cachedFarm);
          farmInfoLoaded = true;
        }
      } finally {
        farmPromise = null;
      }
    })();

    return farmPromise;
  }

  // ==========================================================
  // ✅ 날씨 로드 & 렌더링
  // ==========================================================
  function getWeatherInfo(code) {
    const map = {
      0: { icon: "☀️", desc: "맑음" },
      1: { icon: "🌤️", desc: "대체로 맑음" },
      2: { icon: "⛅", desc: "구름 조금" },
      3: { icon: "☁️", desc: "흐림" },
      45: { icon: "🌫️", desc: "안개" },
      48: { icon: "🌫️", desc: "서리 안개" },
      51: { icon: "🌦️", desc: "가벼운 이슬비" },
      53: { icon: "🌦️", desc: "이슬비" },
      55: { icon: "🌧️", desc: "진한 이슬비" },
      61: { icon: "🌦️", desc: "가벼운 비" },
      63: { icon: "🌧️", desc: "비" },
      65: { icon: "🌧️", desc: "폭우" },
      71: { icon: "🌨️", desc: "가벼운 눈" },
      73: { icon: "❄️", desc: "눈" },
      75: { icon: "❄️", desc: "폭설" },
      80: { icon: "🌦️", desc: "소나기" },
      81: { icon: "🌧️", desc: "강한 소나기" },
      82: { icon: "⛈️", desc: "폭우 소나기" },
      95: { icon: "⛈️", desc: "천둥번개" }
    };
    return map[code] || { icon: "🌡️", desc: "날씨정보" };
  }

  function renderWeather(data) {
    if (!data) return;
    setText("#weatherIcon", data.icon);
    setText("#weatherTemp", data.temp);
    setText("#weatherDesc", data.desc);
    setText("#weatherRange", data.range);
    if (data.location) {
      setText(".weather-location", data.location);
    }
  }

  function resolveDongLocation(farm) {
    if (!farm) return WEATHER_DEFAULT;
    const text = `${farm.farmDong || ""} ${farm.farmAddr || ""}`;
    for (const [dongName, info] of Object.entries(DONG_COORDINATES)) {
      if (text.includes(dongName)) {
        return info;
      }
    }
    return WEATHER_DEFAULT;
  }

  async function loadWeather(force = false) {
    const weatherBox = qs("#weatherBox");
    if (!weatherBox) return;

    if (!force && weatherPromise) return weatherPromise;

    const cachedWeather = getCache(WEATHER_CACHE_KEY);
    if (!force && cachedWeather) {
      renderWeather(cachedWeather);
      return;
    }

    weatherPromise = (async () => {
      try {
        const farm = getCache(FARM_CACHE_KEY) || (await getDocData("settings", "current"));
        const locationInfo = resolveDongLocation(farm);

        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${locationInfo.lat}` +
          `&longitude=${locationInfo.lon}` +
          `&current=temperature_2m,weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min` +
          `&timezone=Asia%2FSeoul` +
          `&forecast_days=1`;

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`날씨 API HTTP ${response.status}`);

        const data = await response.json();
        const current = data.current || {};
        const daily = data.daily || {};
        const weatherInfo = getWeatherInfo(current.weather_code);
        const temp = Math.round((Number(current.temperature_2m) || 0) * 10) / 10;
        const minTemp = Math.round(Number(daily.temperature_2m_min?.[0]) || 0);
        const maxTemp = Math.round(Number(daily.temperature_2m_max?.[0]) || 0);

        const payload = {
          icon: weatherInfo.icon,
          temp: `${temp}°`,
          desc: weatherInfo.desc,
          range: `최저 ${minTemp}° / 최고 ${maxTemp}°`,
          location: locationInfo.label,
          updatedAt: Date.now()
        };

        setCache(WEATHER_CACHE_KEY, payload, WEATHER_TTL);
        renderWeather(payload);
      } catch (error) {
        console.error("❌ 날씨 불러오기 실패:", error);
        renderWeather({
          icon: "🌡️",
          temp: "--°",
          desc: "날씨 확인불가",
          range: "최저 --° / 최고 --°",
          location: WEATHER_DEFAULT.label
        });
      } finally {
        weatherPromise = null;
      }
    })();

    return weatherPromise;
  }

  // ==========================================================
  // ✅ 공통 배액 상태 판정 공식 (단일 소스)
  // ==========================================================
  function calcDrainStatus(r, standards = [], supplySettings = []) {
    const recLine = r.line || r.lineNo || "V01";

    const std = standards
      .filter((s) => {
        const stdLine = s.lineNo || s.line || "V01";
        return s.standardDate <= r.measureDate && stdLine === recLine;
      })
      .sort((a, b) => b.standardDate.localeCompare(a.standardDate))[0];

    if (!std) {
      return {
        level: "none",
        ecDev: "-",
        phDev: "-",
        supEc: "-",
        supPh: "-",
        statusText: "기준없음",
        statusColor: "#888",
        ratio: null,
        ratioColor: "#999",
        targetRate: null
      };
    }

    const rawEc = std.targetEc ?? std.supplyEc;
    const rawPh = std.targetPh ?? std.supplyPh;
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

    // 배액율 계산 = 배액량(mL) / 1000 / 24h 총급액량(L) * 100
    let ratio = null;
    let ratioLevel = "none";
    const targetRate = parseFloat(std.drainRate) || null;
    const drainMl = parseFloat(r.drainAmount);

    const ss = supplySettings
      .filter((s) => {
        const ssLine = s.lineNo || s.line || "V01";
        return ssLine === recLine && s.settingDate <= r.measureDate;
      })
      .sort((a, b) => b.settingDate.localeCompare(a.settingDate))[0];

    const events = parseFloat(r.supplyEvents);
    if (ss && events > 0 && !isNaN(drainMl) && drainMl > 0) {
      const perEventL = (parseFloat(ss.minutesPerEvent) / 60) * parseFloat(ss.flowRatePerBag);
      const dailyL = perEventL * events;
      if (dailyL > 0) {
        ratio = ((drainMl / 1000) / dailyL) * 100;
        if (targetRate) {
          const ad = Math.abs(ratio - targetRate);
          ratioLevel = ad <= 10 ? "ok" : ad <= 20 ? "warn" : "danger";
        }
      }
    }

    const ratioColor =
      ratioLevel === "ok" ? "#2e7d32" : ratioLevel === "warn" ? "#ef6c00" : ratioLevel === "danger" ? "#c62828" : "#999";

    return {
      level,
      ecDev,
      phDev,
      supEc: formatEc(rawEc),
      supPh: formatPh(rawPh),
      statusText: level === "danger" ? "🚨 경고" : level === "warn" ? "⚠️ 주의" : "✅ 정상",
      statusColor: level === "danger" ? "#c62828" : level === "warn" ? "#ef6c00" : "#2e7d32",
      ratio: ratio === null ? null : Math.round(ratio * 10) / 10,
      ratioColor,
      targetRate,
      supplyCount: events || null
    };
  }

  // ==========================================================
  // ✅ 생육 단계 & 진행률 계산 유틸
  // ==========================================================
  function getGrowthStage(days) {
    if (days < 0) return { name: "정식준비", color: "#666", bg: "#f5f5f5" };
    if (days <= 30) return { name: "활착기", color: "#2e7d32", bg: "#e8f5e9" };
    if (days <= 60) return { name: "생육기", color: "#ed6c02", bg: "#fff3e0" };
    if (days <= 120) return { name: "초기수확기", color: "#d32f2f", bg: "#ffebee" };
    if (days <= 180) return { name: "수확중기", color: "#7b1fa2", bg: "#f3e5f5" };
    return { name: "수확후기", color: "#1976d2", bg: "#e3f2fd" };
  }

  function calcFarmProgress(plantingDateStr, endDateStr) {
    if (!plantingDateStr || !endDateStr) {
      return { daysText: "정식일 설정 필요", stage: { name: "-", color: "#888", bg: "#f5f5f5" }, rate: 0, days: 0 };
    }
    const today = startOfDay(new Date());
    const pd = startOfDay(plantingDateStr);
    const ed = startOfDay(endDateStr);
    const days = Math.round((today - pd) / 86400000);
    const daysText = days >= 0 ? `D+${days}` : `D${days}`;
    const totalDays = Math.round((ed - pd) / 86400000);
    const rate = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((days / totalDays) * 100))) : 0;
    return { daysText, stage: getGrowthStage(days), rate, days };
  }

  // ==========================================================
  // ✅ 초기화
  // ==========================================================
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function initCommon() {
    injectLayout();
    bindSidebarEvents();
    setActiveMenu();
    updateUserInfo();
    loadWeather();
    loadFarmName();
  }

  // ==========================================================
  // ✅ 전역 노출
  // ==========================================================
  Object.assign(window, {
    FIREBASE_CONFIG,
    initFirebaseIfNeeded,
    getDocData,
    checkAuth,
    getRoleName,
    normalizeRole,
    applyMenuPermissions,
    updateUserInfo,
    setActiveMenu,
    loadFarmName,
    loadWeather,
    refreshFarmInfo: () => loadFarmName(true),
    refreshWeather: () => loadWeather(true),
    invalidateFarmCache: () => removeCache(FARM_CACHE_KEY),
    invalidateWeatherCache: () => removeCache(WEATHER_CACHE_KEY),
    calcDrainStatus,
    getGrowthStage,
    calcFarmProgress,
    toLocalYmd,
    formatDateYmd,
    formatNum2,
    formatEc,
    formatPh,
    qs,
    qsa
  });

  onReady(initCommon);
})();

// ✅ 선택 텍스트 드래그(끌기) 차단 — 페이지 멈춤 방지
document.addEventListener("dragstart", function (e) {
  e.preventDefault();
});