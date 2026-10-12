(() => {
  "use strict";

  let db = null;
  let fsMod = null;
  let allZones = [];

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

  async function loadZones() {
    const database = await ensureDb();
    if (!database) return;
    const { collection, getDocs } = await getFs();
    try {
      const snap = await getDocs(collection(database, "zones"));
      allZones = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(zoneCompare);
      renderList();
    } catch (e) {
      console.error("구역목록 불러오기 오류", e);
    }
  }

  function renderList() {
    const tb = document.getElementById("listBody");
    if (!tb) return;
    if (!allZones.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-box">등록된 구역이 없습니다.</td></tr>`;
      return;
    }
    tb.innerHTML = allZones.map((z) => `
      <tr>
        <td><strong>${z.zoneName}</strong></td>
        <td>${z.line || "V01"}</td>
        <td>${z.hasSampleData ? "✅ 측정" : "-"}</td>
        <td>${z.remark || "-"}</td>
        <td class="action-btns">
          <button class="btn-sm btn-primary" onclick="editZone('${z.id}')">수정</button>
          <button class="btn-sm btn-danger" onclick="deleteZone('${z.id}')">삭제</button>
        </td>
      </tr>
    `).join("");
  }

  async function saveZone() {
    const zoneName = document.getElementById("zoneName").value.trim();
    const line = document.getElementById("line").value;
    const hasSampleData = document.getElementById("hasSampleData").checked;
    const remark = document.getElementById("remark").value.trim();
    const editId = document.getElementById("editId").value;

    if (!zoneName) return alert("구역명을 입력하세요!");

    const database = await ensureDb();
    if (!database) return;
    const { collection, doc, addDoc, setDoc } = await getFs();

    try {
      const data = {
        zoneName,
        line,
        hasSampleData,
        remark,
        updatedAt: new Date().toISOString()
      };

      if (editId) {
        await setDoc(doc(database, "zones", editId), data, { merge: true });
        alert("✅ 수정되었습니다!");
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(database, "zones"), data);
        alert("✅ 등록되었습니다!");
      }
      resetForm();
      await loadZones();
    } catch (e) {
      alert("❌ 오류: " + e.message);
    }
  }

  function editZone(id) {
    const z = allZones.find((x) => x.id === id);
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

  async function init() {
    const auth = window.checkAuth ? window.checkAuth(["admin", "manager"]) : null;
    if (!auth) return;

    await loadZones();
  }

  // HTML onclick용 전역 노출
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