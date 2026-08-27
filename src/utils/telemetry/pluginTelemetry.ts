// nuked
import { createHash } from 'crypto'; import { sep } from 'path'; import { isOfficialMarketplaceName, parsePluginIdentifier } from '../plugins/pluginIdentifier.js';
const BUILTIN='builtin'; const SALT='claude-plugin-telemetry-v1';
export function hashPluginId(n: string, m?: string): string { const k=m?`${n}@${m.toLowerCase()}`:n; return createHash('sha256').update(k+SALT).digest('hex').slice(0,16); }
export type TelemetryPluginScope='official'|'org'|'user-local'|'default-bundle';
export function getTelemetryPluginScope(n: string, m: string|undefined, managed: Set<string>|null): TelemetryPluginScope { if(m===BUILTIN) return 'default-bundle'; if(isOfficialMarketplaceName(m)) return 'official'; if(managed?.has(n)) return 'org'; return 'user-local'; }
export type EnabledVia='user-install'|'org-policy'|'default-enable'|'seed-mount'; export type InvocationTrigger='user-slash'|'claude-proactive'|'nested-skill'; export type SkillExecutionContext='fork'|'inline'|'remote'; export type InstallSource='cli-explicit'|'ui-discover'|'ui-suggestion'|'deep-link';
export function getEnabledVia(p:{name:string;path:string;isBuiltin?:boolean},m:Set<string>|null,s:string[]):EnabledVia{ if(p.isBuiltin) return 'default-enable'; if(m?.has(p.name)) return 'org-policy'; if(s.some(d=>p.path.startsWith(d.endsWith(sep)?d:d+sep))) return 'seed-mount'; return 'user-install';}
export function buildPluginTelemetryFields(n:string,m:string|undefined,man:Set<string>|null=null){const s=getTelemetryPluginScope(n,m,man);const c=s==='official'||s==='default-bundle';return{plugin_id_hash:hashPluginId(n,m),plugin_scope:s,plugin_name_redacted:c?n:'third-party',marketplace_name_redacted:c&&m?m:'third-party',is_official_plugin:c};}
export function buildPluginCommandTelemetryFields(pi:{pluginManifest:{name:string};repository:string},m:Set<string>|null=null){const {marketplace}=parsePluginIdentifier(pi.repository);return buildPluginTelemetryFields(pi.pluginManifest.name,marketplace,m);}
export type PluginCommandErrorCategory='network'|'not-found'|'permission'|'validation'|'unknown';
export function classifyPluginCommandError(e:unknown):PluginCommandErrorCategory{const msg=String((e as{message?:unknown})?.message??e);if(/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network|Could not resolve|Connection refused|timed out/i.test(msg))return'network';if(/\b404\b|not found|does not exist|no such plugin/i.test(msg))return'not-found';if(/\b40[13]\b|EACCES|EPERM|permission denied|unauthorized/i.test(msg))return'permission';if(/invalid|malformed|schema|validation|parse error/i.test(msg))return'validation';return'unknown';}
export function logPluginsEnabledForSession():void{}
export function logPluginLoadErrors():void{}
