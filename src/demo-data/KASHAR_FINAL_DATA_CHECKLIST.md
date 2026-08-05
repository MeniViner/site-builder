# Kashar final-data checklist

The editable source of truth is [`kasharFinalData`](./kasharDemoData.js). Replace the following before production use:

- Confirm the display name, short name, subtitle, hero copy, and the final demo/production disclaimer.
- Supply the unit-approved local portrait of תא״ל עומר כהן; the fixture intentionally leaves `commanderPortrait.localPath` empty until the official file can be obtained without substituting another person.
- Replace all synthetic organization-tree labels, navigation targets, network-folder path, widgets, gallery assets, and Gantt dates/items with approved unit data.
- Validate access, ownership, and content approvals for every real link; the demo deliberately contains no real contacts, personal identifiers, credentials, or operational/network data.
- Review [`KASHAR_ASSET_SOURCES.md`](./KASHAR_ASSET_SOURCES.md) and record an external source URL or licensing approval for every newly approved asset.

The navigation normalizer preserves the synthetic UNC target but stores its `network-folder` entry as a generic `link`; this is the existing supported behavior, not a separate network-folder record type.
