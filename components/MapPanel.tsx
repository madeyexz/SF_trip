'use client';

import { useEffect } from 'react';
import { Calendar, House, Search, Siren, X } from 'lucide-react';
import { useTrip, TAG_COLORS, getTagIconComponent } from '@/components/providers/TripProvider';
import { formatTag } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import StatusBar from '@/components/StatusBar';

const EVENT_COLOR = '#FF8800';
const HOME_COLOR = '#00FF88';
const CRIME_COLOR = '#FF4444';

function formatCrimeUpdatedAt(isoTimestamp) {
  if (!isoTimestamp) return 'waiting for first update';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return 'waiting for first update';
  const deltaMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (deltaMinutes < 1) return 'updated just now';
  if (deltaMinutes < 60) return `updated ${deltaMinutes}m ago`;
  const h = Math.floor(deltaMinutes / 60);
  const m = deltaMinutes % 60;
  return `updated ${h}h ${m}m ago`;
}

function formatCrimeWindowLabel(hours) {
  return hours === 1 ? 'last 1h' : `last ${hours}h`;
}

function FilterChip({ active, color, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium rounded-none px-2.5 py-1 transition-all duration-150 cursor-pointer border"
      style={
        active
          ? {
              background: `${color}14`,
              borderColor: `${color}50`,
              color: color,
              boxShadow: `0 0 0 2px ${color}18`,
            }
          : {
              background: 'transparent',
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)',
              opacity: 0.45,
            }
      }
    >
      <Icon className="w-[14px] h-[14px]" size={14} strokeWidth={2.2} />
      <span className={active ? '' : 'line-through decoration-1'}>{label}</span>
    </button>
  );
}

export default function MapPanel() {
  const {
    mapPanelRef,
    mapElementRef,
    hiddenCategories,
    toggleCategory,
    crimeLayerMeta,
    crimeHeatmapStrength,
    setCrimeHeatmapStrength,
    crimeLookbackHours,
    setCrimeLookbackHours,
    crimeLookbackHourOptions,
    mapSearchQuery,
    setMapSearchQuery,
    isSearchingMapLocation,
    searchLocationError,
    placeSearchResults,
    searchResultTagDrafts,
    savingSearchResultId,
    deletingCustomSpotId,
    hasSearchLocation,
    handleSearchMapLocation,
    handleClearSearchLocation,
    handleSetSearchResultTag,
    handleFocusSearchResult,
    handleSaveSearchResultAsSpot,
    handleDeleteCustomSpot,
    setMapRuntimeActive,
  } = useTrip();
  const isCrimeVisible = !hiddenCategories.has('crime');
  const crimeStatusText = crimeLayerMeta.loading
    ? 'Updating live crime feed...'
    : crimeLayerMeta.error
      ? `Update failed: ${crimeLayerMeta.error}`
      : `${crimeLayerMeta.count.toLocaleString()} incidents in ${formatCrimeWindowLabel(crimeLayerMeta.hours || crimeLookbackHours)} · ${formatCrimeUpdatedAt(crimeLayerMeta.generatedAt)}`;

  useEffect(() => {
    setMapRuntimeActive(true);
    return () => {
      setMapRuntimeActive(false);
    };
  }, [setMapRuntimeActive]);

  return (
    <section className="flex flex-col min-h-0 h-full" ref={mapPanelRef}>
      <div className="flex flex-wrap items-center gap-1.5 bg-[#080808] border-b border-border px-4 py-1.5">
        <FilterChip
          active={!hiddenCategories.has('event')}
          color={EVENT_COLOR}
          icon={Calendar}
          label="Event"
          onClick={() => toggleCategory('event')}
        />
        <FilterChip
          active={!hiddenCategories.has('home')}
          color={HOME_COLOR}
          icon={House}
          label="Home"
          onClick={() => toggleCategory('home')}
        />
        <FilterChip
          active={!hiddenCategories.has('crime')}
          color={CRIME_COLOR}
          icon={Siren}
          label={isCrimeVisible ? 'Crime Live • ON' : 'Crime Live'}
          onClick={() => toggleCategory('crime')}
        />
        {Object.keys(TAG_COLORS).map((tag) => (
          <FilterChip
            key={tag}
            active={!hiddenCategories.has(tag)}
            color={TAG_COLORS[tag]}
            icon={getTagIconComponent(tag)}
            label={formatTag(tag)}
            onClick={() => toggleCategory(tag)}
          />
        ))}
      </div>
      <div className="relative flex-1 min-h-0 map-container-responsive">
        <div id="map" ref={mapElementRef} />
        <form
          className="absolute top-3 left-3 z-20 w-[min(360px,calc(100%-24px))] border border-border bg-[rgba(10,10,10,0.94)] px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSearchMapLocation(mapSearchQuery);
          }}
        >
          <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-foreground-secondary">
            <Search size={13} className="text-accent" />
            <span>{'// Search Location'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="text"
              value={mapSearchQuery}
              onChange={(event) => setMapSearchQuery(event.target.value)}
              placeholder='TRY "CAFE NEARBY" OR "SUSHI MISSION"'
              aria-label="Search location"
              autoComplete="off"
              className="min-h-[34px] bg-bg-elevated text-[0.78rem]"
            />
            <Button
              type="submit"
              size="sm"
              className="min-h-[34px] shrink-0 px-3"
              disabled={isSearchingMapLocation}
            >
              {isSearchingMapLocation ? '...' : 'Search'}
            </Button>
            {hasSearchLocation ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-[34px] shrink-0 px-2.5"
                onClick={handleClearSearchLocation}
                disabled={isSearchingMapLocation}
                aria-label="Clear search pin"
              >
                <X size={13} />
              </Button>
            ) : null}
          </div>
          <p className={`mt-2 mb-0 text-[0.64rem] leading-tight ${searchLocationError ? 'text-[#FF4444]' : 'text-foreground-secondary'}`}>
            {searchLocationError || 'Searches return multiple pinned places. Save any result into a trip category.'}
          </p>
          {placeSearchResults.length > 0 ? (
            <div className="mt-2 max-h-[280px] overflow-y-auto border-t border-border pt-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="m-0 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-foreground-secondary">
                  {placeSearchResults.length} results pinned
                </p>
                <p className="m-0 text-[0.6rem] text-muted">SAVE INTO EXISTING SPOT CATEGORIES</p>
              </div>
              <div className="space-y-2">
                {placeSearchResults.map((result, index) => {
                  const selectedTag = searchResultTagDrafts[result.id] || result.suggestedTag || 'eat';
                  const isSavingResult = savingSearchResultId === result.id;
                  const isDeletingResult = deletingCustomSpotId === result.savedSpotId;
                  return (
                    <div key={result.id} className="border border-border bg-bg-elevated px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="m-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-accent">
                            Result {index + 1}
                          </p>
                          <p className="mt-1 mb-0 text-[0.78rem] font-semibold text-foreground leading-snug">{result.name}</p>
                          <p className="mt-1 mb-0 text-[0.68rem] leading-snug text-foreground-secondary">{result.location}</p>
                        </div>
                        {result.savedTag ? (
                          <span className="shrink-0 border border-accent-border bg-accent-light px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-accent">
                            Saved · {formatTag(result.savedTag)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-1">
                        <Select value={selectedTag} onValueChange={(value) => handleSetSearchResultTag(result.id, value)}>
                          <SelectTrigger className="min-h-[32px] bg-card px-2.5 py-1 text-[0.72rem] uppercase">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {['eat', 'bar', 'cafes', 'go out', 'shops', 'sightseeing'].map((tag) => (
                              <SelectItem key={tag} value={tag}>{formatTag(tag)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" variant="secondary" className="min-h-[32px] px-2.5" onClick={() => handleFocusSearchResult(result.id)}>
                          Focus
                        </Button>
                        {result.savedTag ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            className="min-h-[32px] px-2.5"
                            disabled={isDeletingResult}
                            onClick={() => { void handleDeleteCustomSpot(result.savedSpotId); }}
                          >
                            {isDeletingResult ? 'Deleting...' : 'Remove Spot'}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" className="min-h-[32px] px-2.5" disabled={isSavingResult} onClick={() => { void handleSaveSearchResultAsSpot(result.id); }}>
                            {isSavingResult ? 'Saving...' : 'Save Spot'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </form>
        {isCrimeVisible ? (
          <div className="absolute top-3 right-3 z-20 w-[196px] rounded-none border border-[rgba(255,68,68,0.3)] bg-[rgba(10,10,10,0.92)] backdrop-blur-sm px-2.5 py-2 shadow-[0_8px_24px_rgba(255,68,68,0.15)]">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-[#FF4444]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF4444] opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF4444]" />
                </span>
                CRIME LIVE
              </div>
              <span className="rounded-none bg-danger-light px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#FF4444]">ON</span>
            </div>
            <div className="mt-1.5 space-y-1.5">
              <div>
                <p className="text-[0.52rem] font-semibold tracking-[0.12em] text-foreground-secondary">INTENSITY</p>
                <div className="mt-1 flex items-center gap-1">
                  {[
                    { id: 'low', label: 'Low' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'high', label: 'High' },
                  ].map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setCrimeHeatmapStrength(level.id)}
                      className={`rounded-none px-1.5 py-0.5 text-[0.6rem] font-semibold border transition-colors ${
                        crimeHeatmapStrength === level.id
                          ? 'bg-danger-light text-[#FF4444] border-[rgba(255,68,68,0.3)]'
                          : 'bg-transparent text-foreground-secondary border-border hover:border-[rgba(255,68,68,0.3)]'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[0.52rem] font-semibold tracking-[0.12em] text-foreground-secondary">WINDOW</p>
                <div className="mt-1 flex items-center gap-1">
                  {crimeLookbackHourOptions.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setCrimeLookbackHours(hours)}
                      className={`rounded-none px-1.5 py-0.5 text-[0.6rem] font-semibold border transition-colors ${
                        crimeLookbackHours === hours
                          ? 'bg-danger-light text-[#FF4444] border-[rgba(255,68,68,0.3)]'
                          : 'bg-transparent text-foreground-secondary border-border hover:border-[rgba(255,68,68,0.3)]'
                      }`}
                    >
                      {hours}H
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-none bg-gradient-to-r from-[#FF8800] via-[#FF4444] to-[#7f1d1d]" />
            <p className={`mt-1.5 text-[0.64rem] leading-tight ${crimeLayerMeta.error ? 'text-[#FF4444] font-semibold' : 'text-foreground-secondary'}`}>
              {crimeStatusText}
            </p>
          </div>
        ) : null}
        <StatusBar />
      </div>
    </section>
  );
}
