type AdminLike = Record<string, unknown>;

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalizeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const normalizeAdminRecord = (item: AdminLike, fallbackIndex = 0) => {
    const id = String(item?.id ?? item?.Id ?? fallbackIndex + 1);
    const name = String(item?.name ?? item?.Title ?? '').trim();
    const email = String(item?.email ?? item?.Email ?? '').trim();
    const loginName = String(item?.loginName ?? item?.LoginName ?? '').trim();
    const personalNumberRaw = String(item?.personalNumber ?? '').trim().toLowerCase();
    const personalNumber = personalNumberRaw || (() => {
        const fromLogin = loginName.match(/s\d{6,8}/i)?.[0];
        if (fromLogin) return fromLogin.toLowerCase();
        const fromEmail = email.match(/s\d{6,8}/i)?.[0];
        if (fromEmail) return fromEmail.toLowerCase();
        const digits = normalizeDigits(item?.personalNumber);
        return digits ? `s${digits}` : '';
    })();

    return {
        id,
        name,
        email,
        loginName,
        personalNumber,
        role: String(item?.role ?? 'admin').trim() || 'admin',
    };
};

const getAdminKey = (user: ReturnType<typeof normalizeAdminRecord>, idx: number) => {
    const login = normalizeText(user.loginName);
    if (login) return `login:${login}`;
    const pn = normalizeText(user.personalNumber);
    if (pn) return `pn:${pn}`;
    const email = normalizeText(user.email);
    if (email) return `mail:${email}`;
    const name = normalizeText(user.name);
    if (name) return `name:${name}`;
    return `idx:${idx}`;
};

export const mergeUsersWithSharePointAdmins = (baseUsers: AdminLike[] = [], sharePointAdmins: AdminLike[] = []) => {
    const merged: ReturnType<typeof normalizeAdminRecord>[] = [];
    const keyIndex = new Map<string, number>();

    const upsert = (rawUser: AdminLike, forceAdmin = false, idx = 0) => {
        const normalized = normalizeAdminRecord(rawUser, idx);
        const key = getAdminKey(normalized, idx);
        const existingIndex = keyIndex.get(key);
        if (existingIndex === undefined) {
            merged.push({ ...normalized, role: forceAdmin ? 'admin' : normalized.role });
            keyIndex.set(key, merged.length - 1);
            return;
        }
        const existing = merged[existingIndex];
        merged[existingIndex] = {
            ...existing,
            ...normalized,
            role: forceAdmin ? 'admin' : (normalized.role || existing.role),
        };
    };

    baseUsers.forEach((user, idx) => upsert(user, false, idx));
    sharePointAdmins.forEach((user, idx) => upsert(user, true, idx + baseUsers.length));
    return merged;
};

const comparableSnapshot = (users: AdminLike[] = []) => {
    const normalized = users.map((user, idx) => normalizeAdminRecord(user, idx)).map((user, idx) => ({
        key: getAdminKey(user, idx),
        role: normalizeText(user.role || 'admin'),
        name: normalizeText(user.name),
        email: normalizeText(user.email),
        loginName: normalizeText(user.loginName),
        personalNumber: normalizeText(user.personalNumber),
    })).sort((a, b) => a.key.localeCompare(b.key));

    return JSON.stringify(normalized);
};

export const hasAdminUsersListChanged = (beforeUsers: AdminLike[] = [], afterUsers: AdminLike[] = []) =>
    comparableSnapshot(beforeUsers) !== comparableSnapshot(afterUsers);
