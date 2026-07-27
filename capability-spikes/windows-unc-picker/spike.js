const DB_NAME = "site-builder-unc-capability-spike";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "pilot-root";
const RUNS_KEY = "site-builder-unc-capability-runs-v1";
const FORM_KEY = "site-builder-unc-capability-form-v1";
const RELOAD_MARKER = "site-builder-unc-capability-explicit-reload";
const READ_PERMISSION = Object.freeze({ mode: "read" });
const MAX_ENUMERATED_ENTRIES = 2_000;
const MAX_FILE_SEARCH_DEPTH = 4;

const elements = {
  allTabsResult: document.querySelector("#all-tabs-result"),
  caseHebrew: document.querySelector("#case-hebrew"),
  caseHostname: document.querySelector("#case-hostname"),
  caseNested: document.querySelector("#case-nested"),
  caseSpaces: document.querySelector("#case-spaces"),
  chromeVersion: document.querySelector("#chrome-version"),
  chromeVersionManual: document.querySelector("#chrome-version-manual"),
  currentResult: document.querySelector("#current-result"),
  downloadReport: document.querySelector("#download-report"),
  gateBadge: document.querySelector("#gate-badge"),
  gateDecision: document.querySelector("#gate-decision"),
  networkLocations: document.querySelector("#network-locations"),
  operatorNotes: document.querySelector("#operator-notes"),
  persistentOption: document.querySelector("#persistent-option"),
  pickDirectory: document.querySelector("#pick-directory"),
  platform: document.querySelector("#platform"),
  policyResult: document.querySelector("#policy-result"),
  reloadPage: document.querySelector("#reload-page"),
  requestPermission: document.querySelector("#request-permission"),
  runsTable: document.querySelector("#runs-table"),
  secureContext: document.querySelector("#secure-context"),
  storedHandle: document.querySelector("#stored-handle"),
  supportBadge: document.querySelector("#support-badge"),
  technicalLog: document.querySelector("#technical-log"),
  testStoredHandle: document.querySelector("#test-stored-handle"),
  testedPath: document.querySelector("#tested-path"),
  windowsVersion: document.querySelector("#windows-version"),
};

let storedHandle = null;
let currentRun = null;
const logLines = [];

function isoNow() {
  return new Date().toISOString();
}

function errorDetails(error) {
  if (error instanceof DOMException || error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error), name: "UnknownError" };
}

function log(event, details = {}) {
  const record = { at: isoNow(), event, ...details };
  logLines.push(record);
  elements.technicalLog.textContent = logLines.map((item) => JSON.stringify(item)).join("\n");
}

function setBadge(element, text, state = "neutral") {
  element.textContent = text;
  element.className = `badge ${state}`;
}

function setCheck(name, state, text) {
  const item = document.querySelector(`[data-check="${name}"]`);
  if (!item) return;
  item.classList.remove("pass", "fail", "warning");
  if (state !== "neutral") item.classList.add(state);
  item.querySelector("strong").textContent = text;
}

function showResult(message, state) {
  elements.currentResult.hidden = false;
  elements.currentResult.textContent = message;
  elements.currentResult.className = `result ${state}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE)) {
        database.createObjectStore(HANDLE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, mode);
      const store = transaction.objectStore(HANDLE_STORE);
      let result;

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));

      const request = operation(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function saveHandle(handle) {
  return withStore("readwrite", (store) =>
    store.put({
      id: HANDLE_KEY,
      handle,
      savedAt: isoNow(),
    }),
  );
}

function loadHandleRecord() {
  return withStore("readonly", (store) => store.get(HANDLE_KEY));
}

function loadRuns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRuns(runs) {
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-30)));
}

function persistForm() {
  const data = {
    allTabsResult: elements.allTabsResult.value,
    chromeVersionManual: elements.chromeVersionManual.value,
    networkLocations: elements.networkLocations.value,
    operatorNotes: elements.operatorNotes.value,
    persistentOption: elements.persistentOption.value,
    policyResult: elements.policyResult.value,
    testedPath: elements.testedPath.value,
    windowsVersion: elements.windowsVersion.value,
  };
  localStorage.setItem(FORM_KEY, JSON.stringify(data));
  renderGateDecision();
}

function restoreForm() {
  try {
    const data = JSON.parse(localStorage.getItem(FORM_KEY) || "{}");
    for (const [name, value] of Object.entries(data)) {
      if (name in elements && typeof value === "string") elements[name].value = value;
    }
  } catch {
    log("stored-form-invalid");
  }
}

async function getChromeVersion() {
  const userAgentData = navigator.userAgentData;
  if (userAgentData?.getHighEntropyValues) {
    try {
      const values = await userAgentData.getHighEntropyValues([
        "fullVersionList",
        "platformVersion",
      ]);
      const chrome = values.fullVersionList?.find((brand) =>
        /Google Chrome/i.test(brand.brand),
      );
      return {
        detectedChromeVersion: chrome?.version || "",
        detectedPlatformVersion: values.platformVersion || "",
      };
    } catch (error) {
      log("user-agent-high-entropy-failed", errorDetails(error));
    }
  }

  const fallback = navigator.userAgent.match(/(?:Chrome|CriOS)\/([0-9.]+)/i);
  return {
    detectedChromeVersion: fallback?.[1] || "",
    detectedPlatformVersion: "",
  };
}

async function enumerateDirectory(handle) {
  const entries = [];
  let visited = 0;
  for await (const entry of handle.values()) {
    visited += 1;
    if (entries.length < 40) entries.push({ kind: entry.kind, name: entry.name });
    if (visited >= MAX_ENUMERATED_ENTRIES) break;
  }
  return {
    entries,
    truncated: visited >= MAX_ENUMERATED_ENTRIES,
    visited,
  };
}

async function firstChildDirectory(handle) {
  for await (const entry of handle.values()) {
    if (entry.kind === "directory") {
      const childHandle = await handle.getDirectoryHandle(entry.name, { create: false });
      return { handle: childHandle, name: entry.name };
    }
  }
  return null;
}

async function firstFileMetadata(handle, path = [], depth = 0, budget = { visited: 0 }) {
  if (depth > MAX_FILE_SEARCH_DEPTH || budget.visited >= MAX_ENUMERATED_ENTRIES) return null;

  const childDirectories = [];
  for await (const entry of handle.values()) {
    budget.visited += 1;
    if (budget.visited >= MAX_ENUMERATED_ENTRIES) return null;

    if (entry.kind === "file") {
      const fileHandle = await handle.getFileHandle(entry.name, { create: false });
      const file = await fileHandle.getFile();
      return {
        lastModified: file.lastModified,
        lastModifiedIso: new Date(file.lastModified).toISOString(),
        name: file.name,
        relativePath: [...path, file.name],
        size: file.size,
        type: file.type,
      };
    }

    if (entry.kind === "directory") childDirectories.push(entry.name);
  }

  for (const childName of childDirectories) {
    const childHandle = await handle.getDirectoryHandle(childName, { create: false });
    const found = await firstFileMetadata(
      childHandle,
      [...path, childName],
      depth + 1,
      budget,
    );
    if (found) return found;
  }
  return null;
}

async function queryReadPermission(handle) {
  if (typeof handle?.queryPermission !== "function") {
    throw new Error("queryPermission() is unavailable on the stored handle.");
  }
  return handle.queryPermission(READ_PERMISSION);
}

function currentCaseFlags() {
  return {
    hebrew: elements.caseHebrew.checked,
    hostname: elements.caseHostname.checked,
    nested: elements.caseNested.checked,
    spaces: elements.caseSpaces.checked,
  };
}

function renderRuns() {
  const runs = loadRuns();
  elements.runsTable.replaceChildren();

  if (!runs.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "אין הרצות";
    row.append(cell);
    elements.runsTable.append(row);
    return;
  }

  for (const run of [...runs].reverse()) {
    const row = document.createElement("tr");
    const values = [
      new Date(run.completedAt || run.startedAt).toLocaleString("he-IL"),
      run.handleName || "—",
      run.documentedPath || "—",
      run.passed ? "עבר" : `נכשל: ${run.failure?.name || "שגיאה"}`,
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    elements.runsTable.append(row);
  }
}

function pilotCoverage(runs) {
  return runs.reduce(
    (coverage, run) => {
      if (!run.passed) return coverage;
      for (const key of Object.keys(coverage)) {
        coverage[key] ||= Boolean(run.caseFlags?.[key]);
      }
      return coverage;
    },
    { hebrew: false, hostname: false, nested: false, spaces: false },
  );
}

function renderGateDecision() {
  const runs = loadRuns();
  const coverage = pilotCoverage(runs);
  const operationalPass = runs.some((run) => run.passed);
  const environmentComplete =
    Boolean(elements.windowsVersion.value.trim()) &&
    Boolean(elements.chromeVersionManual.value.trim() || elements.chromeVersion.textContent !== "לא זוהה") &&
    Boolean(elements.networkLocations.value) &&
    Boolean(elements.persistentOption.value) &&
    Boolean(elements.allTabsResult.value) &&
    Boolean(elements.policyResult.value);
  const coverageComplete = Object.values(coverage).every(Boolean);
  const policyAllowed = elements.policyResult.value === "allowed";
  const reopenWorked = ["granted", "prompt"].includes(elements.allTabsResult.value);

  let text = "אין עדיין ראיות מספיקות לקבלת החלטה.";
  let state = "neutral";

  if (elements.policyResult.value === "blocked" || elements.networkLocations.value === "no") {
    text =
      "BLOCKED — הבורר או מדיניות הארגון אינם מאפשרים את זרימת ה־UNC הנדרשת. אין להמשיך למימוש.";
    state = "fail";
  } else if (
    operationalPass &&
    coverageComplete &&
    environmentComplete &&
    policyAllowed &&
    reopenWorked
  ) {
    text =
      "PASS מועמד — כל בדיקות היכולת והכיסוי תועדו. יש לצרף צילומי מסך ולאשר ידנית לפני תחילת המימוש.";
    state = "pass";
  } else if (operationalPass) {
    const missing = [];
    if (!coverage.hostname) missing.push("UNC עם hostname");
    if (!coverage.spaces) missing.push("רווחים");
    if (!coverage.hebrew) missing.push("עברית");
    if (!coverage.nested) missing.push("תיקייה מקוננת");
    if (!environmentComplete) missing.push("תצפיות סביבתיות מלאות");
    text = `הבדיקה הטכנית עברה, אך ה־Gate עדיין פתוח. חסר: ${missing.join(", ") || "אישור ידני וצילומי מסך"}.`;
    state = "warning";
  }

  elements.gateDecision.textContent = text;
  elements.gateDecision.className = `decision ${state}`;
  setBadge(
    elements.gateBadge,
    state === "pass" ? "PASS מועמד" : state === "fail" ? "BLOCKED" : "Gate פתוח",
    state,
  );
}

async function runPickerTest() {
  for (const name of [
    "picker",
    "enumerate",
    "child",
    "metadata",
    "indexeddb",
    "permission",
  ]) {
    setCheck(name, "neutral", "ממתין");
  }

  currentRun = {
    caseFlags: currentCaseFlags(),
    documentedPath: elements.testedPath.value.trim(),
    startedAt: isoNow(),
  };
  elements.pickDirectory.disabled = true;
  showResult("Chrome ממתין לבחירת תיקייה…", "warning");
  log("picker-requested", {
    documentedPath: currentRun.documentedPath,
    mode: "read",
  });

  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    storedHandle = handle;
    currentRun.handleName = handle.name;
    setCheck("picker", "pass", `נבחרה “${handle.name}”`);
    log("picker-returned", { handleKind: handle.kind, handleName: handle.name });

    const enumeration = await enumerateDirectory(handle);
    currentRun.enumeration = enumeration;
    setCheck(
      "enumerate",
      "pass",
      `${enumeration.visited} פריטים${enumeration.truncated ? " (הופסק במגבלת בטיחות)" : ""}`,
    );
    log("directory-enumerated", enumeration);

    const child = await firstChildDirectory(handle);
    if (child) {
      currentRun.childDirectoryName = child.name;
      currentRun.childDirectoryCheck = "passed";
      setCheck("child", "pass", `נפתחה “${child.name}”`);
      log("child-directory-opened", { name: child.name });
    } else {
      currentRun.childDirectoryCheck = "skipped";
      setCheck("child", "warning", "לא נמצאה תיקיית משנה; הבדיקה דולגה");
      log("child-directory-skipped");
    }

    const metadata = await firstFileMetadata(handle);
    if (metadata) {
      currentRun.fileMetadata = metadata;
      currentRun.fileMetadataCheck = "passed";
      setCheck("metadata", "pass", `${metadata.name} · ${metadata.size} בייט`);
      log("file-metadata-read", metadata);
    } else {
      currentRun.fileMetadataCheck = "skipped";
      setCheck("metadata", "warning", "לא נמצא קובץ לדוגמה; בדיקת המטא־דאטה דולגה");
      log("file-metadata-skipped", {
        maxDepth: MAX_FILE_SEARCH_DEPTH,
        maxEntries: MAX_ENUMERATED_ENTRIES,
      });
    }

    await saveHandle(handle);
    setCheck("indexeddb", "pass", "נשמר");
    log("handle-saved-indexeddb", { handleName: handle.name });

    const permission = await queryReadPermission(handle);
    currentRun.permissionAfterPicker = permission;
    setCheck(
      "permission",
      permission === "granted" ? "pass" : "warning",
      permission,
    );
    log("permission-queried", { permission });

    currentRun.completedAt = isoNow();
    currentRun.passed = true;
    const runs = loadRuns();
    runs.push(currentRun);
    saveRuns(runs);
    showResult(
      "הבדיקה הטכנית עברה וה־handle נשמר. כעת לחצו “רענן ואמת שמירה”.",
      "pass",
    );
    elements.reloadPage.disabled = false;
    elements.requestPermission.disabled = false;
    elements.testStoredHandle.disabled = false;
    elements.storedHandle.textContent = `${handle.name} · ${permission}`;
  } catch (error) {
    const failure = errorDetails(error);
    currentRun.completedAt = isoNow();
    currentRun.failure = failure;
    currentRun.passed = false;
    const runs = loadRuns();
    runs.push(currentRun);
    saveRuns(runs);
    showResult(`הבדיקה נכשלה: ${failure.name} — ${failure.message}`, "fail");
    log("picker-test-failed", failure);

    const pendingCheck = [...document.querySelectorAll("#checks li")].find(
      (item) => item.querySelector("strong")?.textContent === "ממתין",
    );
    if (pendingCheck) {
      pendingCheck.classList.add("fail");
      pendingCheck.querySelector("strong").textContent = failure.name;
    }
  } finally {
    elements.pickDirectory.disabled = false;
    renderRuns();
    renderGateDecision();
  }
}

async function requestStoredPermission() {
  if (!storedHandle) return;
  try {
    const before = await queryReadPermission(storedHandle);
    const after =
      before === "granted"
        ? before
        : await storedHandle.requestPermission(READ_PERMISSION);
    setCheck("permission", after === "granted" ? "pass" : "fail", after);
    elements.storedHandle.textContent = `${storedHandle.name} · ${after}`;
    showResult(
      after === "granted"
        ? "הרשאת הקריאה זמינה."
        : "Chrome לא העניק הרשאת קריאה ל־handle השמור.",
      after === "granted" ? "pass" : "fail",
    );
    log("permission-requested-from-gesture", { after, before });
  } catch (error) {
    const failure = errorDetails(error);
    showResult(`בקשת ההרשאה נכשלה: ${failure.name} — ${failure.message}`, "fail");
    log("permission-request-failed", failure);
  }
}

async function testStoredDirectory() {
  if (!storedHandle) return;
  try {
    const permission = await queryReadPermission(storedHandle);
    if (permission !== "granted") {
      showResult(
        `מצב ההרשאה הוא “${permission}”. לחצו “בקש מחדש הרשאת קריאה” לפני הבדיקה.`,
        "warning",
      );
      log("stored-handle-test-needs-permission", { permission });
      return;
    }

    const enumeration = await enumerateDirectory(storedHandle);
    showResult(
      `ה־handle השמור נקרא בהצלחה: ${enumeration.visited} פריטים.`,
      "pass",
    );
    log("stored-handle-tested", { permission, ...enumeration });
  } catch (error) {
    const failure = errorDetails(error);
    showResult(`בדיקת ה־handle נכשלה: ${failure.name} — ${failure.message}`, "fail");
    log("stored-handle-test-failed", failure);
  }
}

function downloadReport() {
  persistForm();
  const report = {
    generatedAt: isoNow(),
    gateDecision: elements.gateDecision.textContent,
    environment: {
      chromeVersionDetected: elements.chromeVersion.dataset.detected || "",
      chromeVersionManual: elements.chromeVersionManual.value.trim(),
      isSecureContext,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      windowsVersion: elements.windowsVersion.value.trim(),
    },
    manualObservations: {
      allTabsResult: elements.allTabsResult.value,
      networkLocationsExposed: elements.networkLocations.value,
      notes: elements.operatorNotes.value.trim(),
      organizationPolicy: elements.policyResult.value,
      persistentPermissionOption: elements.persistentOption.value,
    },
    runs: loadRuns(),
    technicalLog: logLines,
  };
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `windows-unc-picker-pilot-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  log("report-downloaded");
}

async function initialize() {
  restoreForm();
  const supported =
    isSecureContext &&
    "showDirectoryPicker" in window &&
    "indexedDB" in window;

  elements.secureContext.textContent = isSecureContext ? "כן" : "לא";
  elements.platform.textContent = `${navigator.platform || "לא זוהה"} · ${navigator.userAgent}`;
  setBadge(
    elements.supportBadge,
    supported ? "ה־API זמין" : "ה־API אינו זמין",
    supported ? "pass" : "fail",
  );
  elements.pickDirectory.disabled = !supported;

  const versions = await getChromeVersion();
  elements.chromeVersion.textContent = versions.detectedChromeVersion || "לא זוהה";
  elements.chromeVersion.dataset.detected = versions.detectedChromeVersion;
  if (versions.detectedPlatformVersion) {
    elements.platform.textContent = `${navigator.platform} · ${versions.detectedPlatformVersion}`;
  }
  log("environment-detected", {
    ...versions,
    isSecureContext,
    platform: navigator.platform,
    supported,
    userAgent: navigator.userAgent,
  });

  if (!supported) {
    showResult(
      "נדרש Chrome התומך ב־File System Access API, בדף HTTPS או localhost.",
      "fail",
    );
  }

  try {
    const record = await loadHandleRecord();
    if (record?.handle) {
      storedHandle = record.handle;
      const permission = await queryReadPermission(storedHandle);
      elements.storedHandle.textContent = `${storedHandle.name} · ${permission}`;
      elements.reloadPage.disabled = false;
      elements.requestPermission.disabled = false;
      elements.testStoredHandle.disabled = false;
      log("stored-handle-retrieved", {
        handleName: storedHandle.name,
        permission,
        savedAt: record.savedAt,
      });

      if (sessionStorage.getItem(RELOAD_MARKER)) {
        sessionStorage.removeItem(RELOAD_MARKER);
        setCheck("reload", "pass", `נשלף · ${permission}`);
        showResult(
          `ה־handle “${storedHandle.name}” נשלף מ־IndexedDB לאחר רענון. הרשאה: ${permission}.`,
          permission === "denied" ? "fail" : "pass",
        );
        log("explicit-reload-verified", { permission });
      } else {
        setCheck("reload", "warning", `handle נמצא · ${permission}`);
      }
    } else {
      elements.storedHandle.textContent = "לא נמצא";
      log("stored-handle-missing");
    }
  } catch (error) {
    const failure = errorDetails(error);
    elements.storedHandle.textContent = `${failure.name}: ${failure.message}`;
    setCheck("indexeddb", "fail", failure.name);
    log("stored-handle-load-failed", failure);
  }

  renderRuns();
  renderGateDecision();
}

elements.pickDirectory.addEventListener("click", runPickerTest);
elements.reloadPage.addEventListener("click", () => {
  sessionStorage.setItem(RELOAD_MARKER, "1");
  location.reload();
});
elements.requestPermission.addEventListener("click", requestStoredPermission);
elements.testStoredHandle.addEventListener("click", testStoredDirectory);
elements.downloadReport.addEventListener("click", downloadReport);

for (const element of [
  elements.allTabsResult,
  elements.chromeVersionManual,
  elements.networkLocations,
  elements.operatorNotes,
  elements.persistentOption,
  elements.policyResult,
  elements.testedPath,
  elements.windowsVersion,
]) {
  element.addEventListener("change", persistForm);
}

initialize();
