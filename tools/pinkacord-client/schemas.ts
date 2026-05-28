/**
 * Pinkacord client-overlay schemas.
 *
 * The client overlay augments displayable data (sprites, descriptions) for
 * each entity already defined in content/pinkacord/. We deliberately keep
 * this schema thin — every field here is browser-only; battle mechanics are
 * the server's domain.
 */

import { z } from "zod";
import { IdSchema } from "./../pinkacord/schemas";

export const ClientSpeciesOverrideSchema = z.object({
	id: IdSchema,
	/** Existing PS spriteid to reuse, e.g. "pikachu". Empty = use mon's id. */
	spriteid: z.string().min(1).optional(),
	/** Echoed in the overlay for cross-checking against server content. */
	num: z.number().int().min(10001).max(99999),
});
export type ClientSpeciesOverride = z.infer<typeof ClientSpeciesOverrideSchema>;

export const ClientMoveOverrideSchema = z.object({
	id: IdSchema,
	/** Existing PS move id whose animation we want to reuse for this move. */
	animationOf: z.string().min(1).optional(),
});
export type ClientMoveOverride = z.infer<typeof ClientMoveOverrideSchema>;

export const ClientAbilityOverrideSchema = z.object({
	id: IdSchema,
	/** Free-form display description override. Defaults to server's shortDesc. */
	longDesc: z.string().max(2000).optional(),
});
export type ClientAbilityOverride = z.infer<typeof ClientAbilityOverrideSchema>;

export const ClientFileSchema = z.object({
	schemaVersion: z.literal(1),
	species: z.array(ClientSpeciesOverrideSchema).default([]),
	moves: z.array(ClientMoveOverrideSchema).default([]),
	abilities: z.array(ClientAbilityOverrideSchema).default([]),
});
export type ClientFile = z.infer<typeof ClientFileSchema>;
