'use strict';

const assert = require('../assert');

describe('Pinkacord admin proxy paths', () => {
	const { getAdminProxyPath } = require('../../dist/server/pinkacord-admin-proxy');

	it('routes only /admin URLs to the admin process', () => {
		assert.equal(getAdminProxyPath('/admin'), '/');
		assert.equal(getAdminProxyPath('/admin/'), '/');
		assert.equal(getAdminProxyPath('/admin?next=formats'), '/?next=formats');
		assert.equal(getAdminProxyPath('/admin/api/me'), '/api/me');
		assert.equal(getAdminProxyPath('/admin/api/publish/status?fresh=1'), '/api/publish/status?fresh=1');
		assert.equal(getAdminProxyPath('/admin/favicon.ico'), '/favicon.ico');

		assert.equal(getAdminProxyPath('/api/me'), null);
		assert.equal(getAdminProxyPath('/administrator'), null);
		assert.equal(getAdminProxyPath('/battle-gen9randombattle-1'), null);
	});
});
