# Image Gallery managed data type

## Persistence and compatibility

Image Gallery is a branch of the existing master configuration, not a separate
database or browser-only data path:

```json
{
  "imageGalleries": {
    "schemaVersion": 1,
    "items": [
      {
        "id": "gallery-...",
        "title": "...",
        "description": "",
        "active": true,
        "style": "classic-carousel",
        "order": 0,
        "images": [
          {
            "id": "gallery-image-...",
            "mediaRef": "/images/ImageGallery/photo.webp",
            "alt": "...",
            "caption": "",
            "width": 1600,
            "height": 900,
            "media": {
              "fileName": "photo.webp",
              "mimeType": "image/webp",
              "sizeBytes": 12345
            }
          }
        ]
      }
    ]
  }
}
```

The existing `ConfigAdapter` persists this branch through the current TXT or
Mongo master-config repository. Therefore it inherits site isolation,
optimistic concurrency, audit revisions, role-gated admin access, full-site
backup/restore, and import/export without a second API or collection. Existing
configurations receive an empty `imageGalleries.items` branch during
normalization; no migration job or manual data repair is required.

Only a stable `mediaRef` and file metadata are saved in the configuration.
`data:`, `blob:`, and executable URL schemes are rejected. Production upload
uses the established SharePoint image storage path under `ImageGallery`.
Local/mock development stores file bytes in IndexedDB and persists a stable
`gallery-media://` reference in configuration. An exported local backup keeps
that reference and metadata but intentionally does not include the local
binary; restoring it on another browser therefore shows the designed missing
media state until the image is uploaded again.

## Homepage behavior

Only galleries with `active: true`, a title, and at least one image with both a
valid media reference and alt text are rendered. They are ordered by `order`
and appear after existing homepage sections and external links, immediately
before the fixed site footer. This leaves all earlier homepage sections and
their ordering unchanged.

Available styles:

- `classic-carousel` — primary image, controls, and pagination.
- `center-carousel` — emphasized center image with adjacent previews.
- `coverflow` — layered, depth-oriented cards with restrained motion.
- `masonry` — responsive image columns and an accessible enlarged viewer.

The carousels support RTL/LTR-aware arrows, keyboard arrows, pointer swipe,
visible focus states, lazy loading of non-primary images, reserved dimensions,
and `prefers-reduced-motion`. They never autoplay. The masonry viewer supports
Escape and arrow-key navigation.

## Dependencies and license review

No new runtime or development dependencies were added. The implementation uses
React, Tailwind utility classes, lucide-react, and IndexedDB already available
in the application/browser platform. There are no new packages, transitive
dependencies, licenses, or closed-environment whitelist entries.

The required external inspection completed against
`https://github.com/nehoray121/magal`, branch `meni`, commit `d578571`
(`magal web site`). The branch exists and includes a `GalleryStrip` with
multiple managed rows and a gallery page. It has no `LICENSE` or `LICENSE.md`
file. Consequently no source code was copied. The only adapted idea is the
high-level use of multiple ordered image strips/cards; Site Builder's four
renderers, data schema, interactions, and accessibility code are original.
