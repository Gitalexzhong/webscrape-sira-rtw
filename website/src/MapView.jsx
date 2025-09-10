import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Polyline,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Box,
  Typography,
  List,
  ListItem,
  Link as MuiLink,
  TextField,
  IconButton,
  Paper,
  AppBar,
  Toolbar,
  Tooltip,
  Button,
  Popover,
  Checkbox,
  ListItemText,
  ListItemIcon,
  List as MuiList,
  Divider,
  LinearProgress,
} from '@mui/material';
import Papa from 'papaparse';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';

// Fix default marker icon
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl, shadowUrl: iconShadow });

// Add a yellow icon for groups containing any highlighted (favorite) providers
// const yellowIcon = new L.Icon({
//   iconUrl:
//     'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
//   shadowUrl: iconShadow,
//   iconSize: [25, 41],
//   iconAnchor: [12, 41],
//   popupAnchor: [1, -34],
//   shadowSize: [41, 41],
// });

L.Marker.prototype.options.icon = DefaultIcon;

function groupByLocation(data) {
  const map = new Map();
  data.forEach((item) => {
    const key = `${item.Latitude},${item.Longitude}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return Array.from(map.values());
}

const DEFAULT_CENTER = [-33.8688, 151.2093]; // Sydney

// Version and update summary for popup
const APP_VERSION = '1.2.0';
const UPDATE_SUMMARY = `
- Fixed: Clicking any provider in the search list (even in grouped pins) now always opens the correct popup and scrolls to the selected provider
- Cleaned up unused variables and lint warnings
- Minor UI/UX polish
`;

export default function MapView() {
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [providerStates, setProviderStates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('providerStates') || '{}');
    } catch {
      return {};
    }
  });
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('searchHistory') || '[]');
    } catch {
      return [];
    }
  });
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchMarker, setSearchMarker] = useState(null); // {lat, lng, address}
  const [listViewOpen, setListViewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hoveredProviderId, setHoveredProviderId] = useState(null);
  const [highlightedProviderId, setHighlightedProviderId] = useState(null);
  const [showUpdatePopup, setShowUpdatePopup] = useState(() => {
    try {
      const lastVersion = localStorage.getItem('lastSeenVersion');
      return lastVersion !== APP_VERSION;
    } catch {
      return true;
    }
  });
  const [activePopupMarkerId, setActivePopupMarkerId] = useState(null); // NEW: track which marker's popup should be open
  const [activePopupProviderId, setActivePopupProviderId] = useState(null); // NEW: track which provider in grouped popup to scroll to
  const markerRefs = useRef({});
  const mapRef = useRef();
  const listItemRefs = useRef({});
  const groupedListRefs = useRef({});
  const MAX_HISTORY = 5;

  useEffect(() => {
    fetch('/cleaned_providers.csv')
      .then((r) => r.text())
      .then((csv) => {
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setProviders(
              results.data.filter(
                (row) =>
                  row.Latitude &&
                  row.Longitude &&
                  !isNaN(row.Latitude) &&
                  !isNaN(row.Longitude)
              )
            );
          },
        });
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }, [searchHistory]);

  // Persist providerStates in localStorage
  useEffect(() => {
    localStorage.setItem('providerStates', JSON.stringify(providerStates));
  }, [providerStates]);

  useEffect(() => {
    if (showUpdatePopup === false) {
      localStorage.setItem('lastSeenVersion', APP_VERSION);
    }
  }, [showUpdatePopup]);

  const handleProviderState = (company) => {
    setProviderStates((prev) => {
      const current = prev[company] || 'normal';
      const next =
        current === 'normal'
          ? 'highlighted'
          : current === 'highlighted'
          ? 'hidden'
          : 'normal';
      return { ...prev, [company]: next };
    });
  };

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => providerStates[p.Company] !== 'hidden');
  }, [providers, providerStates]);

  const grouped = useMemo(
    () => groupByLocation(filteredProviders),
    [filteredProviders]
  );
  const allCompanies = useMemo(
    () => Array.from(new Set(providers.map((p) => p.Company))).sort(),
    [providers]
  );

  // Compute company counts for filter
  const companyCounts = useMemo(() => {
    const counts = {};
    providers.forEach((p) => {
      counts[p.Company] = (counts[p.Company] || 0) + 1;
    });
    return counts;
  }, [providers]);

  // Floating filter bar logic
  const handleFilterClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleFilterClose = () => {
    setAnchorEl(null);
  };
  const open = Boolean(anchorEl);

  // Search bar logic (address search, with history)
  // Allow Enter key to trigger search
  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter' && search.trim()) {
      setSearchHistory((prev) => {
        const updated = [
          search.trim(),
          ...prev.filter((s) => s !== search.trim()),
        ].slice(0, MAX_HISTORY);
        return updated;
      });
      await handleSearch();
    }
  };

  // --- Fix: Close all open popups before new search ---
  const closeAllPopups = () => {
    Object.values(markerRefs.current).forEach((ref) => {
      if (ref && ref.closePopup) ref.closePopup();
    });
  };

  // Geocode search address and add marker
  const handleSearch = async (address) => {
    closeAllPopups();
    const query = address !== undefined ? address : search;
    if (!query.trim()) return;
    setLoading(true);
    // Restrict geocoding to Australia/NSW for more relevant results
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&viewbox=140.9,-38.0,153.7,-27.0&bounded=1&q=${encodeURIComponent(
      query + ', NSW, Australia'
    )}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setSearchMarker({
          lat: parseFloat(lat),
          lng: parseFloat(lon),
          address: display_name,
        });
        setListViewOpen(true);
      }
    } catch {
      /* ignore geocode errors */
    } finally {
      setLoading(false);
    }
  };

  // Calculate distances from searchMarker to each provider
  function haversine(lat1, lon1, lat2, lon2) {
    function toRad(x) {
      return (x * Math.PI) / 180;
    }
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  let sortedProviders = [];
  if (searchMarker) {
    sortedProviders = providers
      .filter((p) => p.Latitude && p.Longitude)
      .map((p) => ({
        ...p,
        distance: haversine(
          searchMarker.lat,
          searchMarker.lng,
          parseFloat(p.Latitude),
          parseFloat(p.Longitude)
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  // Refocus on search marker when it changes
  useEffect(() => {
    if (searchMarker && mapRef.current) {
      mapRef.current.setView([searchMarker.lat, searchMarker.lng], 15, {
        animate: true,
      });
    }
  }, [searchMarker]);

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
      }}
    >
      {loading && (
        <LinearProgress
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100vw',
            zIndex: 2000,
          }}
        />
      )}
      {/* Floating header bar */}
      <Box
        sx={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          width: 'auto',
          minWidth: 350,
          maxWidth: 600,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 3,
          boxShadow: 3,
          px: 3,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{ color: '#222', fontWeight: 700, flexShrink: 0 }}
        >
          RTW Rehab Provider Search
        </Typography>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 100)}
          label="Search for an address"
          size="small"
          sx={{ background: 'white', borderRadius: 1, minWidth: 200, flex: 1 }}
          autoComplete="off"
        />
        <IconButton onClick={handleSearch} sx={{ ml: 1 }} size="large">
          <SearchIcon />
        </IconButton>
        {searchFocused && searchHistory.length > 0 && (
          <Paper
            sx={{
              position: 'absolute',
              top: 64,
              left: 0,
              right: 0,
              zIndex: 10,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                px: 1,
                py: 0.5,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Recent Searches
              </Typography>
              <Button
                size="small"
                color="error"
                onMouseDown={() => setSearchHistory([])}
                sx={{ minWidth: 0, p: 0.5, fontSize: 12 }}
              >
                Clear All
              </Button>
            </Box>
            <MuiList dense>
              {searchHistory.map((item, idx) => (
                <ListItem
                  button
                  key={idx}
                  onMouseDown={async () => {
                    setSearch(item);
                    await handleSearch(item);
                  }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSearchHistory((h) => h.filter((_, i) => i !== idx));
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText primary={item} />
                </ListItem>
              ))}
            </MuiList>
          </Paper>
        )}
        <Tooltip title="Filter providers">
          <IconButton
            onClick={handleFilterClick}
            size="large"
            sx={{
              ml: 1,
              borderRadius: 2,
              boxShadow: 1,
              border: '1.5px solid #d0d7e2',
              background: '#fff',
              p: 1,
            }}
          >
            <FilterListIcon />
          </IconButton>
        </Tooltip>
      </Box>
      {/* Floating filter bar as popover */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleFilterClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            p: 2,
            minWidth: 270,
            maxHeight: 400,
            overflow: 'auto',
            borderRadius: 2,
            boxShadow: 6,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'primary.main' }}
          >
            Provider Visibility
          </Typography>
          <Button
            onClick={() => setProviderStates({})}
            size="small"
            variant="outlined"
            color="error"
            sx={{ fontWeight: 700, ml: 2 }}
          >
            Clear All
          </Button>
        </Box>
        <Divider sx={{ mb: 1 }} />
        <MuiList dense>
          {allCompanies.map((company) => {
            const state = providerStates[company] || 'normal';
            let icon = '⚪';
            if (state === 'highlighted') icon = '⭐';
            if (state === 'hidden') icon = '🚫';
            return (
              <ListItem
                key={company}
                sx={{
                  ...(providerStates[company] === 'highlighted'
                    ? {
                        background:
                          'linear-gradient(90deg, #fffbe6 60%, #ffe066 100%)',
                        border: 'none',
                        borderRadius: 1,
                        boxShadow: 'none',
                        paddingLeft: 2,
                        paddingRight: 2,
                        margin: 0,
                        minHeight: 40,
                        alignItems: 'center',
                        display: 'flex',
                      }
                    : {}),
                  alignItems: 'center',
                  display: 'flex',
                  width: '100%',
                }}
                button
                onClick={() => handleProviderState(company)}
              >
                <ListItemText
                  primary={
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        style={{
                          minWidth: 32,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                          color: '#555',
                          marginRight: 6,
                        }}
                      >
                        [{companyCounts[company] || 0}]
                      </span>
                      <span style={{ flex: 1 }}>{company}</span>
                    </span>
                  }
                />
                <Box sx={{ ml: 1, fontSize: 22 }}>{icon}</Box>
              </ListItem>
            );
          })}
        </MuiList>
      </Popover>
      {/* List view of closest providers */}
      {searchMarker && listViewOpen && (
        <Paper
          sx={{
            position: 'absolute',
            top: 90,
            left: 24,
            zIndex: 1200,
            width: 340,
            maxHeight: '80vh',
            overflow: 'auto',
            p: 2,
            borderRadius: 3,
            boxShadow: 4,
            scrollbarWidth: 'auto', // Firefox
            '&::-webkit-scrollbar': {
              width: '10px',
              background: '#f0f0f0',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#bdbdbd',
              borderRadius: '8px',
            },
            '&': {
              overflowY: 'scroll',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Closest Providers to:
            </Typography>
            <Button
              size="small"
              onClick={() => setListViewOpen(false)}
              sx={{ ml: 2 }}
            >
              Hide
            </Button>
          </Box>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {searchMarker.address}
          </Typography>
          <List dense>
            {sortedProviders.slice(0, 10).map((p, idx) => (
              <ListItem
                key={p['Provider number'] || idx}
                button
                ref={(el) => {
                  listItemRefs.current[p['Provider number']] = el;
                }}
                onClick={() => {
                  // Find the marker ref for the group at this provider's location
                  const group = grouped.find(
                    (g) =>
                      Math.abs(
                        parseFloat(g[0].Latitude) - parseFloat(p.Latitude)
                      ) < 1e-5 &&
                      Math.abs(
                        parseFloat(g[0].Longitude) - parseFloat(p.Longitude)
                      ) < 1e-5
                  );
                  let ref = null;
                  if (group && group[0]['Provider number']) {
                    ref = markerRefs.current[group[0]['Provider number']];
                  }
                  if (ref && ref.openPopup) {
                    ref.openPopup();
                  }
                  if (ref && ref._latlng && mapRef.current) {
                    mapRef.current.setView(ref._latlng, 15, { animate: true });
                  }
                  setHighlightedProviderId(p['Provider number']);
                  // Wait for popup to open, then scroll to grouped provider
                  setTimeout(() => {
                    const popupEl =
                      groupedListRefs.current[p['Provider number']];
                    if (popupEl && popupEl.scrollIntoView) {
                      popupEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }
                  }, 350);
                }}
                onMouseEnter={() => {
                  setHoveredProviderId(p['Provider number']);
                  setHighlightedProviderId(p['Provider number']);
                }}
                onMouseLeave={() => {
                  setHoveredProviderId(null);
                  setHighlightedProviderId(null);
                }}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  mb: 1,
                  background:
                    providerStates[p.Company] === 'highlighted'
                      ? 'linear-gradient(90deg, #fffbe6 60%, #ffe066 100%)'
                      : hoveredProviderId === p['Provider number']
                      ? 'rgba(0, 123, 255, 0.08)'
                      : undefined,
                  borderRadius:
                    providerStates[p.Company] === 'highlighted' ||
                    hoveredProviderId === p['Provider number']
                      ? 1
                      : undefined,
                  boxShadow:
                    providerStates[p.Company] === 'highlighted' ? 2 : undefined,
                  px:
                    providerStates[p.Company] === 'highlighted' ? 1 : undefined,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {p.Company}
                </Typography>
                <Typography variant="caption">
                  {p['Business address']}, {p.Suburb}, {p.State} {p.Postcode}
                </Typography>
                <Typography variant="caption" sx={{ color: 'primary.main' }}>
                  Distance: {p.distance.toFixed(2)} km
                </Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
      {/* 1. Add a floating button to show the list view when hidden */}
      {!listViewOpen && searchMarker && (
        <Button
          variant="contained"
          color="primary"
          sx={{
            position: 'absolute',
            top: 90,
            left: 24,
            zIndex: 1300,
            fontWeight: 700,
            borderRadius: 2,
            boxShadow: 3,
            px: 2,
            py: 1,
          }}
          onClick={() => setListViewOpen(true)}
        >
          Show Closest Providers
        </Button>
      )}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={5}
        style={{ height: '100vh', width: '100vw', zIndex: 0 }}
        whenCreated={(map) => {
          mapRef.current = map;
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapSearchFocus searchMarker={searchMarker} />
        {/* Draw polyline from search marker to highlighted provider marker */}
        {searchMarker &&
          highlightedProviderId &&
          (() => {
            const highlightedProvider = providers.find(
              (p) => p['Provider number'] === highlightedProviderId
            );
            if (
              highlightedProvider &&
              highlightedProvider.Latitude &&
              highlightedProvider.Longitude
            ) {
              // Calculate offset for marker base (approximate, since 1 deg lat ~ 111km)
              const markerHeightMeters = 41; // marker icon height in px
              const metersPerPixel = (lat) =>
                (156543.03392 * Math.cos((lat * Math.PI) / 180)) /
                Math.pow(2, 15); // at zoom 15
              const offsetLatLng = (lat, lng) => {
                const metersPerPx = metersPerPixel(lat);
                const offsetMeters = markerHeightMeters / 2; // half icon height
                const dLat = offsetMeters / 111320; // 1 deg lat ~ 111.32km
                return [lat + dLat, lng];
              };
              const searchBase = offsetLatLng(
                searchMarker.lat,
                searchMarker.lng
              );
              const providerBase = offsetLatLng(
                parseFloat(highlightedProvider.Latitude),
                parseFloat(highlightedProvider.Longitude)
              );
              return (
                <Polyline
                  positions={[searchBase, providerBase]}
                  pathOptions={{
                    color: 'red',
                    weight: 3,
                    dashArray: '6 8',
                    opacity: 0.85,
                  }}
                />
              );
            }
            return null;
          })()}
        {grouped.map((group, i) => {
          // Prioritize: red (search), yellow (favorite), then normal
          let icon = DefaultIcon;
          if (
            searchMarker &&
            group.some(
              (p) =>
                Math.abs(parseFloat(p.Latitude) - searchMarker.lat) < 1e-5 &&
                Math.abs(parseFloat(p.Longitude) - searchMarker.lng) < 1e-5
            )
          ) {
            icon = L.icon({
              iconUrl:
                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
              shadowUrl: iconShadow,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            });
          } else if (
            group.some((p) => providerStates[p.Company] === 'highlighted')
          ) {
            icon = L.icon({
              iconUrl:
                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
              shadowUrl: iconShadow,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            });
          }
          // Attach ref for all providers in the group
          const mainProviderId = group[0]['Provider number'];
          return (
            <Marker
              key={i}
              position={[
                parseFloat(group[0].Latitude),
                parseFloat(group[0].Longitude),
              ]}
              icon={icon}
              ref={(ref) => {
                if (mainProviderId) markerRefs.current[mainProviderId] = ref;
                // Attach the same ref for all providers in this group
                group.forEach((p) => {
                  if (p['Provider number'])
                    markerRefs.current[p['Provider number']] = ref;
                });
              }}
            >
              <Popup minWidth={220} maxWidth={260}>
                <Box
                  sx={{
                    maxHeight: 220,
                    overflowY: group.length > 2 ? 'auto' : 'visible',
                  }}
                >
                  {group.length === 1 ? (
                    <ProviderDetails
                      provider={group[0]}
                      providerStates={providerStates}
                    />
                  ) : (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, mb: 0.5 }}
                      >
                        {group.length} providers at this location:
                      </Typography>
                      {/* Show scroll-for-more only in grouped marker popups if many providers */}
                      {group.length > 4 && (
                        <Box
                          sx={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: '#888', fontSize: 18 }}
                          >
                            ↓ Scroll for more ↓
                          </Typography>
                        </Box>
                      )}
                      <List dense sx={{ p: 0 }}>
                        {group.map((p, idx) => (
                          <ListItem
                            key={idx}
                            disablePadding
                            ref={(el) => {
                              if (!groupedListRefs.current)
                                groupedListRefs.current = {};
                              groupedListRefs.current[p['Provider number']] =
                                el;
                            }}
                            sx={{
                              p: 0,
                              m: 0,
                              background:
                                activePopupProviderId === p['Provider number']
                                  ? 'rgba(255, 235, 59, 0.18)'
                                  : undefined,
                            }}
                          >
                            <ProviderDetails
                              provider={p}
                              providerStates={providerStates}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Box>
              </Popup>
            </Marker>
          );
        })}
        {searchMarker && (
          <Marker
            position={[searchMarker.lat, searchMarker.lng]}
            icon={L.icon({
              iconUrl:
                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
              shadowUrl: iconShadow,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            })}
          >
            <Popup minWidth={220} maxWidth={260}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Search Location
              </Typography>
              <Typography variant="caption">{searchMarker.address}</Typography>
            </Popup>
          </Marker>
        )}
        <MapSearchFocus searchMarker={searchMarker} />
      </MapContainer>
      {showUpdatePopup && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.18)',
          }}
        >
          <Paper
            sx={{
              minWidth: 340,
              maxWidth: 420,
              p: 4,
              borderRadius: 4,
              boxShadow: 8,
              background: 'rgba(255,255,255,0.98)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                mb: 1,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: 'primary.main', flex: 1 }}
              >
                What’s New (v{APP_VERSION})
              </Typography>
              <IconButton
                onClick={() => setShowUpdatePopup(false)}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </Box>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-line',
                mb: 2,
                color: '#333',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {UPDATE_SUMMARY}
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowUpdatePopup(false)}
              sx={{
                alignSelf: 'flex-end',
                mt: 1,
                borderRadius: 2,
                fontWeight: 600,
                px: 3,
              }}
            >
              Dismiss
            </Button>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

function MapSearchFocus({ searchMarker }) {
  const map = useMap();
  React.useEffect(() => {
    if (searchMarker) {
      map.setView([searchMarker.lat, searchMarker.lng], 13, { animate: true }); // Changed zoom from 15 to 13
    }
  }, [searchMarker, map]);
  return null;
}

function ProviderDetails({ provider, providerStates }) {
  const state = providerStates[provider.Company] || 'normal';
  return (
    <Box
      sx={{
        px: 1,
        py: 0.5,
        bgcolor: state === 'highlighted' ? 'gold' : undefined,
        border: state === 'highlighted' ? '2px solid #ffb300' : undefined,
        borderRadius: 1,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'primary.main',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
        component="a"
        href={provider.Link}
        target="_blank"
        rel="noopener"
        onClick={(e) => {
          // Only stop propagation, do NOT favorite on link click
          e.stopPropagation();
        }}
      >
        {provider.Name || provider.Company}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
        {provider['Business address']}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
        {provider.Suburb}, {provider.State} {provider.Postcode}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
        Region: {provider.Region}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
        Phone: {provider.Phone}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
        Provider #: {provider['Provider number']}
      </Typography>
    </Box>
  );
}
