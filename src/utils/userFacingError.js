export function toSafeHebrewError(error, fallbackMessage) {
    const status = Number(error?.status ?? error?.response?.status);
    if (status === 401 || status === 403) {
        return 'אין הרשאה לבצע את הפעולה. פנו למנהל האתר ובקשו הרשאה מתאימה.';
    }

    const message = String(error?.message || '').toLowerCase();
    if (
        message.includes('failed to fetch')
        || message.includes('network')
        || message.includes('econnrefused')
    ) {
        return 'לא ניתן להתחבר לשירות כרגע. בדקו את החיבור ונסו שוב.';
    }

    if (status === 409) {
        return 'הפעולה מתנגשת עם מצב קיים. רעננו את הנתונים ובדקו אותם לפני ניסיון נוסף.';
    }
    if (status === 412 || error?.code === 'version_conflict') {
        return 'הנתונים השתנו במקביל. הטיוטה נשמרה ויש לפתור את ההתנגשות לפני שמירה.';
    }

    return fallbackMessage;
}
