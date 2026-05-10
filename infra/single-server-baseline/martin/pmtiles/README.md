# PMTiles basemap directory

Drop `.pmtiles` archives in this directory and Martin will serve them
on next start at `/<filename>/{z}/{x}/{y}`.

## Recommended source

[Protomaps](https://protomaps.com/) publishes daily planet builds:
<https://maps.protomaps.com/builds/>. The full planet is ~110 GB; for
most BMC deployments a regional extract is enough and is buildable
with the `pmtiles` CLI from a Geofabrik or BBBike OSM extract.

```sh
# Example: build a North America extract from a Geofabrik PBF.
# Requires the protomaps `pmtiles` CLI (Apache-2.0):
#   https://github.com/protomaps/go-pmtiles
pmtiles convert north-america-latest.osm.pbf north-america.pmtiles
mv north-america.pmtiles ./
```

Once the file is here, restart Martin:

```sh
docker compose restart martin
curl -sf http://localhost/tiles/north-america/0/0/0 -o /dev/null && echo OK
```

## Modifications from upstream

None. We adopt the upstream PMTiles format and the upstream Protomaps
build pipeline as-is. The only project-specific touch is the bind
mount in `docker-compose.yml`.

## License

PMTiles archives derived from OpenStreetMap data carry the
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) license.
Attribute "© OpenStreetMap contributors" in the Coalition layer UI
per the OSM attribution guidelines.
