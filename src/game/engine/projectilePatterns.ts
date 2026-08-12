import type { Projectile } from "../types.ts";

export function isBacklogFirewallPattern(pattern: Projectile["pattern"]) {
  return pattern === "backlog-firewall" || pattern === "backlog-firewall-red";
}
