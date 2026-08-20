// tktrim.js — Token Trimmer Dynamic Cordis Plugin
//
// Suppresses the runtime-context snapshot on every model step.
// One-line plugin, immediate token savings (~200-400 tokens/turn).

return {
  apply(ctx) {
    const sp = ctx.get('systemPrompt')
    if (sp === undefined) return
    ctx.effect(() => sp.suppressRuntimeContext())
  },
}