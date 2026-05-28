(() => {
  const cfg = {
    siteCode: 'siteBuilder',
    displayName: 'Site Builder',
    siteRelativePath: '/sites/siteBuilder',
    helperUrl: window.location.href,
    files: [],
    ...(window.SITE_BUILDER_EXPORT_HELPER_CONFIG || {}),
  };

  const state = {
    results: [],
    checked: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const statusEl = $('#status');
  const filesEl = $('#files');
  const summaryEl = $('#summary');
  const downloadBtn = $('#downloadBtn');
  const checkBtn = $('#checkBtn');

  const encoder = new TextEncoder();
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const normalizePath = (value) => {
    const raw = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/g, '');
    return raw.startsWith('/') ? raw : `/${raw}`;
  };

  const setStatus = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const bytes = (text) => encoder.encode(String(text || '')).byteLength;

  const toHex = (buffer) => [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  async function sha256Text(text) {
    if (!window.crypto?.subtle) return '';
    const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(String(text || '')));
    return toHex(digest);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
    }
    return value;
  }

  function recordCountFor(file, data) {
    if (file.mode === 'list') return Array.isArray(data) ? data.length : null;
    if (file.mode === 'list-with-settings') {
      return Array.isArray(data?.[file.listProperty]) ? data[file.listProperty].length : null;
    }
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === 'object') {
      const nestedCount = Object.values(data)
        .filter((value) => Array.isArray(value))
        .reduce((sum, value) => sum + value.length, 0);
      return nestedCount || 1;
    }
    return null;
  }

  async function validateFile(file, response, text) {
    const sizeBytes = bytes(text);
    const result = {
      ...file,
      serverRelativePath: normalizePath(file.serverRelativePath),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      sizeBytes,
      sha256: response.ok ? await sha256Text(text) : null,
      jsonSha256: null,
      parseStatus: response.ok ? 'unknown' : 'missing',
      recordCount: null,
      text: response.ok ? text : '',
      warnings: [],
      error: '',
    };

    if (!response.ok) {
      result.error = text.slice(0, 500);
      return result;
    }

    if (!String(text || '').trim()) {
      result.parseStatus = 'empty';
      result.error = 'File is empty';
      return result;
    }

    try {
      const data = JSON.parse(text);
      result.parseStatus = 'valid';
      result.jsonSha256 = await sha256Text(JSON.stringify(canonicalize(data)));
      result.recordCount = recordCountFor(file, data);
      if (file.rootType === 'array' && !Array.isArray(data)) {
        result.warnings.push('Expected array root');
      }
      if (file.rootType === 'object' && (data === null || typeof data !== 'object' || Array.isArray(data))) {
        result.warnings.push('Expected object root');
      }
      if (file.mode === 'list-with-settings' && !Array.isArray(data?.[file.listProperty])) {
        result.warnings.push(`Expected "${file.listProperty}" array`);
      }
    } catch (error) {
      result.parseStatus = 'invalid-json';
      result.error = error.message;
    }

    return result;
  }

  async function fetchFile(file) {
    const response = await fetch(normalizePath(file.serverRelativePath), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/plain, */*' },
    });
    const text = await response.text();
    return validateFile(file, response, text);
  }

  function statusLabel(file) {
    if (!file.ok) return 'חסר';
    if (file.parseStatus === 'valid' && file.warnings.length === 0) return 'תקין';
    if (file.parseStatus === 'valid') return 'אזהרה';
    if (file.parseStatus === 'empty') return 'ריק';
    if (file.parseStatus === 'invalid-json') return 'JSON לא תקין';
    return 'לא נבדק';
  }

  function renderFiles(results = state.results) {
    const rows = (results.length > 0 ? results : cfg.files).map((file) => {
      const checked = Boolean(file.parseStatus);
      const status = checked ? statusLabel(file) : 'ממתין';
      const tone = !checked ? 'idle' : (!file.ok || file.parseStatus === 'empty' || file.parseStatus === 'invalid-json' ? 'bad' : (file.warnings?.length ? 'warn' : 'good'));
      const detail = checked
        ? `${file.sizeBytes ?? 0} bytes · ${file.recordCount ?? 'n/a'} records`
        : normalizePath(file.serverRelativePath);
      return `
        <li class="file-row" data-tone="${tone}">
          <div>
            <strong>${escapeHtml(file.fileName)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
          <span>${escapeHtml(status)}</span>
        </li>
      `;
    }).join('');
    filesEl.innerHTML = rows;
  }

  function buildSummary(results) {
    const missing = results.filter((file) => !file.ok);
    const empty = results.filter((file) => file.parseStatus === 'empty');
    const invalid = results.filter((file) => file.parseStatus === 'invalid-json');
    const warnings = results.filter((file) => file.warnings?.length > 0);
    const valid = results.filter((file) => file.parseStatus === 'valid');
    const safe = missing.length === 0 && empty.length === 0 && invalid.length === 0;
    return {
      safe,
      status: safe ? (warnings.length ? 'WARNING' : 'PASS') : 'FAIL',
      validCount: valid.length,
      missing: missing.map((file) => file.fileName),
      empty: empty.map((file) => file.fileName),
      invalid: invalid.map((file) => file.fileName),
      warnings: warnings.flatMap((file) => file.warnings.map((warning) => `${file.fileName}: ${warning}`)),
    };
  }

  function renderSummary(summary) {
    const safeList = (items) => items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>אין</li>';
    summaryEl.innerHTML = `
      <h2>סיכום בדיקה: ${escapeHtml(summary.status)}</h2>
      <p>${summary.validCount} מתוך ${cfg.files.length} קבצים נקראו כ-JSON תקין.</p>
      <div class="summary-grid">
        <section><h3>חסרים</h3><ul>${safeList(summary.missing)}</ul></section>
        <section><h3>ריקים</h3><ul>${safeList(summary.empty)}</ul></section>
        <section><h3>JSON לא תקין</h3><ul>${safeList(summary.invalid)}</ul></section>
        <section><h3>אזהרות</h3><ul>${safeList(summary.warnings)}</ul></section>
      </div>
    `;
  }

  async function checkAll() {
    setStatus('קורא קבצי TXT מ-SharePoint במצב קריאה בלבד...', 'info');
    downloadBtn.disabled = true;
    state.results = [];
    renderFiles();
    for (const file of cfg.files) {
      try {
        const result = await fetchFile(file);
        state.results.push(result);
      } catch (error) {
        state.results.push({
          ...file,
          ok: false,
          status: 0,
          statusText: 'Network error',
          sizeBytes: 0,
          sha256: null,
          jsonSha256: null,
          parseStatus: 'missing',
          recordCount: null,
          text: '',
          warnings: [],
          error: error.message,
        });
      }
      renderFiles();
    }
    state.checked = true;
    const summary = buildSummary(state.results);
    renderSummary(summary);
    downloadBtn.disabled = false;
    setStatus(summary.safe ? 'הבדיקה הושלמה. אפשר להוריד artifact מקומי.' : 'הבדיקה הושלמה עם שגיאות. הורד רק אם תרצה לבדוק מקומית.', summary.safe ? 'good' : 'warn');
  }

  function buildReport(summary) {
    return [
      '# SharePoint Hosted Export Helper Report',
      '',
      `Status: ${summary.status}`,
      `Site code: ${cfg.siteCode}`,
      `Created at: ${new Date().toISOString()}`,
      '',
      `Missing: ${summary.missing.join(', ') || 'None'}`,
      `Empty: ${summary.empty.join(', ') || 'None'}`,
      `Invalid JSON: ${summary.invalid.join(', ') || 'None'}`,
      `Warnings: ${summary.warnings.join(', ') || 'None'}`,
      '',
    ].join('\n');
  }

  function downloadArtifact() {
    const results = state.checked ? state.results : [];
    const summary = buildSummary(results);
    const validObjects = results
      .filter((file) => file.parseStatus === 'valid')
      .map((file) => ({
        key: file.serverRelativePath,
        fileName: file.fileName,
        mappingKey: file.key,
        data: JSON.parse(file.text),
        sha256: file.sha256,
        jsonSha256: file.jsonSha256,
        sizeBytes: file.sizeBytes,
        recordCount: file.recordCount,
      }));
    const createdAt = new Date().toISOString();
    const withoutRawText = (file) => {
      const entry = { ...file };
      delete entry.text;
      return entry;
    };
    const legacyObjects = {
      createdAt,
      siteCode: cfg.siteCode,
      sourceMode: 'sharepoint-hosted-helper',
      objects: validObjects,
    };
    const payload = {
      kind: 'site-builder-closed-sharepoint-hosted-export',
      createdAt,
      siteCode: cfg.siteCode,
      displayName: cfg.displayName,
      siteRelativePath: cfg.siteRelativePath,
      helperUrl: cfg.helperUrl,
      sourceUrl: window.location.href,
      readOnly: true,
      safeForMongoDryRun: summary.safe,
      summary,
      manifest: {
        createdAt,
        siteCode: cfg.siteCode,
        displayName: cfg.displayName,
        siteRelativePath: cfg.siteRelativePath,
        helperUrl: cfg.helperUrl,
        sourceUrl: window.location.href,
        readOnly: true,
        safeForMongoDryRun: summary.safe,
        files: results.map(withoutRawText),
        summary,
      },
      files: results,
      reportMarkdown: buildReport(summary),
      report: {
        markdown: buildReport(summary),
      },
      raw: Object.fromEntries(results.map((file) => [file.fileName, file.text || ''])),
      legacyObjects,
      normalized: {
        'legacy-objects.json': legacyObjects,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `site-builder-sharepoint-hosted-export-${cfg.siteCode.replace(/[^a-z0-9_-]+/gi, '_')}-${createdAt.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function init() {
    $('#siteCode').textContent = cfg.siteCode;
    $('#displayName').textContent = cfg.displayName || cfg.siteCode;
    $('#sitePath').textContent = cfg.siteRelativePath;
    renderFiles([]);
    checkBtn.addEventListener('click', checkAll);
    downloadBtn.addEventListener('click', downloadArtifact);
    setStatus('מוכן לבדיקה. הדף קורא בלבד ולא כותב ל-SharePoint.', 'info');
  }

  init();
})();
