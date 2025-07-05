import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
const yellowIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

  // Floating filter bar logic
  const handleFilterClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleFilterClose = () => {
    setAnchorEl(null);
  };
  const open = Boolean(anchorEl);

  // Search bar logic (address search, with history)
  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter' && search.trim()) {
      setSearchHistory((prev) => {
        const updated = [
          search.trim(),
          ...prev.filter((s) => s !== search.trim()),
        ].slice(0, MAX_HISTORY);
        return updated;
      });
    }
  };

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
        <IconButton
          onClick={() => {
            if (search.trim()) {
              setSearchHistory((prev) => {
                const updated = [
                  search.trim(),
                  ...prev.filter((s) => s !== search.trim()),
                ].slice(0, MAX_HISTORY);
                return updated;
              });
            }
          }}
          sx={{ ml: 1 }}
          size="large"
        >
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
                  onMouseDown={() => setSearch(item)}
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
                  // Always align content vertically and horizontally
                  alignItems: 'center',
                  display: 'flex',
                  width: '100%',
                }}
                button
                onClick={() => handleProviderState(company)}
              >
                <ListItemText
                  primary={
                    <span
                      style={{
                        fontWeight: state === 'highlighted' ? 700 : 400,
                        color: state === 'hidden' ? '#aaa' : undefined,
                      }}
                    >
                      {company}
                    </span>
                  }
                />
                <Box sx={{ ml: 1, fontSize: 22 }}>{icon}</Box>
              </ListItem>
            );
          })}
        </MuiList>
      </Popover>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={5}
        style={{ height: '100vh', width: '100vw', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {grouped.map((group, i) => (
          <Marker
            key={i}
            position={[
              parseFloat(group[0].Latitude),
              parseFloat(group[0].Longitude),
            ]}
            icon={
              group.some((p) => providerStates[p.Company] === 'highlighted')
                ? L.icon({
                    iconUrl:
                      'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
                    shadowUrl: iconShadow,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41],
                  })
                : DefaultIcon
            }
          >
            <Popup minWidth={220} maxWidth={260}>
              <Box>
                {group.length === 1 ? (
                  <ProviderDetails
                    provider={group[0]}
                    providerStates={providerStates}
                    handleProviderState={handleProviderState}
                  />
                ) : (
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, mb: 0.5 }}
                    >
                      {group.length} providers at this location:
                    </Typography>
                    <List dense sx={{ p: 0 }}>
                      {group.map((p, idx) => (
                        <ListItem key={idx} disablePadding sx={{ p: 0, m: 0 }}>
                          <ProviderDetails
                            provider={p}
                            providerStates={providerStates}
                            handleProviderState={handleProviderState}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
              </Box>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </Box>
  );
}

function ProviderDetails({ provider, providerStates, handleProviderState }) {
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
          e.stopPropagation();
          handleProviderState(provider.Company);
        }}
      >
        {provider.Company}
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
