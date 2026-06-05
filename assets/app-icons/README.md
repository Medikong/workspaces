# Ticketmong app icons

App icon exports are grouped by icon variant first, then by target platform.

```text
app-icons/
  primary/
    source.png
    ios/
    android/
    web/
  mascot/
    source.png
    ios/
    android/
    web/
```

## Variants

- `primary`: default app icon source and exports.
- `mascot`: mascot-centered square icon source and exports.

## iOS sizes

- `ticketmong-icon-20.png`
- `ticketmong-icon-29.png`
- `ticketmong-icon-40.png`
- `ticketmong-icon-58.png`
- `ticketmong-icon-60.png`
- `ticketmong-icon-76.png`
- `ticketmong-icon-80.png`
- `ticketmong-icon-87.png`
- `ticketmong-icon-120.png`
- `ticketmong-icon-152.png`
- `ticketmong-icon-167.png`
- `ticketmong-icon-180.png`
- `ticketmong-icon-1024.png`

## Android sizes

- `ticketmong-icon-48.png`
- `ticketmong-icon-72.png`
- `ticketmong-icon-96.png`
- `ticketmong-icon-144.png`
- `ticketmong-icon-192.png`
- `ticketmong-icon-512.png`

## Web sizes

- `ticketmong-icon-16.png`
- `ticketmong-icon-32.png`
- `ticketmong-icon-180.png`
- `ticketmong-icon-192.png`
- `ticketmong-icon-512.png`

The `mascot` variant uses the same sizes with `ticketmong-mascot-icon-*.png` filenames.

Note: `primary/source.png` preserves the original PNG alpha channel. `mascot/source.png` is RGB. If a store upload requires an opaque icon, flatten the final upload image against the icon background first.
