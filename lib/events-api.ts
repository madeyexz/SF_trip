import { loadEventsPayload as loadEventsPayloadDefault } from './events.ts';
import { runWithAuthenticatedClient as runWithAuthenticatedClientDefault } from './api-guards.ts';
import { getPlannerRoomCodeFromUrl as getPlannerRoomCodeFromUrlDefault } from './planner-api.ts';

type EventsApiDeps = {
  runWithAuthenticatedClient?: typeof runWithAuthenticatedClientDefault;
  loadEventsPayload?: typeof loadEventsPayloadDefault;
  getPlannerRoomCodeFromUrl?: typeof getPlannerRoomCodeFromUrlDefault;
};

export function createGetEventsHandler(deps: EventsApiDeps = {}) {
  const runWithAuthenticatedClient = deps.runWithAuthenticatedClient || runWithAuthenticatedClientDefault;
  const loadEventsPayload = deps.loadEventsPayload || loadEventsPayloadDefault;
  const getPlannerRoomCodeFromUrl = deps.getPlannerRoomCodeFromUrl || getPlannerRoomCodeFromUrlDefault;

  return async function GET(request?: Request) {
    return runWithAuthenticatedClient(async () => {
      const roomCode = request?.url ? getPlannerRoomCodeFromUrl(request.url) : '';
      const payload = await loadEventsPayload(roomCode);
      return Response.json(payload);
    });
  };
}
