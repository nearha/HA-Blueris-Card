# Blue Iris UI3 Card

Custom Lovelace card for Blue Iris UI3.

Modes:

- **Standalone / direct**: use only the card. It opens UI3 directly from the Blue Iris server. Login can be left blank for LAN/no-auth, or configured in the card for testing with a limited Blue Iris user.
- **Backend / integration**: use the optional `blueiris_ui3` Home Assistant custom integration. Credentials stay in the backend, and the card uses HA API/proxy.

Minimal direct config:

```yaml
type: custom:blueiris-ui3-card
mode: direct
host: 10.10.30.20
port: 80
direct_auth: none
default_group: index
default_profile: 1080p^
```

Direct with frontend credentials, for a limited Blue Iris user:

```yaml
type: custom:blueiris-ui3-card
mode: direct
host: 10.10.30.20
port: 80
username: ha_viewer
password: your_password
direct_auth: auto
manual_groups:
  - id: index
    name: Todas
profiles:
  - id: 1080p^
    name: 1080p
  - id: 720p^
    name: 720p
```

Backend mode:

```yaml
type: custom:blueiris-ui3-card
mode: backend
backend_entry_id: your_config_entry_id
default_group: index
default_profile: 1080p^
```

The card includes a visual editor in the Home Assistant dashboard UI.
