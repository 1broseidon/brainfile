export const STATE_ENTRY_TYPE = 'brainfile-extension-state';
export const STATUS_KEY = 'brainfile';
export const WIDGET_KEY = 'brainfile-task';
export const LISTENER_SAFETY_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_LISTENER_ASSIGNEE = 'worker';
export const DEFAULT_STALE_TIMEOUT_SECONDS = 3600;
export const DEFAULT_WORKER_PRESENCE_TTL_SECONDS = 45;
export const WORKER_HEARTBEAT_INTERVAL_MS = 20_000;
export const WORKER_CLAIM_REFRESH_INTERVAL_MS = 10_000;
export const WORKER_CLAIM_LEASE_SECONDS = 90;
export const WORKER_CLAIM_MAX_SLOT = 256;
export const PI_EVENTS_BASENAME = 'pi-events.jsonl';
export const WORKER_CLAIMS_DIRNAME = 'worker-claims';
export const PM_LOCK_DIRNAME = 'pm.lock';
export const PM_LOCK_LEASE_SECONDS = 120;
export const PM_LOCK_REFRESH_INTERVAL_MS = 30_000;

export const BF_LIST_TOOL = 'brainfile_list_tasks';
export const BF_GET_TOOL = 'brainfile_get_task';
export const BF_ADD_TOOL = 'brainfile_add_task';
export const BF_PATCH_TOOL = 'brainfile_patch_task';
export const BF_MOVE_TOOL = 'brainfile_move_task';
export const BF_COMPLETE_TOOL = 'brainfile_complete_task';
export const BF_SUBTASK_TOOL = 'brainfile_toggle_subtask';
export const BF_LOG_TOOL = 'brainfile_append_log';
export const BF_CONTRACT_PICKUP_TOOL = 'brainfile_contract_pickup';
export const BF_CONTRACT_DELIVER_TOOL = 'brainfile_contract_deliver';
export const BF_CONTRACT_VALIDATE_TOOL = 'brainfile_contract_validate';
export const BF_ADR_PROMOTE_TOOL = 'brainfile_adr_promote';
export const BF_SEND_MESSAGE_TOOL = 'brainfile_send_message';

export const BF_READ_ONLY_TOOLS = new Set<string>([
  BF_LIST_TOOL,
  BF_GET_TOOL,
]);

export const BF_MUTATING_TOOLS = new Set<string>([
  BF_ADD_TOOL,
  BF_PATCH_TOOL,
  BF_MOVE_TOOL,
  BF_COMPLETE_TOOL,
  BF_SUBTASK_TOOL,
  BF_LOG_TOOL,
  BF_SEND_MESSAGE_TOOL,
  BF_CONTRACT_PICKUP_TOOL,
  BF_CONTRACT_DELIVER_TOOL,
  BF_CONTRACT_VALIDATE_TOOL,
  BF_ADR_PROMOTE_TOOL,
]);

export const WRITE_BUILTINS = new Set<string>(['edit', 'write']);

export const SAFE_BASH_PATTERNS: RegExp[] = [
  /^\s*cat\b/i,
  /^\s*head\b/i,
  /^\s*tail\b/i,
  /^\s*less\b/i,
  /^\s*more\b/i,
  /^\s*grep\b/i,
  /^\s*find\b/i,
  /^\s*rg\b/i,
  /^\s*fd\b/i,
  /^\s*ls\b/i,
  /^\s*pwd\b/i,
  /^\s*tree\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*yarn\s+(list|info|why|audit)\b/i,
  /^\s*node\s+--version\b/i,
  /^\s*python\s+--version\b/i,
  /^\s*echo\b/i,
  /^\s*printf\b/i,
  /^\s*wc\b/i,
  /^\s*sort\b/i,
  /^\s*uniq\b/i,
  /^\s*diff\b/i,
  /^\s*file\b/i,
  /^\s*stat\b/i,
  /^\s*du\b/i,
  /^\s*df\b/i,
  /^\s*uname\b/i,
  /^\s*whoami\b/i,
  /^\s*id\b/i,
  /^\s*date\b/i,
  /^\s*uptime\b/i,
  /^\s*ps\b/i,
  /^\s*top\b/i,
  /^\s*htop\b/i,
  /^\s*free\b/i,
  /^\s*env\b/i,
  /^\s*printenv\b/i,
  /^\s*which\b/i,
  /^\s*whereis\b/i,
  /^\s*type\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*awk\b/i,
  /^\s*jq\b/i,
];

export const DESTRUCTIVE_BASH_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)\b/i,
  /\byarn\s+(add|remove|install|publish)\b/i,
  /\bpnpm\s+(add|remove|install|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/i,
  /\bbrew\s+(install|uninstall|upgrade)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
  /\bservice\s+\S+\s+(start|stop|restart)\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];
