// tokdash.js — Token Dashboard Dynamic Cordis Plugin (Host half)
//
// Intercepts llm/stream to count tokens, exposes via harness.handle RPC.
// Client half polls and renders a live counter under the composer.

return {
  apply(ctx) {
    let stats = { input: 0, output: 0 }

    harness.handle('token-stats', async () => {
      return { ...stats }
    })

    ctx.on('llm/stream', async function* (options, next) {
      const stream = next()
      let inputTokens = 0
      let outputTokens = 0

      if (Array.isArray(options.messages)) {
        for (const msg of options.messages) {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '')
          inputTokens += Math.ceil(content.length / 4)
        }
      }

      for await (const chunk of stream) {
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }
        if (chunk.choices?.[0]?.delta?.content) {
          outputTokens += Math.ceil(chunk.choices[0].delta.content.length / 4)
        }
        yield chunk
      }

      stats.input += inputTokens
      stats.output += outputTokens
    })
  },
}