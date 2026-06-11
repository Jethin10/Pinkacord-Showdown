/**
 * Routing helper for the hosted Pinkacord admin panel.
 *
 * The public PS server owns the Render port. Admin traffic lives under
 * /admin and is forwarded to the private admin process inside the same
 * container.
 */

export function getAdminProxyPath(requestUrl: string | undefined): string | null {
	if (!requestUrl) return null;
	if (requestUrl === '/admin') return '/';
	if (requestUrl.startsWith('/admin?')) return '/' + requestUrl.slice('/admin'.length);
	if (requestUrl === '/admin/') return '/';
	if (!requestUrl.startsWith('/admin/')) return null;
	return requestUrl.slice('/admin'.length) || '/';
}
