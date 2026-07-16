export function canAccessAdminUi({
  isAdmin = false,
  loading = false,
  isPreview = false,
  isDevelopment = import.meta.env.DEV,
} = {}) {
  if (isPreview) return false;
  if (isDevelopment) return true;
  return Boolean(isAdmin && !loading);
}
