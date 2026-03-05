type CreatePostCustomSpotsHandlerDependencies = {
  runWithAuthenticatedClient: (
    handler: () => Promise<Response> | Response
  ) => Promise<Response> | Response;
  createCustomSpotPayload: (payload: unknown) => Promise<unknown>;
};

const DEFAULT_DEPENDENCIES: CreatePostCustomSpotsHandlerDependencies = {
  runWithAuthenticatedClient: async (handler) => handler(),
  createCustomSpotPayload: async () => null
};

export function createPostCustomSpotsHandler(
  dependencies: Partial<CreatePostCustomSpotsHandlerDependencies> = {}
) {
  const {
    runWithAuthenticatedClient,
    createCustomSpotPayload
  } = {
    ...DEFAULT_DEPENDENCIES,
    ...dependencies
  };

  return async function POST(request: Request) {
    return runWithAuthenticatedClient(async () => {
      let body = null;

      try {
        body = await request.json();
      } catch {
        return Response.json(
          {
            error: 'Invalid custom spot payload.'
          },
          { status: 400 }
        );
      }

      try {
        const spot = await createCustomSpotPayload(body);
        return Response.json({ spot });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : 'Failed to save custom spot.'
          },
          { status: 400 }
        );
      }
    });
  };
}
