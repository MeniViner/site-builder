# Critical Hydration Audit

## Scope
This audit statically traces the exact runtime path after:

- `ConfigProvider.jsx:117 [ConfigProvider] Init started...`
- `ConfigProvider.jsx:122 [ConfigProvider] Loaded config from adapter...`

and explains why hydration never leaves the full-screen spinner.

---

## 1. The Execution Trace (Line-by-Line)

### 1.1 Entry and Await Chain

### `src/context/ConfigProvider.jsx`
- **L107-159**: `loadConfig` is invoked from `useEffect`.
- **L117**: Logs `Init started...`.
- **L121**: `resolvedConfig = normalizeConfigSafely(await ConfigService.loadConfig());`
- **L122**: Logs `Loaded config from adapter...`.

### `src/services/ConfigService.js`
When `ConfigService.loadConfig()` runs:
- **L67**: `loaded = await this.adapter.load()`
- **L68**: `text = typeof loaded?.text === 'string' ? loaded.text : null`
- Branches:
1. `text === null || text.trim() === ''` -> **L71** returns normalized defaults.
2. `JSON.parse` success + schemaVersion `1.0.0` -> **L84** returns normalized parsed config.
3. parse fails -> **L74-77** logs parse error, returns defaults.
4. non-v1 schema -> **L87-89** migrates legacy and returns normalized config.
5. any adapter/load exception -> **L91-94** catches and returns defaults.

Result: by the time `ConfigProvider` prints `Loaded config from adapter...`, `ConfigService.loadConfig()` has already resolved successfully.

---

### 1.2 Post-Log Branching in `ConfigProvider`
After `Loaded config from adapter...`:

- **L123** computes:
  `loadedLooksDefault = JSON.stringify(resolvedConfig) === JSON.stringify(normalizeConfigSafely(DEFAULT_CONFIG_V1));`

- **L125-133** optional migration branch:
  - Condition: `SHAREPOINT_CONFIG.useMock && (masterWasEmpty || loadedLooksDefault)`
  - Then calls `extractLegacyLocalData()` (**L64-86**) and, if data exists, logs migration and saves migrated config.

- **L135** re-normalizes `resolvedConfig`.
- **L137-143** success path sets `configRef`, `setConfig`, clears error, returns.
- **L144-152** catch path logs failure and falls back.
- **L153-158** finally path should always run and set status idle.

Observed behavior: `Init complete.` (L156) never logs. Therefore execution never reaches the `setStatus(STATUS.IDLE)` call in finally condition.

---

## 2. The Black Hole (Root Cause)

## Root Mechanism
The silent halt is **not** an infinite loop in schema code and **not** a thrown exception. It is a **status update gate that is permanently disabled in React StrictMode**.

### Responsible code
### `src/context/ConfigProvider.jsx`
- **L101-105**:
```jsx
useEffect(() => {
    return () => {
        isMountedRef.current = false;
    };
}, []);
```

- **L153-158**:
```jsx
finally {
    if (isMountedRef.current && requestId === requestIdRef.current) {
        setStatus(STATUS.IDLE);
        console.log('[ConfigProvider] Init complete.');
    }
}
```

### Why this deadlocks status in development
### `src/main.jsx`
- **L16** wraps app in `<StrictMode>`.

In React StrictMode development behavior, effect setup/cleanup is intentionally replayed. The cleanup above sets `isMountedRef.current = false`, but the setup **never sets it back to true**.

So the second (real) `loadConfig` run executes with `isMountedRef.current === false`.

Consequences:
- Success path state updates guarded by `isMountedRef.current` are skipped.
- Catch path state updates are skipped.
- Finally block guard fails, so `setStatus('idle')` never runs.
- Spinner condition at **L213** (`status === 'loading'`) remains permanently true.

This perfectly matches observed logs:
- You still see `Init started...` and `Loaded config from adapter...` (these logs are outside `isMountedRef` guard).
- You never see `Init complete.`.
- No exception is thrown, so no catch logging occurs.

---

## Candidate Causes Eliminated

### Infinite loop / deep recursion in `AppSchema.js`
- No `while(true)`/unbounded recursion on defaults path.
- `validateAndNormalize` and merge functions are finite over acyclic JSON-like objects.
- If recursion blew stack, it would throw and hit catch logging.

### `JSON.parse` error + broken catch
- `ConfigService.loadConfig` has internal try/catch around parse (**L72-77**), and outer catch (**L91-94**).
- Parse failure returns defaults; it does not hang silently.

### Await on never-resolving Promise after loaded log
- After `Loaded config from adapter...`, only awaited calls are in optional migration branch (**L129-131**).
- Your missing migration log means that branch likely was not entered.
- Even if not entered, final should run; the real blocker is the `isMountedRef` guard.

### Infinite loop in `extractLegacyLocalData()`
- Fixed 7-key mapping loop (**L68-76 + L78-83**) only; cannot run indefinitely.

---

## 3. The `status` Lock: Why `finally` Fails to Release Spinner

The lock is caused by **logical gating**, not by exception flow.

Status transition to idle is conditioned on:
- `isMountedRef.current === true`
- `requestId === requestIdRef.current`

In StrictMode replay, `isMountedRef.current` becomes false and stays false because there is no re-arm assignment in effect setup. Therefore `finally` executes but **its body is skipped**.

Secondary factor:
- `requestIdRef` can suppress older requests intentionally, but that alone would not deadlock if latest request could set idle.
- Here, latest request also cannot set idle due `isMountedRef` false.

Result: permanent spinner at `status === 'loading'` render gate.

---

## 4. Verdict & Action Plan

## Verdict
Catastrophic failure is caused by these exact lines working together:
- `src/main.jsx:16` (`<StrictMode>` enables effect replay)
- `src/context/ConfigProvider.jsx:101-105` (cleanup sets `isMountedRef=false` but setup never restores true)
- `src/context/ConfigProvider.jsx:153-158` (`finally` status release guarded by stale false ref)

This is the silent killer.

## Patch Plan for Next Prompt (Exact Snippets)

### Fix 1 (Required): Re-arm `isMountedRef` in effect setup
Replace the mount effect with:

```jsx
useEffect(() => {
    isMountedRef.current = true;
    return () => {
        isMountedRef.current = false;
    };
}, []);
```

### Fix 2 (Strongly Recommended): Harden status release in `finally`
Current finally block can strand loading forever if guard is false. Prefer guaranteed state release for latest request while mounted instance is active.

```jsx
finally {
    if (requestId === requestIdRef.current && isMountedRef.current) {
        setStatus(STATUS.IDLE);
        console.log('[ConfigProvider] Init complete.');
    }
}
```

(Keep this structure, but it only becomes reliable once Fix 1 is applied.)

### Fix 3 (Diagnostic Safety): Add pre-finally trace to prove branch completion

```jsx
console.log('[ConfigProvider] Pre-finally gate', {
  requestId,
  currentRequestId: requestIdRef.current,
  isMounted: isMountedRef.current,
});
```

This confirms whether completion is blocked by gating conditions versus await-chain stalls.

---

## Minimal Reproduction Logic (Static)

1. StrictMode effect replay runs cleanup.
2. Cleanup writes `isMountedRef.current = false`.
3. No setup code restores true.
4. `loadConfig` runs and logs start + loaded.
5. `finally` guard fails (`isMountedRef` false).
6. `status` never transitions from `loading` to `idle`.
7. Full-screen spinner remains indefinitely.

This is deterministic under current code in development StrictMode.
