// ==========================================================
// ✅ Firebase 공통 설정
// ==========================================================
const firebaseConfig = {
  apiKey: "AIzaSyCfcMVOOn3l1XbUnp6yezqHPdHjAysA79k",
  authDomain: "smartfarm-drainage-system.firebaseapp.com",
  projectId: "smartfarm-drainage-system",
  storageBucket: "smartfarm-drainage-system.firebasestorage.app",
  messagingSenderId: "699907108321",
  appId: "1:699907108321:web:b71e0ed0d3df141c7836a0",
  measurementId: "G-W7L21Y8JZN"
};

let db = null;
let farmInfoLoaded = false;

// ✅ Firebase 초기화
async function initFirebaseIfNeeded() {
  if (db) return db;
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("✅ Firebase 초기화 완료");
    return db;
  } catch (e) {
    console.error("❌ Firebase 초기화 실패:", e);
    return null;
  }
}

// ==========================================================
// ✅ 사이드바 기본 기능
// ==========================================================
window.toggleSidebar = function () {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar && overlay) {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  }
};

window.logout = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("userRole");
  location.href = "index.html";
};

function checkAuth(allowRoles = ["admin", "manager", "worker", "guest"]) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const userRole = localStorage.getItem("userRole") || "";
  if (!user || !user.userId || !userRole) {
    location.href = "index.html";
    return null;
  }
  if (!allowRoles.includes(userRole)) {
    const noPermitArea = document.getElementById("noPermitArea");
    const adminArea = document.getElementById("adminArea");
    if (noPermitArea) noPermitArea.style.display = "block";
    if (adminArea) adminArea.style.display = "none";
    return null;
  }
  if (document.getElementById("adminArea")) {
    document.getElementById("adminArea").style.display = "block";
  }
  return { user, userRole };
}

function setActiveMenu(pageName) {
  document.querySelectorAll(".sidebar-menu a").forEach(a => {
    a.classList.remove("active");
    if (a.href.includes(pageName)) {
      a.classList.add("active");
    }
  });
}

// ==========================================================
// ✅ 농장명 / 시즌명 / 경과일 → 페이지 상단에 표시
// ==========================================================
async function loadFarmName() {
  if (farmInfoLoaded) return;
  try {
    const database = await initFirebaseIfNeeded();
    if (!database) return;

    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    const snap = await getDoc(doc(database, "settings", "current"));

    if (snap.exists()) {
      const farm = snap.data();
      console.log("✅ 불러온 농장정보:", farm);

      // ✅ 페이지 상단에 표시
      const titleEl = document.getElementById("pageTitleText");
      const subEl = document.getElementById("farmSubTitle");

      if (titleEl && farm.farmName) {
        titleEl.textContent = farm.farmName;
      }

      // ✅ 시즌명 + 정식후 경과일
      if (subEl) {
        let subText = "배액관리 시스템";
        if (farm.season) subText = farm.season + " · " + subText;

        if (farm.plantingDate) {
          const today = new Date(); today.setHours(0,0,0,0);
          const pd = new Date(farm.plantingDate); pd.setHours(0,0,0,0);
          const days = Math.round((today - pd) / (1000*60*60*24));
          const daysText = days >= 0 ? `정식후 D+${days}` : `정식예정 D${days}`;
          subText = subText + " · " + daysText;
        }
        subEl.textContent = subText;
      }
      farmInfoLoaded = true;
    } else {
      console.log("⚠️ settings/current 문서 없음 → 농장설정에서 저장하세요");
    }
  } catch (e) {
    console.error("❌ 농장정보 불러오기 오류:", e);
  }
}

// ==========================================================
// ✅ 날씨 불러오기 (테이블 구조 유지형)
// ==========================================================
async function loadWeather() {
  const box = document.getElementById("weatherBox");
  if (!box) return;

  const DEFAULT_LAT = 37.6389;
  const DEFAULT_LON = 127.0267;

  try {
    // 최저/최고 기온까지 가져오기 위해 daily 파라미터 추가
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LAT}&longitude=${DEFAULT_LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API 오류");
    
    const data = await res.json();
    const cur = data.current;
    const daily = data.daily;
    const info = getWeatherInfo(cur.weather_code);
    
    const temp = Math.round(cur.temperature_2m * 10) / 10;
    const minTemp = Math.round(daily.temperature_2m_min[0]);
    const maxTemp = Math.round(daily.temperature_2m_max[0]);

    // HTML 내부 요소를 개별적으로 찾아서 값만 안전하게 업데이트 (테이블 유지)
    const elIcon = document.getElementById("weatherIcon");
    const elTemp = document.getElementById("weatherTemp");
    const elDesc = document.getElementById("weatherDesc");
    const elRange = document.getElementById("weatherRange");

    if (elIcon) elIcon.textContent = info.icon;
    if (elTemp) elTemp.textContent = `${temp}°`;
    if (elDesc) elDesc.textContent = info.desc;
    if (elRange) elRange.textContent = `최저 ${minTemp}° / 최고 ${maxTemp}°`;

  } catch (e) {
    console.error("❌ 날씨 불러오기 실패:", e);
    const elDesc = document.getElementById("weatherDesc");
    if (elDesc) elDesc.textContent = "날씨 확인불가";
  }
}

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

// ==========================================================
// ✅ 페이지 로드시 실행
// ==========================================================
window.addEventListener("load", () => {
  setTimeout(() => {
    loadWeather();
    loadFarmName();
  }, 300);
});