export const DEVICE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000
};

export const DEVICE_LOCATION_SESSION_MESSAGE = 'Using your live device location as trip origin for this session. Saved base address is unchanged.';

type ApplyDeviceLocationOriginInput = {
  googleMaps: {
    LatLng: new (lat: number, lng: number) => any;
  };
  coords: {
    latitude: number;
    longitude: number;
  };
  allEvents: any[];
  filteredPlaces: any[];
  effectiveDateFilter: string;
  travelMode: string;
  setBaseMarker: (latLng: any, title: string) => void;
  focusMapOnOrigin: (latLng: any) => void;
  renderCurrentSelection: (
    eventsInput: any[],
    placesInput: any[],
    dateFilter: string,
    activeTravelMode: string,
    shouldFitBounds?: boolean
  ) => Promise<any>;
  bumpBaseLocationVersion: () => void;
  setStatusMessage: (message: string, isError?: boolean) => void;
};

export async function applyDeviceLocationOrigin({
  googleMaps,
  coords,
  allEvents,
  filteredPlaces,
  effectiveDateFilter,
  travelMode,
  setBaseMarker,
  focusMapOnOrigin,
  renderCurrentSelection,
  bumpBaseLocationVersion,
  setStatusMessage
}: ApplyDeviceLocationOriginInput) {
  const latLng = new googleMaps.LatLng(coords.latitude, coords.longitude);

  setBaseMarker(latLng, 'My current location');
  focusMapOnOrigin(latLng);
  await renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode, false);
  bumpBaseLocationVersion();
  setStatusMessage(DEVICE_LOCATION_SESSION_MESSAGE);

  return latLng;
}
