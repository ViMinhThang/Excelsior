import { profileCheckpoint } from '../utils/startupProfiler.js'
import '../bootstrap/state.js'
import '../utils/config.js'
import memoize from 'lodash-es/memoize.js'
import { getIsNonInteractiveSession } from 'src/bootstrap/state.js'
import { shutdownLspServerManager } from '../services/lsp/manager.js'
import { populateOAuthAccountInfoIfNeeded } from '../services/oauth/client.js'
import {
  initializePolicyLimitsLoadingPromise,
  isPolicyLimitsEligible,
} from '../services/policyLimits/index.js'
import {
  initializeRemoteManagedSettingsLoadingPromise,
  isEligibleForRemoteManagedSettings,
} from '../services/remoteManagedSettings/index.js'
import { preconnectAnthropicApi } from '../utils/apiPreconnect.js'
import { applyExtraCACertsFromConfig } from '../utils/caCertsConfig.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { enableConfigs, recordFirstStartTime } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { detectCurrentRepository } from '../utils/detectRepository.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { initJetBrainsDetection } from '../utils/envDynamic.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { ConfigParseError } from '../utils/errors.js'
import {
  gracefulShutdownSync,
  setupGracefulShutdown,
} from '../utils/gracefulShutdown.js'
import {
  applySafeConfigEnvironmentVariables,
} from '../utils/managedEnv.js'
import { configureGlobalMTLS } from '../utils/mtls.js'
import {
  ensureScratchpadDir,
  isScratchpadEnabled,
} from '../utils/permissions/filesystem.js'
import { configureGlobalAgents } from '../utils/proxy.js'
import { setShellIfWindows } from '../utils/windowsPaths.js'

export const init = memoize(async (): Promise<void> => {
  const initStartTime = Date.now()
  logForDiagnosticsNoPII('info', 'init_started')
  profileCheckpoint('init_function_start')
  try {
    const configsStart = Date.now()
    enableConfigs()
    logForDiagnosticsNoPII('info', 'init_configs_enabled', { duration_ms: Date.now() - configsStart })
    profileCheckpoint('init_configs_enabled')
    const envVarsStart = Date.now()
    applySafeConfigEnvironmentVariables()
    applyExtraCACertsFromConfig()
    logForDiagnosticsNoPII('info', 'init_safe_env_vars_applied', { duration_ms: Date.now() - envVarsStart })
    profileCheckpoint('init_safe_env_vars_applied')
    setupGracefulShutdown()
    profileCheckpoint('init_after_graceful_shutdown')
    void Promise.all([
      import('../services/analytics/firstPartyEventLogger.js'),
      import('../services/analytics/growthbook.js'),
    ]).then(([fp, gb]) => {
      fp.initialize1PEventLogging()
      gb.onGrowthBookRefresh(() => { void fp.reinitialize1PEventLoggingIfConfigChanged() })
    })
    profileCheckpoint('init_after_1p_event_logging')
    void populateOAuthAccountInfoIfNeeded()
    profileCheckpoint('init_after_oauth_populate')
    void initJetBrainsDetection()
    profileCheckpoint('init_after_jetbrains_detection')
    void detectCurrentRepository()
    if (isEligibleForRemoteManagedSettings()) initializeRemoteManagedSettingsLoadingPromise()
    if (isPolicyLimitsEligible()) initializePolicyLimitsLoadingPromise()
    profileCheckpoint('init_after_remote_settings_check')
    recordFirstStartTime()
    const mtlsStart = Date.now()
    logForDebugging('[init] configureGlobalMTLS starting')
    configureGlobalMTLS()
    logForDiagnosticsNoPII('info', 'init_mtls_configured', { duration_ms: Date.now() - mtlsStart })
    logForDebugging('[init] configureGlobalMTLS complete')
    const proxyStart = Date.now()
    logForDebugging('[init] configureGlobalAgents starting')
    configureGlobalAgents()
    logForDiagnosticsNoPII('info', 'init_proxy_configured', { duration_ms: Date.now() - proxyStart })
    logForDebugging('[init] configureGlobalAgents complete')
    profileCheckpoint('init_network_configured')
    preconnectAnthropicApi()
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
      try {
        const { initUpstreamProxy, getUpstreamProxyEnv } = await import('../upstreamproxy/upstreamproxy.js')
        const { registerUpstreamProxyEnvFn } = await import('../utils/subprocessEnv.js')
        registerUpstreamProxyEnvFn(getUpstreamProxyEnv)
        await initUpstreamProxy()
      } catch (err) { logForDebugging(`[init] upstreamproxy init failed: ${err instanceof Error ? err.message : String(err)}; continuing without proxy`, { level: 'warn' }) }
    }
    setShellIfWindows()
    registerCleanup(shutdownLspServerManager)
    registerCleanup(async () => {
      const { cleanupSessionTeams } = await import('../utils/swarm/teamHelpers.js')
      await cleanupSessionTeams()
    })
    if (isScratchpadEnabled()) {
      const scratchpadStart = Date.now()
      await ensureScratchpadDir()
      logForDiagnosticsNoPII('info', 'init_scratchpad_created', { duration_ms: Date.now() - scratchpadStart })
    }
    logForDiagnosticsNoPII('info', 'init_completed', { duration_ms: Date.now() - initStartTime })
    profileCheckpoint('init_function_end')
  } catch (error) {
    if (error instanceof ConfigParseError) {
      if (getIsNonInteractiveSession()) {
        process.stderr.write(`Configuration error in ${error.filePath}: ${error.message}\n`)
        gracefulShutdownSync(1)
        return
      }
      return import('../components/InvalidConfigDialog.js').then(m => m.showInvalidConfigDialog({ error }))
    } else { throw error }
  }
})

// Telemetry nuked — no-op
export function initializeTelemetryAfterTrust(): void {}
