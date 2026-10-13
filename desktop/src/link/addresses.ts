/**
 * Where a phone can reach the desk, best first (link.md, Pairing code): its
 * LAN IPv4 addresses, the Wi-Fi and Ethernet ports before the rest, then
 * `<LocalHostName>.local`, then a Tailscale address (100.64.0.0/10) if it
 * has one. Internal and link-local addresses are never offered. The ordering
 * is pure, so plain node tests it.
 */
import { execFileSync } from 'child_process';
import * as os from 'os';

type Interfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** 100.64.0.0/10: the carrier-grade NAT range Tailscale hands out. */
function isTailscale(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

function isLinkLocal(ip: string): boolean {
  return ip.startsWith('169.254.');
}

/** `en0`, `en1`, `eth0`: the ports a phone on the same network is likely to share. */
const PRIMARY = /^(en|eth)\d+$/;

export function orderAddresses(interfaces: Interfaces, port: number, localHostName: string | null): string[] {
  const lan: { name: string; ip: string }[] = [];
  const tailscale: string[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      // Node 18 said 4; later versions say 'IPv4'.
      if ((entry.family as unknown) !== 'IPv4' && (entry.family as unknown) !== 4) continue;
      if (entry.internal || isLinkLocal(entry.address)) continue;
      if (isTailscale(entry.address)) tailscale.push(entry.address);
      else lan.push({ name, ip: entry.address });
    }
  }
  const rank = (name: string) => (PRIMARY.test(name) ? 0 : 1);
  lan.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  const hosts = [...lan.map((a) => a.ip), ...(localHostName ? [`${localHostName}.local`] : []), ...tailscale];
  return [...new Set(hosts)].map((host) => `${host}:${port}`);
}

function scutil(key: string): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    return execFileSync('/usr/sbin/scutil', ['--get', key], { encoding: 'utf-8', timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

/** The Mac's Bonjour name (`Georges-MacBook-Pro`), asked once. */
let bonjour: string | null | undefined;
export function localHostName(): string | null {
  if (bonjour === undefined) bonjour = scutil('LocalHostName');
  return bonjour;
}

/** Where the desk listens now; asked again for each code and each hello, since DHCP moves them. */
export function deskAddresses(port: number): string[] {
  return orderAddresses(os.networkInterfaces(), port, localHostName());
}

/** The computer's name, as the phone shows it: `George's MacBook Pro`, at most 64 characters. */
export function deskName(): string {
  const name = scutil('ComputerName') ?? os.hostname().replace(/\.local$/, '');
  return [...name].slice(0, 64).join('');
}
