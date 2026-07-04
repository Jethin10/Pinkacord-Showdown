/**
 * Local live-reload hook used by the Pinkacord admin panel.
 *
 * This runs inside the main Pokemon Showdown process, so it can update the
 * globals that actually back the live format list and validator.
 */

export interface PinkacordLiveHotpatchResult {
	ok: boolean;
	applied: string[];
	errors: string[];
	message: string;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function respawnIfPresent(label: string, pm: any, result: PinkacordLiveHotpatchResult): void {
	try {
		if (pm?.processes?.length) {
			pm.respawn();
			result.applied.push(label);
		} else {
			result.applied.push(`${label}:inline`);
		}
	} catch (error) {
		result.errors.push(`${label}: ${errorText(error)}`);
	}
}

export const PinkacordLiveHotpatch = {
	apply(): PinkacordLiveHotpatchResult {
		const result: PinkacordLiveHotpatchResult = {
			ok: true,
			applied: [],
			errors: [],
			message: "",
		};
		const lock = Monitor.hotpatchLock || {};
		for (const key of ["formats", "battles", "validator"] as const) {
			if (lock[key]) result.errors.push(`${key}: disabled by ${lock[key].by} (${lock[key].reason})`);
		}
		if (result.errors.length) {
			result.ok = false;
			result.message = `Live hotpatch blocked: ${result.errors.join("; ")}`;
			return result;
		}

		try {
			global.Dex = require('../sim/dex').Dex;
			Rooms.global.formatList = '';
			global.Teams = require('../sim/teams').Teams;
			result.applied.push("formats");
		} catch (error) {
			result.errors.push(`formats: ${errorText(error)}`);
		}

		respawnIfPresent("teamvalidator", TeamValidatorAsync.PM, result);
		respawnIfPresent("battles", Rooms.PM, result);
		if (Chat.plugins.datasearch?.PM) {
			respawnIfPresent("datasearch", Chat.plugins.datasearch.PM, result);
		}

		try {
			Rooms.global.sendAll(Rooms.global.formatListText);
		} catch (error) {
			result.errors.push(`broadcast: ${errorText(error)}`);
		}

		result.ok = result.errors.length === 0;
		result.message = result.ok ?
			`Live server hotpatched: ${result.applied.join(", ")}` :
			`Live hotpatch had ${result.errors.length} error(s): ${result.errors.join("; ")}`;
		return result;
	},
};
