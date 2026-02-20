/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminCleanup from "../adminCleanup.js";
import type * as appUsers from "../appUsers.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as ownerRole from "../ownerRole.js";
import type * as pairPolicy from "../pairPolicy.js";
import type * as pairRoomMembers from "../pairRoomMembers.js";
import type * as planner from "../planner.js";
import type * as routeCache from "../routeCache.js";
import type * as sources from "../sources.js";
import type * as spots from "../spots.js";
import type * as tripConfig from "../tripConfig.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminCleanup: typeof adminCleanup;
  appUsers: typeof appUsers;
  auth: typeof auth;
  authz: typeof authz;
  events: typeof events;
  http: typeof http;
  ownerRole: typeof ownerRole;
  pairPolicy: typeof pairPolicy;
  pairRoomMembers: typeof pairRoomMembers;
  planner: typeof planner;
  routeCache: typeof routeCache;
  sources: typeof sources;
  spots: typeof spots;
  tripConfig: typeof tripConfig;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
