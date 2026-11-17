# PMTiles basemap directory

Martin serves each `.pmtiles` archive in this directory, from its next
start, as a source named after the file: `basemap.pmtiles` is served at
`/tiles/basemap` (TileJSON) and `/tiles/basemap/{z}/{x}/{y}`. The coalition
map in the client reads `basemap` and nothing else
(`apps/blackout-client/src/app/features/coalition/tabs/basemapStyle.ts`);
without it, the map draws its pins on a plain background and says the
background did not load.

## Getting one

The stack runs from a copy of `infra/single-server-baseline` (`deploy.sh`'s
`$INFRA_DIR`, `/opt/blackout-infra` by default), so the basemap goes into
that copy's `martin/pmtiles/`, and compose runs from there
(`docs/runbooks/SPATIAL_LAYER_BASE.md`, 1.3):

```sh
# In the repository checkout, from infra/single-server-baseline/.
# An area: west,south,east,north in degrees. Fewer zoom levels are much
# smaller; the map keeps zooming past the last one.
./martin/fetch-basemap.sh --into /opt/blackout-infra \
  --bbox -77.12,38.80,-76.91,38.99 --maxzoom 14
# How big would it be? Nothing is downloaded:
./martin/fetch-basemap.sh --into /opt/blackout-infra \
  --bbox -77.12,38.80,-76.91,38.99 --dry-run
# Then, from the live directory:
cd /opt/blackout-infra
docker compose up -d --no-deps --force-recreate martin
docker compose exec martin wget -qO- http://127.0.0.1:3000/basemap
```

The script needs `curl` and the `pmtiles` command
([go-pmtiles](https://github.com/protomaps/go-pmtiles), BSD-3-Clause). It
refuses a directory without a `docker-compose.yml` and a `.env`, and
extracts the area from the newest version 4
[Protomaps daily build](https://maps.protomaps.com/builds/) (the whole
planet is about 140 GB; `pmtiles extract` reads only the parts it needs),
writes `basemap.pmtiles.partial` and renames it when it is complete, so a
failed run leaves the previous basemap in place. `--build YYYYMMDD` picks
an older version 4 build; `--region area.geojson` takes a polygon instead
of a box.

The client's style is Protomaps' own for its v4 tiles
(`@protomaps/basemaps` 5.7.2), so the basemap has to be a Protomaps build
(they were v4.15.2 in November 2026). `pmtiles convert` turns an MBTiles
file into PMTiles; it does not read an OpenStreetMap `.osm.pbf` extract.

## Modifications from upstream

None. We adopt the upstream PMTiles format and the upstream Protomaps
build as-is. The only project-specific touches are the bind mount in
`docker-compose.yml` and the file name the client asks for.

## License

PMTiles archives derived from OpenStreetMap data carry the
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) license. The
coalition map's attribution reads "© OpenStreetMap contributors", per the
OSM attribution guidelines.
