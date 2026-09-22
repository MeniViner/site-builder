export function toSafeHebrewError(error, fallbackMessage) {
    const status = Number(error?.status ?? error?.response?.status);
    if (status === 401 || status === 403) {
        return 'אין הרשאה לבצע את הפעולה. פנו למנהל האתר ובקשו הרשאה מתאימה.';
    }

    const message = String(error?.message || '').toLowerCase();
    if (
        error instanceof TypeError
        || message.includes('failed to fetch')
        || message.includes('network')
        || message.includes('load failed')
    ) {
        return 'לא ניתן להתחבר לשירות כרגע. בדקו את החיבור ונסו שוב.';
    }

    return fallbackMessage;
}
