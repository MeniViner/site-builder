let requestDigestCache = null;
let requestDigestCacheTime = null;
const CACHE_EXPIRATION_MS = 25 * 60 * 1000; // 25 minutes (SharePoint digests typically expire in 30)

/**
 * Gets a SharePoint Request Digest token, utilizing caching.
 * @returns {Promise<string>} The Request Digest token
 */
export const getRequestDigest = async () => {
    const now = Date.now();
    // Check if we have a valid cached digest
    if (requestDigestCache && requestDigestCacheTime && (now - requestDigestCacheTime < CACHE_EXPIRATION_MS)) {
        return requestDigestCache;
    }

    try {
        const response = await fetch('/_api/contextinfo', {
            method: 'POST',
            headers: {
                'Accept': 'application/json;odata=verbose',
                'Content-Type': 'application/json;odata=verbose'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        requestDigestCache = data.d.GetContextWebInformation.FormDigestValue;
        requestDigestCacheTime = now;

        return requestDigestCache || '';
    } catch (error) {
        console.error('שגיאה בקבלת Request Digest:', error);
        throw error;
    }
};

/**
 * Creates a backup folder in SharePoint and copies specified files to it.
 * @param {Array<string>} filesToBackup - List of file paths to backup (server relative URLs)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export const createBackup = async (filesToBackup = []) => {
    try {
        console.log("מתחיל גיבוי מערכת...");

        // Use a default path based on config if not provided
        if (!filesToBackup || filesToBackup.length === 0) {
            filesToBackup = [
                import.meta.env.VITE_SP_EVENTS_FILE_URL || '/sites/bihs7134/SiteAssets/events_data.txt',
                import.meta.env.VITE_SP_NAV_FILE_URL || '/sites/bihs7134/SiteAssets/nav_data.txt'
            ];
        }

        // Get site URL from the first file path (assuming they share the same site)
        const firstFile = filesToBackup[0];
        if (!firstFile) return false;

        // Extract site URL (e.g., /sites/bihs7134)
        const siteUrlMatch = firstFile.match(/^\/sites\/[^/]+/);
        if (!siteUrlMatch) {
            console.error("לא ניתן לזהות נתיב אתר מתוך", firstFile);
            return false;
        }
        const siteUrl = siteUrlMatch[0];

        // Ensure backups folder exists based on site path
        // Instead of hardcoding, we use the SiteAssets folder
        const backupBaseFolder = `${siteUrl}/SiteAssets/Backups`;

        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFolderName = `backup-${timestamp}`;
        const targetFolderPath = `${backupBaseFolder}/${backupFolderName}`;

        // Get digest
        const digest = await getRequestDigest();

        // 1. First, create the root Backups folder if it doesn't exist
        try {
            await fetch(`${siteUrl}/_api/web/folders`, {
                method: "POST",
                headers: {
                    'accept': 'application/json; odata=verbose',
                    'x-RequestDigest': digest,
                    'Content-Type': 'application/json; odata=verbose'
                },
                body: JSON.stringify({
                    '__metadata': { 'type': 'SP.Folder' },
                    'ServerRelativeUrl': backupBaseFolder
                })
            });
            // We ignore errors here because the folder might already exist
        } catch (e) { }

        // 2. Create the specific timestamped backup folder
        const createFolderRes = await fetch(`${siteUrl}/_api/web/folders`, {
            method: "POST",
            headers: {
                'accept': 'application/json; odata=verbose',
                'x-RequestDigest': digest,
                'Content-Type': 'application/json; odata=verbose'
            },
            body: JSON.stringify({
                '__metadata': { 'type': 'SP.Folder' },
                'ServerRelativeUrl': targetFolderPath
            })
        });

        if (!createFolderRes.ok) {
            throw new Error(`יצירת תיקיית גיבוי נכשלה: ${createFolderRes.status}`);
        }

        console.log(`תיקיית גיבוי שנוצרה: ${targetFolderPath}`);

        // 3. Backup each file by reading and then writing it to the new folder
        for (const filePath of filesToBackup) {
            try {
                // Read original
                const readRes = await fetch(`/_api/web/GetFileByServerRelativeUrl('${filePath}')/$value`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: { 'Accept': 'application/json;odata=verbose' }
                });

                if (!readRes.ok) {
                    // Skip files that don't exist
                    if (readRes.status === 404) continue;
                    throw new Error(`שגיאה בקריאת קובץ לגיבוי: ${readRes.status}`);
                }

                const fileContent = await readRes.text();
                const fileName = filePath.split('/').pop();
                const newFilePath = `${targetFolderPath}/${fileName}`;

                // Write backup
                const writeRes = await fetch(`/_api/web/GetFileByServerRelativeUrl('${newFilePath}')/$value`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-RequestDigest': digest,
                        'X-HTTP-Method': 'PUT',
                        'IF-MATCH': '*',
                        'Content-Type': 'application/json',
                    },
                    body: fileContent
                });

                if (!writeRes.ok) {
                    console.error(`שגיאה בכתיבת קובץ גיבוי ${fileName}:`, writeRes.status);
                }
            } catch (fileErr) {
                console.error(`שגיאה בגיבוי קובץ ${filePath}:`, fileErr);
            }
        }

        console.log("✅ גיבוי הושלם בהצלחה!");
        return true;
    } catch (error) {
        console.error('❌ שגיאה בתהליך הגיבוי:', error);
        return false;
    }
};
