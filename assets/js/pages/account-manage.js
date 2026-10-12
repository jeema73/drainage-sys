(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  let allAccounts = [];

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

  async function loadAccounts() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, "accounts"));
      allAccounts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderList();
    } catch (e) {
      console.error("계정 목록 로드 실패:", e);
    }
  }

  function renderList() {
    const tb = document.getElementById("listBody");
    if (!tb) return;
    if (!allAccounts.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-box">등록된 계정이 없습니다.</td></tr>`;
      return;
    }

    const currentUserId = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("user"));
        return u ? u.userId : "";
      } catch {
        return "";
      }
    })();

    tb.innerHTML = allAccounts.map((a) => {
      const isMe = a.userId === currentUserId;
      const roleBadge = window.getRoleName ? window.getRoleName(a.userRole) : a.userRole;

      return `
        <tr>
          <td><strong>${a.userId}</strong> ${isMe ? '<span style="font-size:9px;color:#1976d2;">(본인)</span>' : ""}</td>
          <td>${a.userName || "-"}</td>
          <td>${roleBadge}</td>
          <td>${a.userNote || "-"}</td>
          <td class="action-btns">
            <button class="btn-sm btn-primary" onclick="editAccount('${a.id}')">수정</button>
            <button class="btn-sm btn-danger" onclick="deleteAccount('${a.id}')" ${isMe ? "disabled title='본인 계정은 삭제할 수 없습니다'" : ""}>삭제</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function saveAccount() {
    const userId = document.getElementById("userId").value.trim();
    const userPw = document.getElementById("userPw").value;
    const userName = document.getElementById("userName").value.trim();
    const userRole = document.getElementById("userRole").value;
    const userNote = document.getElementById("userNote").value.trim();
    const editId = document.getElementById("editId").value;

    if (!userId) return alert("아이디를 입력하세요!");
    if (!userName) return alert("사용자명을 입력하세요!");
    if (!editId && (!userPw || userPw.length < 4)) return alert("비밀번호를 4자 이상 입력하세요!");

    const database = await ensureDb();
    if (!database) return;
    const { collection, doc, addDoc, setDoc, getDocs, query, where } = await getFs();

    try {
      if (!editId) {
        const q = query(collection(database, "accounts"), where("userId", "==", userId));
        const dupSnap = await getDocs(q);
        if (!dupSnap.empty) return alert("이미 사용 중인 아이디입니다.");
      }

      const data = {
        userId,
        userName,
        userRole,
        userNote,
        updatedAt: new Date().toISOString()
      };
      if (userPw) data.userPw = userPw;

      if (editId) {
        await setDoc(doc(database, "accounts", editId), data, { merge: true });
        alert("✅ 계정이 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "accounts"), data);
        alert("✅ 계정이 등록되었습니다!");
      }
      resetForm();
      await loadAccounts();
    } catch (e) {
      alert("❌ 오류: " + e.message);
    }
  }

  function editAccount(id) {
    const a = allAccounts.find((x) => x.id === id);
    if (!a) return;
    document.getElementById("editId").value = id;
    document.getElementById("userId").value = a.userId;
    document.getElementById("userPw").value = "";
    document.getElementById("userPw").placeholder = "변경 시에만 입력";
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

  async function init() {
    const auth = window.checkAuth ? window.checkAuth(["admin"]) : null;
    if (!auth) return;

    await loadAccounts();
  }

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