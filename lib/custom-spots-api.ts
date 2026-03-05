type CreatePostCustomSpotsHandlerDependencies = {
  runWithAuthenticatedClient: (
    handler: () => Promise<Response> | Response
  ) => Promise<Response> | Response;
  createCustomSpotPayload: (payload: unknown) => Promise<unknown>;
};

type CreateDeleteCustomSpotHandlerDependencies = {
  runWithAuthenticatedClient: (
    handler: () => Promise<Response> | Response
  ) => Promise<Response> | Response;
  deleteCustomSpotPayload: (spotId: string) => Promise<unknown>;
};

const DEFAULT_DEPENDENCIES: CreatePostCustomSpotsHandlerDependencies = {
  runWithAuthenticatedClient: async (handler) => handler(),
  createCustomSpotPayload: async () => null
};

const DEFAULT_DELETE_DEPENDENCIES: CreateDeleteCustomSpotHandlerDependencies = {
  runWithAuthenticatedClient: async (handler) => handler(),
  deleteCustomSpotPayload: async () => null
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

export function createDeleteCustomSpotHandler(
  dependencies: Partial<CreateDeleteCustomSpotHandlerDependencies> = {}
) {
  const {
    runWithAuthenticatedClient,
    deleteCustomSpotPayload
  } = {
    ...DEFAULT_DELETE_DEPENDENCIES,
    ...dependencies
  };

  return async function DELETE(
    _request: Request,
    context: { params: Promise<{ spotId?: string }> | { spotId?: string } }
  ) {
    return runWithAuthenticatedClient(async () => {
      const params = await context?.params;
      const spotId = String(params?.spotId || '').trim();

      if (!spotId) {
        return Response.json(
          {
            error: 'Custom spot id is required.'
          },
          { status: 400 }
        );
      }

      try {
        const payload = await deleteCustomSpotPayload(spotId);
        return Response.json(payload);
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : 'Failed to delete custom spot.'
          },
          { status: 400 }
        );
      }
    });
  };
}
