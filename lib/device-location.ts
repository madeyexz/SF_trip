export const DEVICE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000
};

export const DEVICE_LOCATION_VISIBLE_MESSAGE = 'Showing your current location on the map. Home base remains unchanged.';

type ApplyDeviceLocationInput = {
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
  setDeviceLocationMarker: (latLng: any, title: string) => void;
  focusMapOnOrigin: (latLng: any) => void;
  renderCurrentSelection: (
    eventsInput: any[],
    placesInput: any[],
    dateFilter: string,
    activeTravelMode: string,
    shouldFitBounds?: boolean
  ) => Promise<any>;
  setStatusMessage: (message: string, isError?: boolean) => void;
};

export async function applyDeviceLocation({
  googleMaps,
  coords,
  allEvents,
  filteredPlaces,
  effectiveDateFilter,
  travelMode,
  setDeviceLocationMarker,
  focusMapOnOrigin,
  renderCurrentSelection,
  setStatusMessage
}: ApplyDeviceLocationInput) {
  const latLng = new googleMaps.LatLng(coords.latitude, coords.longitude);

  setDeviceLocationMarker(latLng, 'My current location');
  focusMapOnOrigin(latLng);
  await renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode, false);
  setStatusMessage(DEVICE_LOCATION_VISIBLE_MESSAGE);

  return latLng;
}
