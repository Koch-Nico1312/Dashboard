// Local brand assets from the upstream Umbrel app gallery. No browser requests
// to third-party icon services and no server-side fetching of user URLs.
export const appCatalog = [
	['jellyfin', 'Jellyfin', 'jellyfin'],
	['adguard-home', 'AdGuard Home', 'adguard'],
	['home-assistant', 'Home Assistant', 'home-assistant|homeassistant'],
	['nextcloud', 'Nextcloud', 'nextcloud'],
	['pi-hole', 'Pi-hole', 'pihole|pi-hole'],
	['plex', 'Plex', 'plex'],
	['ollama', 'Ollama', 'ollama'],
	['transmission', 'Transmission', 'transmission'],
	['tailscale', 'Tailscale', 'tailscale'],
	['uptime-kuma', 'Uptime Kuma', 'uptime-kuma'],
	['portainer', 'Portainer', 'portainer'],
	['syncthing', 'Syncthing', 'syncthing'],
	['gitea', 'Gitea', 'gitea'],
	['vaultwarden', 'Vaultwarden', 'vaultwarden'],
	['immich', 'Immich', 'immich'],
	['paperless-ngx', 'Paperless-ngx', 'paperless'],
	['n8n', 'n8n', 'n8n'],
	['grafana', 'Grafana', 'grafana'],
	['docker', 'Container', ''],
].map(([id, name, pattern]) => ({
	id,
	name,
	pattern,
	icon: id === 'docker' ? '/assets/ubuntu-apps/docker.svg' : `/assets/ubuntu-apps/${id}.svg`,
}))

export function identifyApp(image, name) {
	return (
		appCatalog.find((app) => app.pattern && new RegExp(`(?:^|[^a-z0-9])(?:${app.pattern})(?=$|[^a-z0-9])`, 'i').test(`${image} ${name}`)) || appCatalog.at(-1)
	)
}
