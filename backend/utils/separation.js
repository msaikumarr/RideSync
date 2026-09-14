// Three-tier group-safety status, computed from a member's distance to the
// group's reference point (see computeGroupCenter) relative to the trip's
// configured separation threshold.
const GROUP_STATUS = {
  TOGETHER: 'together',
  GETTING_SEPARATED: 'getting_separated',
  SEPARATED: 'separated'
};

// The "getting separated" warning zone starts at this fraction of the trip's
// separationThresholdKm, so the three-tier status scales with whatever
// threshold the trip owner picked instead of a fixed meter value baked in
// here (a walking group and a motorbike convoy need very different absolute
// distances to mean the same thing).
const GETTING_SEPARATED_RATIO = 0.6;

// A member only flips to "separated" after being measured beyond the
// threshold for at least this long — roughly 2-3 location ticks at the
// default 5s GPS interval — so a single GPS spike (tunnel, elevator,
// satellite drift) can't fire a false alert on its own.
const SEPARATION_CONFIRM_WINDOW_MS = 12000;

// Average lat/lng of the given locations — the group's reference point.
const computeGroupCenter = (locations) => {
  if (!locations || locations.length === 0) return null;

  const sum = locations.reduce(
    (acc, loc) => ({ lat: acc.lat + loc.lat, lng: acc.lng + loc.lng }),
    { lat: 0, lng: 0 }
  );

  return { lat: sum.lat / locations.length, lng: sum.lng / locations.length };
};

const classifyDistance = (distanceKm, thresholdKm) => {
  if (distanceKm <= thresholdKm * GETTING_SEPARATED_RATIO) return GROUP_STATUS.TOGETHER;
  if (distanceKm <= thresholdKm) return GROUP_STATUS.GETTING_SEPARATED;
  return GROUP_STATUS.SEPARATED;
};

const formatDistance = (km) => {
  if (km >= 1) return `${km.toFixed(1)}km`;
  return `${Math.round(km * 1000)}m`;
};

module.exports = {
  GROUP_STATUS,
  GETTING_SEPARATED_RATIO,
  SEPARATION_CONFIRM_WINDOW_MS,
  computeGroupCenter,
  classifyDistance,
  formatDistance
};
