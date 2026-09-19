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
  // ✅ 캐시 설정
  // ==========================================================
  const WEATHER_CACHE_KEY = "sb_weather_cache_v1";
  const FARM_CACHE_KEY = "sb_farm_cache_v1";

  const WEATHER_TTL = 10 * 60 * 1000; // 10분
  const FARM_TTL = 5 * 60 * 1000; // 5분

  const WEATHER_DEFAULT = {
    lat: 37.6389,
    lon: 127.0267
  };

  // ==========================================================
  // ✅ 내부 상태
  // ==========================================================
  let db = null;
  let firestoreModule = null;
  let farmInfoLoaded = false;
  let weatherPromise = null;
  let farmPromise = null;

  // ==========================================================
  // ✅ 유틸
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
      // sessionStorage 실패해도 무시
    }
  };

  const removeCache = (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // 무시
    }
  };

  const startOfDay = (value) => {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    if (Number.isNaN(d.getTime())) {
      return new Date();
    }

    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getDayDiff = (baseDate, targetDate = new Date()) => {
    const a = startOfDay(baseDate);
    const b = startOfDay(targetDate);
    return Math.round((b - a) / 86400000);
  };

  // ==========================================================
  // ✅ Firebase / Firestore
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

      console.log("✅ Firebase 초기화 완료");
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
      const snap = await fireModule.getDoc(
        fireModule.doc(database, ...pathSegments)
      );

      return snap.exists() ? snap.data() : null;
    } catch (error) {
      console.error("❌ Firestore 문서 조회 실패:", error);
      return null;
    }
  }

  // ==========================================================
  // ✅ 권한/인증
  // ==========================================================
  const ROLE_ALIAS = {
    admin: "admin",
    최고관리자: "admin",
    manager: "manager",
    매니저: "manager",
    worker: "worker",
    공공근로자: "worker",
    guest: "guest",
    게스트: "guest"
  };

  function normalizeRole(role) {
    const raw = String(role || "").trim();
    if (!raw) return "";

    return ROLE_ALIAS[raw] || ROLE_ALIAS[raw.toLowerCase()] || raw;
  }

  function checkAuth(allowRoles = ["admin", "manager", "worker", "guest"]) {
    const user = safeJsonParse(localStorage.getItem("user"), null);
    const rawRole = String(localStorage.getItem("userRole") || "").trim();
    const normalizedRole = normalizeRole(rawRole);

    // 로그인 정보 없음
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
    const adminArea = qs("#adminArea");

    if (!allowed) {
      if (noPermitArea) noPermitArea.style.display = "block";
      if (adminArea) adminArea.style.display = "none";
      return null;
    }

    if (noPermitArea) noPermitArea.style.display = "none";
    if (adminArea) adminArea.style.display = "block";

    return {
      user,
      userRole: rawRole,
      normalizedRole
    };
  }

  function setActiveMenu(pageName) {
    const currentPage = String(
      pageName || location.pathname.split("/").pop() || "dashboard.html"
    ).split(/[?#]/)[0];

    qsa(".sidebar-menu a").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const linkPage = href.split(/[?#]/)[0].split("/").pop();

      const isActive =
        linkPage === currentPage || anchor.href.includes(currentPage);

      anchor.classList.toggle("active", isActive);
    });
  }

  // ==========================================================
  // ✅ 사이드바
  // ==========================================================
  window.toggleSidebar = function toggleSidebar(force) {
    const sidebar = qs("#sidebar");
    const overlay = qs("#overlay");

    if (!sidebar) return;

    const willOpen =
      typeof force === "boolean"
        ? force
        : !sidebar.classList.contains("open");

    sidebar.classList.toggle("open", willOpen);

    if (overlay) {
      overlay.classList.toggle("show", willOpen);
    }

    document.body.classList.toggle("sidebar-open", willOpen);

    sidebar.setAttribute("aria-hidden", String(!willOpen));
  };

  function bindSidebar() {
    const overlay = qs("#overlay");

    if (overlay && !overlay.dataset.bound) {
      overlay.addEventListener("click", () => {
        window.toggleSidebar(false);
      });
      overlay.dataset.bound = "1";
    }

    if (!document.body.dataset.sidebarEscBound) {
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          window.toggleSidebar(false);
        }
      });

      document.body.dataset.sidebarEscBound = "1";
    }
  }

  // ==========================================================
  // ✅ 로그아웃
  // ==========================================================
  window.logout = function logout(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    localStorage.removeItem("user");
    localStorage.removeItem("userRole");

    removeCache(FARM_CACHE_KEY);
    removeCache(WEATHER_CACHE_KEY);

    location.href = "index.html";
  };

  // ==========================================================
  // ✅ 농장정보
  // ==========================================================
  function renderFarmInfo(farm) {
    if (!farm || typeof farm !== "object") return;

    setText("#pageTitleText", farm.farmName || "");

    const subEl = qs("#farmSubTitle");

    if (subEl) {
      let subText = "배액관리 시스템";

      if (farm.season) {
        subText = `${farm.season} · ${subText}`;
      }

      if (farm.plantingDate) {
        const days = getDayDiff(farm.plantingDate);
        const daysText = days >= 0 ? `정식후 D+${days}` : `정식예정 D${days}`;
        subText += ` · ${daysText}`;
      }

      subEl.textContent = subText;
    }
  }

  async function loadFarmName(force = false) {
    if (farmInfoLoaded && !force) return;

    if (!force && farmPromise) {
      return farmPromise;
    }

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
          return;
        }

        console.log("⚠️ settings/current 문서 없음 → 농장설정에서 저장하세요");
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
  // ✅ 날씨
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
  }

  async function loadWeather(force = false) {
    const weatherBox = qs("#weatherBox");
    if (!weatherBox) return;

    if (!force && weatherPromise) {
      return weatherPromise;
    }

    const cachedWeather = getCache(WEATHER_CACHE_KEY);

    if (!force && cachedWeather) {
      renderWeather(cachedWeather);
      return;
    }

    weatherPromise = (async () => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${WEATHER_DEFAULT.lat}` +
          `&longitude=${WEATHER_DEFAULT.lon}` +
          `&current=temperature_2m,weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min` +
          `&timezone=Asia%2FSeoul` +
          `&forecast_days=1`;

        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`날씨 API HTTP ${response.status}`);
        }

        const data = await response.json();

        const current = data.current || {};
        const daily = data.daily || {};

        const weatherInfo = getWeatherInfo(current.weather_code);

        const temp =
          Math.round((Number(current.temperature_2m) || 0) * 10) / 10;

        const minTemp = Math.round(Number(daily.temperature_2m_min?.[0]) || 0);
        const maxTemp = Math.round(Number(daily.temperature_2m_max?.[0]) || 0);

        const payload = {
          icon: weatherInfo.icon,
          temp: `${temp}°`,
          desc: weatherInfo.desc,
          range: `최저 ${minTemp}° / 최고 ${maxTemp}°`,
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
          range: "최저 --° / 최고 --°"
        });
      } finally {
        weatherPromise = null;
      }
    })();

    return weatherPromise;
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
    bindSidebar();
    setActiveMenu();
    loadWeather();
    loadFarmName();
  }

  // ==========================================================
  // ✅ 전역 노출
  // ==========================================================
  Object.assign(window, {
    initFirebaseIfNeeded,
    getDocData,
    checkAuth,
    setActiveMenu,
    loadFarmName,
    loadWeather,
    refreshFarmInfo: () => loadFarmName(true),
    refreshWeather: () => loadWeather(true),
    invalidateFarmCache: () => removeCache(FARM_CACHE_KEY),
    invalidateWeatherCache: () => removeCache(WEATHER_CACHE_KEY),
    qs,
    qsa
  });

  onReady(initCommon);
})();

// ✅ 선택 텍스트 드래그(끌기) 차단 — 페이지 멈춤 방지
document.addEventListener("dragstart", function (e) {
  e.preventDefault();
});