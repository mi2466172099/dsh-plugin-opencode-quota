/**
 * Browser half of the OpenCode quota bundle.
 *
 * Adds a compact allowance chip to the composer tool row and a detail dialog
 * in the frame-wide overlay. Both read one Host Remote (`opencodeQuota/read`)
 * through the generic Connection RPC, so the API key never reaches the page.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-opencode-quota',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'opencodeQuota'

    /** Client-side dictionaries; Host display metadata lives in locale/*.json. */
    const DICT = {
      en: {
        'chip.label': 'OpenCode',
        'chip.title': 'OpenCode allowance: {detail}',
        'chip.unconfigured': 'no key',
        'chip.unauthorized': 'key rejected',
        'chip.error': 'unavailable',
        'chip.consoleOnly': 'see console',
        'window.rolling': '5-hour',
        'window.weekly': '7-day',
        'window.monthly': 'Monthly',
        'window.short.rolling': '5h',
        'window.short.weekly': '7d',
        'window.short.monthly': '1m',
        'window.rateLimited': 'rate-limited',
        'window.statusOther': '{status}',
        'dialog.title': 'OpenCode allowance',
        'dialog.lead': 'Read from the OpenCode API with the key configured in Settings → Models.',
        'dialog.refresh': 'Refresh',
        'dialog.close': 'Close',
        'dialog.loading': 'Reading…',
        'dialog.readAt': 'Read {time}',
        'dialog.remaining': '{percent}% left',
        'dialog.resets': 'Resets {time}',
        'dialog.inFlight': 'Refreshing…',
        'dialog.crashed': 'The quota dialog failed to render',
        'dialog.status.unconfigured':
          'No API key is configured for {provider}. Add it in Settings → Models → third-party providers (OpenCode), or set the {ref} environment variable.',
        'dialog.status.unauthorized':
          'OpenCode rejected the stored API key for {provider}. Check the key in Settings → Models.',
        'dialog.status.consoleOnly':
          'OpenCode Zen pay-as-you-go credits are not readable with an API key; see Overview → Credits in the OpenCode console.',
        'dialog.status.timeout': 'The OpenCode API did not answer in time.',
        'dialog.status.error': 'The OpenCode API call failed: {message}',
        'dialog.none': 'This DSH profile has no OpenCode provider configured, so there is no allowance to show.',
        'dialog.error': 'Could not read the allowance: {message}',
      },
      zh: {
        'chip.label': 'OpenCode',
        'chip.title': 'OpenCode 额度：{detail}',
        'chip.unconfigured': '未填密钥',
        'chip.unauthorized': '密钥被拒',
        'chip.error': '不可用',
        'chip.consoleOnly': '见控制台',
        'window.rolling': '5 小时',
        'window.weekly': '7 天',
        'window.monthly': '月度',
        'window.short.rolling': '5h',
        'window.short.weekly': '7d',
        'window.short.monthly': '月',
        'window.rateLimited': '已限流',
        'window.statusOther': '{status}',
        'dialog.title': 'OpenCode 额度',
        'dialog.lead': '用“设置 → 模型”中配置的 API 密钥从 OpenCode 接口读取。',
        'dialog.refresh': '刷新',
        'dialog.close': '关闭',
        'dialog.loading': '正在读取…',
        'dialog.readAt': '读取于 {time}',
        'dialog.remaining': '剩余 {percent}%',
        'dialog.resets': '{time} 重置',
        'dialog.inFlight': '正在刷新…',
        'dialog.crashed': '额度弹窗渲染失败',
        'dialog.status.unconfigured':
          '{provider} 尚未配置 API 密钥。请在“设置 → 模型 → 第三方模型提供商”中选择 OpenCode 并填入密钥，或设置环境变量 {ref}。',
        'dialog.status.unauthorized': 'OpenCode 拒绝了 {provider} 保存的 API 密钥，请在“设置 → 模型”中检查。',
        'dialog.status.consoleOnly':
          'OpenCode Zen 的按量额度不对 API 密钥开放，只能在 OpenCode 控制台的 Overview → Credits 查看。',
        'dialog.status.timeout': 'OpenCode 接口响应超时。',
        'dialog.status.error': '调用 OpenCode 接口失败：{message}',
        'dialog.none': '当前 DSH 配置中没有 OpenCode 提供商，因此没有可显示的额度。',
        'dialog.error': '无法读取额度：{message}',
      },
    }

    /** Component-local styles: only theme tokens, no literal palette colors. */
    const CSS = `
      /* Mirror the shipped compact ghost button (.sm): 28px tall, 10px side
         padding, 8px radius, transparent at rest and the interactive hover
         overlay on hover — the same pair the permission control uses. */
      .dsh-opencode-quota__chip {
        display: inline-flex;
        align-items: center;
        /* The toolbar row aligns on the text baseline; both of these keep the
           rings on the same optical line as the neighbouring labels. */
        align-self: center;
        vertical-align: middle;
        gap: 8px;
        box-sizing: border-box;
        height: 28px;
        margin: 0;
        padding: 0 10px;
        font: inherit;
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        border: 0;
        border-radius: var(--dsw-radius-sm, 8px);
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        transition: background-color 120ms ease;
      }
      .dsh-opencode-quota__chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .dsh-opencode-quota__chip:active { background: var(--dsw-alias-interactive-bg-active); }
      .dsh-opencode-quota__mark {
        width: 6px; height: 6px; flex: none; border-radius: 50%;
        background: var(--dsw-alias-state-success-primary);
      }
      .dsh-opencode-quota__mark--warn { background: var(--dsw-alias-state-warn-primary); }
      .dsh-opencode-quota__mark--danger { background: var(--dsw-alias-state-error-primary); }
      .dsh-opencode-quota__mark--idle { background: var(--dsw-alias-state-idle-primary); }
      .dsh-opencode-quota__label {
        font-weight: 500; color: var(--dsw-alias-label-primary);
      }
      .dsh-opencode-quota__cells {
        display: inline-flex; align-items: center; gap: 9px; overflow: hidden;
      }
      .dsh-opencode-quota__win {
        display: inline-flex; align-items: center; gap: 4px; line-height: 1;
      }
      .dsh-opencode-quota__short {
        /* Same 12px as the shipped .sm toolbar text: a fractional size renders
           with different hinting and reads as a different font. */
        font-size: 12px;
        line-height: 1;
        font-weight: 400;
        letter-spacing: normal;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-opencode-quota__cell {
        font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary);
      }
      /* Ring = share of the window still left; the exact figure is in the title.
         A 1.2px minimum arc keeps a 0% window visible as a rounded cap. */
      .dsh-opencode-quota__ring {
        width: 12px; height: 12px; flex: none; display: block;
      }
      .dsh-opencode-quota__ringTrack {
        stroke: var(--dsw-alias-border-l1);
      }
      .dsh-opencode-quota__ringValue {
        stroke: var(--dsw-alias-state-success-primary);
        transition: stroke-dasharray 220ms ease;
      }
      .dsh-opencode-quota__ringValue--warn { stroke: var(--dsw-alias-state-warn-primary); }
      .dsh-opencode-quota__ringValue--danger { stroke: var(--dsw-alias-state-error-primary); }
      .dsh-opencode-quota__ringValue--idle { stroke: var(--dsw-alias-state-idle-primary); }
      .dsh-opencode-quota__dialog {
        width: min(440px, calc(100vw - 48px));
        max-height: calc(100vh - 48px);
        box-sizing: border-box;
        margin: auto;
        padding: 0;
        overflow: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: var(--dsw-radius-panel, 12px);
        background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-overlay));
        color: var(--dsw-alias-label-primary);
        box-shadow: var(--dsw-elevation-prominent, 0 18px 50px rgba(0, 0, 0, 0.28));
        pointer-events: auto;
        font: inherit;
      }
      .dsh-opencode-quota__dialog::backdrop {
        background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.34));
      }
      .dsh-opencode-quota__body { padding: 20px 22px 4px; }
      .dsh-opencode-quota__title { margin: 0 0 6px; font-size: 16px; font-weight: 600; line-height: 1.35; }
      .dsh-opencode-quota__lead {
        margin: 0 0 4px; font-size: 12.5px; line-height: 1.55;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-opencode-quota__readAt { margin: 0 0 14px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
      .dsh-opencode-quota__account {
        margin: 0 0 10px; padding: 12px 14px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
      }
      .dsh-opencode-quota__accountHead {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; font-size: 13px; font-weight: 500;
      }
      .dsh-opencode-quota__status { font-size: 11.5px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
      .dsh-opencode-quota__note {
        margin: 8px 0 0; font-size: 12px; line-height: 1.55;
        color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere;
      }
      .dsh-opencode-quota__window { margin-top: 10px; }
      .dsh-opencode-quota__windowHead {
        display: flex; align-items: baseline; justify-content: space-between;
        gap: 10px; font-size: 12px;
      }
      .dsh-opencode-quota__windowName { color: var(--dsw-alias-label-secondary); }
      .dsh-opencode-quota__windowState { color: var(--dsw-alias-state-warn-primary); }
      .dsh-opencode-quota__windowValue { font-variant-numeric: tabular-nums; }
      .dsh-opencode-quota__windowValue--danger { color: var(--dsw-alias-state-error-primary); }
      .dsh-opencode-quota__windowValue--warn { color: var(--dsw-alias-state-warn-primary); }
      .dsh-opencode-quota__bar {
        height: 4px; margin: 5px 0 3px; border-radius: 999px;
        background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-border-l1));
        overflow: hidden;
      }
      .dsh-opencode-quota__barFill {
        height: 100%; border-radius: 999px;
        background: var(--dsw-alias-state-success-primary);
      }
      .dsh-opencode-quota__barFill--warn { background: var(--dsw-alias-state-warn-primary); }
      .dsh-opencode-quota__barFill--danger { background: var(--dsw-alias-state-error-primary); }
      .dsh-opencode-quota__windowFoot { margin: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .dsh-opencode-quota__actions {
        display: flex; justify-content: flex-end; gap: 8px; padding: 8px 22px 18px;
      }
      .dsh-opencode-quota__button {
        appearance: none; padding: 6px 13px; font: inherit; font-size: 12.5px;
        line-height: 1.3; color: var(--dsw-alias-label-primary);
        background: transparent; border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 8px; cursor: pointer;
      }
      .dsh-opencode-quota__button:hover { background: var(--dsw-alias-bg-layer-1); }
      .dsh-opencode-quota__button:disabled { opacity: 0.55; cursor: default; }
      .dsh-opencode-quota__button:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
      }
      .dsh-opencode-quota__link {
        color: var(--dsw-alias-brand-primary); text-decoration: none;
      }
      .dsh-opencode-quota__link:hover { text-decoration: underline; }
    `

    /**
     * Minimal observable snapshot store.
     * @param {unknown} initial - Initial snapshot.
     */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set(next) {
          if (Object.is(next, value)) return
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    const INITIAL = Object.freeze({
      loaded: false,
      loading: false,
      accounts: [],
      readAt: null,
      error: null,
    })

    /** Display names for routes whose registry name is the bare id. */
    const PROVIDER_LABEL = { 'opencode-go': 'OpenCode Go', opencode: 'OpenCode Zen' }

    /** Severity of one remaining percentage. */
    function severityOf(remainingPercent) {
      if (remainingPercent <= 5) return 'danger'
      if (remainingPercent <= 20) return 'warn'
      return 'ok'
    }

    /** Worst severity across one account's windows. */
    function accountSeverity(account) {
      const windows = Array.isArray(account?.windows) ? account.windows : []
      if (account?.status !== 'ok' || windows.length === 0) {
        return account?.status === 'console-only' ? 'idle' : 'warn'
      }
      let worst = 'ok'
      for (const window of windows) {
        const severity = severityOf(window.remainingPercent)
        if (severity === 'danger') return 'danger'
        if (severity === 'warn') worst = 'warn'
      }
      return worst
    }

    const RING_RADIUS = 5.5
    const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
    /** Smallest arc that still reads as a rounded cap, in path units. */
    const RING_MIN_ARC = 1.2

    /**
     * One window's remaining share as a rounded-cap arc.
     * @param {{ remainingPercent: number }} props - Window share still left.
     */
    function Ring(props) {
      const severity = severityOf(props.remainingPercent)
      const share = Math.min(100, Math.max(0, props.remainingPercent)) / 100
      const arc = Math.max(RING_MIN_ARC, RING_CIRCUMFERENCE * share)
      return h(
        'svg',
        {
          className: 'dsh-opencode-quota__ring',
          viewBox: '0 0 14 14',
          width: 12,
          height: 12,
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('circle', {
          cx: 7, cy: 7, r: RING_RADIUS, fill: 'none', strokeWidth: 2,
          className: 'dsh-opencode-quota__ringTrack',
        }),
        h('circle', {
          cx: 7, cy: 7, r: RING_RADIUS, fill: 'none', strokeWidth: 2, strokeLinecap: 'round',
          strokeDasharray: `${arc} ${RING_CIRCUMFERENCE}`,
          className: `dsh-opencode-quota__ringValue${severity === 'ok' ? '' : ` dsh-opencode-quota__ringValue--${severity}`}`,
          transform: 'rotate(-90 7 7)',
        }),
      )
    }

    /**
     * Compact allowance chip in the composer tool row. Clicking opens the
     * detail dialog; the chip itself stays read-only.
     */
    function QuotaChip(props) {
      const quota = props.useQuota(value => value)
      // Exactly one automatic attempt per mount. Re-running on failure would
      // spin: a failed read never sets `loaded`, so every state change would
      // fire another request and keep the Host busy.
      const attempted = React.useRef(false)
      React.useEffect(() => {
        if (attempted.current || quota.loaded) return
        attempted.current = true
        props.refresh()
      }, [quota.loaded, props.refresh])

      const accounts = Array.isArray(quota.accounts) ? quota.accounts : []
      const primary = accounts.find(account => account.status === 'ok') ?? accounts[0]
      const failed = primary === undefined && quota.error !== null
      if (primary === undefined && !failed) return null

      // A failed reading keeps the chip visible: an invisible error would look
      // like "no OpenCode provider configured" instead of a broken call.
      const severity = failed ? 'danger' : accountSeverity(primary)
      const windows = primary !== undefined && Array.isArray(primary.windows) ? primary.windows : []
      let text
      if (failed) {
        text = props.t('chip.error')
      } else if (primary.status === 'ok') {
        text = null
      } else if (primary.status === 'console-only') {
        text = props.t('chip.consoleOnly')
      } else if (primary.status === 'unconfigured') {
        text = props.t('chip.unconfigured')
      } else if (primary.status === 'unauthorized') {
        text = props.t('chip.unauthorized')
      } else {
        text = props.t('chip.error')
      }
      const detail = failed
        ? String(quota.error)
        : primary.status === 'ok'
          ? windows.map(window => `${props.t(`window.${window.key}`)} ${Math.round(window.remainingPercent)}%`).join(' · ')
          : text

      // The style element rides with the chip: the dialog carries its own copy,
      // and a Client half must not append to the document outside its component.
      const cells = []
      if (text === null) {
        windows.forEach((window) => {
          cells.push(h(
            'span',
            { key: window.key, className: 'dsh-opencode-quota__win' },
            h(Ring, { remainingPercent: window.remainingPercent }),
            h('span', { className: 'dsh-opencode-quota__short' }, props.t(`window.short.${window.key}`)),
          ))
        })
      } else {
        cells.push(h('span', {
          key: 'status',
          className: 'dsh-opencode-quota__cell',
        }, text))
      }

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-opencode-quota__chip',
            title: props.t('chip.title', { detail }),
            'aria-label': props.t('chip.title', { detail }),
            onClick: props.toggle,
          },
          // Rings already carry the severity, so the dot and the provider name
          // appear only when there is no number to read.
          text === null
            ? null
            : h('span', { className: `dsh-opencode-quota__mark dsh-opencode-quota__mark--${severity}` }),
          text === null
            ? null
            : h('span', { className: 'dsh-opencode-quota__label' }, props.t('chip.label')),
          h('span', { className: 'dsh-opencode-quota__cells' }, ...cells),
        ),
      )
    }

    /** Format one ISO timestamp for the current locale, or an empty string. */
    function formatTime(value) {
      const date = new Date(value)
      return Number.isFinite(date.getTime()) ? date.toLocaleString() : ''
    }

    /** One allowance window row inside the dialog. */
    function WindowRow(props) {
      const severity = severityOf(props.window.remainingPercent)
      const status = props.window.status === 'ok'
        ? null
        : props.t(props.window.status === 'rate-limited' ? 'window.rateLimited' : 'window.statusOther', {
          status: props.window.status,
        })
      return h(
        'div',
        { className: 'dsh-opencode-quota__window' },
        h('div', { className: 'dsh-opencode-quota__windowHead' },
          h('span', { className: 'dsh-opencode-quota__windowName' },
            props.t(`window.${props.window.key}`),
            status === null ? null : h('span', { className: 'dsh-opencode-quota__windowState' }, ` · ${status}`)),
          h('span', {
            className: `dsh-opencode-quota__windowValue${severity === 'ok' ? '' : ` dsh-opencode-quota__windowValue--${severity}`}`,
          }, props.t('dialog.remaining', { percent: Math.round(props.window.remainingPercent) })),
        ),
        // The bar reads as the share still available, matching the label above.
        h('div', { className: 'dsh-opencode-quota__bar' },
          h('div', {
            className: `dsh-opencode-quota__barFill${severity === 'ok' ? '' : ` dsh-opencode-quota__barFill--${severity}`}`,
            style: { width: `${Math.min(100, Math.max(1, props.window.remainingPercent))}%` },
          })),
        props.window.resetsAt === null
          ? null
          : h('p', { className: 'dsh-opencode-quota__windowFoot' },
            props.t('dialog.resets', { time: formatTime(props.window.resetsAt) })),
      )
    }

    /** One account block: provider name, status, and its windows. */
    function AccountBlock(props) {
      const account = props.account
      const windows = Array.isArray(account.windows) ? account.windows : []
      let note = null
      if (account.status === 'ok') {
        note = null
      } else if (account.status === 'console-only') {
        note = props.t('dialog.status.consoleOnly')
      } else if (account.status === 'unconfigured') {
        note = props.t('dialog.status.unconfigured', { provider: account.provider, ref: account.keyRef })
      } else if (account.status === 'unauthorized') {
        note = props.t('dialog.status.unauthorized', { provider: account.provider })
      } else if (account.status === 'timeout') {
        note = props.t('dialog.status.timeout')
      } else {
        note = props.t('dialog.status.error', { message: account.message ?? account.status })
      }

      return h(
        'div',
        { className: 'dsh-opencode-quota__account' },
        h('div', { className: 'dsh-opencode-quota__accountHead' },
          h('span', null, PROVIDER_LABEL[account.provider] ?? account.name ?? account.provider),
          account.status === 'ok' ? null : h('span', { className: 'dsh-opencode-quota__status' }, account.status)),
        note === null ? null : h('p', { className: 'dsh-opencode-quota__note' }, note),
        ...windows.map(window => h(WindowRow, { key: `${account.provider}:${window.key}`, t: props.t, window })),
        account.status === 'console-only'
          ? h('p', { className: 'dsh-opencode-quota__note' },
            h('a', {
              className: 'dsh-opencode-quota__link',
              href: 'https://opencode.ai/console',
              target: '_blank',
              rel: 'noreferrer noopener',
            }, 'opencode.ai/console'))
          : null,
      )
    }

    /**
     * Last-resort boundary: a render bug must show an explanation instead of
     * silently rendering nothing, which reads to the user as "the click did
     * nothing".
     */
    class DialogBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error === null) return this.props.children
        return h(
          'div',
          { className: 'dsh-opencode-quota__account', role: 'alert' },
          h('p', { className: 'dsh-opencode-quota__note' },
            `${this.props.t('dialog.crashed')}: ${this.state.error?.message ?? this.state.error}`),
          h('button', {
            type: 'button',
            className: 'dsh-opencode-quota__button',
            onClick: this.props.close,
          }, this.props.t('dialog.close')),
        )
      }
    }

    /** Native modal dialog listing every configured OpenCode account. */
    function QuotaDialog(props) {
      const quota = props.useQuota(value => value)
      const dialogRef = React.useRef(null)
      const requested = React.useRef(false)

      React.useEffect(() => {
        const dialog = dialogRef.current
        if (dialog === null) return undefined
        if (!dialog.open) dialog.showModal()
        const handleCancel = (event) => {
          event.preventDefault()
          props.close()
        }
        dialog.addEventListener('cancel', handleCancel)
        return () => {
          dialog.removeEventListener('cancel', handleCancel)
          if (dialog.open) dialog.close()
        }
      }, [props.close])

      React.useEffect(() => {
        if (requested.current) return
        requested.current = true
        props.refresh()
      }, [props.refresh])

      const accounts = Array.isArray(quota.accounts) ? quota.accounts : []
      const onClick = (event) => {
        if (event.target !== event.currentTarget) return
        props.close()
      }

      return h(
        'dialog',
        {
          ref: dialogRef,
          className: 'dsh-opencode-quota__dialog',
          'aria-labelledby': 'dsh-opencode-quota-title',
          onClick,
        },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-opencode-quota__body' },
          h('h2', { id: 'dsh-opencode-quota-title', className: 'dsh-opencode-quota__title' }, props.t('dialog.title')),
          h('p', { className: 'dsh-opencode-quota__lead' }, props.t('dialog.lead')),
          h('p', { className: 'dsh-opencode-quota__readAt' },
            quota.readAt === null ? (quota.loading ? props.t('dialog.loading') : '') : props.t('dialog.readAt', { time: formatTime(quota.readAt) })),
          quota.error === null
            ? null
            : h('p', { role: 'alert', className: 'dsh-opencode-quota__note' }, props.t('dialog.error', { message: quota.error })),
          accounts.length === 0
            ? h('p', { className: 'dsh-opencode-quota__note' }, props.t('dialog.none'))
            : accounts.map(account => h(AccountBlock, { key: account.provider, t: props.t, account })),
        ),
        h(
          'div',
          { className: 'dsh-opencode-quota__actions' },
          h('button', {
            type: 'button',
            className: 'dsh-opencode-quota__button',
            disabled: quota.loading,
            onClick: () => void props.refresh(),
          }, quota.loading ? props.t('dialog.inFlight') : props.t('dialog.refresh')),
          h('button', {
            type: 'button',
            className: 'dsh-opencode-quota__button',
            onClick: props.close,
          }, props.t('dialog.close')),
        ),
      )
    }

    return {
      inject: ['connection', 'slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'opencode-quota: dictionaries')

        const t = ctx.locale.bind(NS)
        const quotaStore = createStore(INITIAL)
        const openStore = createStore(false)
        let refreshing = false

        /** Call the Host allowance endpoint through the generic Connection RPC. */
        const read = async () => {
          const envelope = await ctx.connection.rpc.call('/api', 'opencodeQuota/read', { args: {} })
          if (!envelope.ok) {
            throw Object.assign(new Error(envelope.error?.message ?? ''), { code: envelope.error?.code })
          }
          const result = envelope.value
          if (result === null || typeof result !== 'object' || result.ok !== true) {
            throw Object.assign(new Error(result?.error?.message ?? ''), { code: result?.error?.code })
          }
          return result.value ?? {}
        }

        const refresh = async () => {
          if (refreshing) return
          refreshing = true
          quotaStore.set({ ...quotaStore.getSnapshot(), loading: true, error: null })
          try {
            const value = await read()
            quotaStore.set({
              loaded: true,
              loading: false,
              accounts: Array.isArray(value.accounts) ? value.accounts : [],
              readAt: typeof value.readAt === 'string' ? value.readAt : null,
              error: null,
            })
          } catch (error) {
            quotaStore.set({
              ...quotaStore.getSnapshot(),
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            })
          } finally {
            refreshing = false
          }
        }

        const toggle = () => {
          const next = !openStore.getSnapshot()
          openStore.set(next)
          if (next) void refresh()
        }
        const close = () => openStore.set(false)

        // One shared poll keeps both surfaces current; the Host also caches.
        ctx.effect(() => {
          const timer = setInterval(() => { void refresh() }, 60_000)
          return () => clearInterval(timer)
        }, 'opencode-quota: refresh timer')

        // Left group: it renders right after the permission control, which is
        // where the chip reads best (the right group hugs the model selector).
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'opencode-quota',
          order: 20,
          locale: NS,
          inject: () => ({
            hooks: { quota: quotaStore },
            refresh,
            toggle,
          }),
        }, QuotaChip))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'opencode-quota-dialog',
          order: 850,
          locale: NS,
          inject: () => ({
            hooks: { quota: quotaStore, open: openStore },
            refresh,
            close,
          }),
        }, function OverlayQuotaDialog(props) {
          const open = props.useOpen(value => value)
          if (!open) return null
          return h(DialogBoundary, { t: props.t, close: props.close }, h(QuotaDialog, props))
        }))
      },
    }
  },
})